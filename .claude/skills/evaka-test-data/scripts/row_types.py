#!/usr/bin/env python3
"""Print the JSON shape of eVaka MCP `insert_rows` row types, read from the eVaka repo
at the commit that is deployed (appCommit from get_environment_info).

The MCP server deserializes each row into a Kotlin class (Dev* fixture classes). This script
reads those classes straight from git, so it never goes stale.

Usage:
  python3 row_types.py --repo ~/evaka --commit <appCommit>            # list all row types
  python3 row_types.py --repo ~/evaka --commit <appCommit> placement absence
  python3 row_types.py ... --depth 2 child_document                   # also expand nested types
  python3 row_types.py ... --class DevPerson                          # any Kotlin class/enum

Stdlib only. Needs `git` and a clone of espoon-voltti/evaka that contains the commit
(run `git fetch origin` first if the commit is missing).
"""
import argparse
import os
import re
import subprocess
import sys

ROWS_FILE = "service/src/main/kotlin/evaka/core/mcp/McpToolsRows.kt"
KOTLIN_ROOT = "service/src/main/kotlin"
SIMPLE = {
    "String", "Int", "Long", "Boolean", "Double", "BigDecimal", "UUID", "LocalDate", "LocalTime",
    "HelsinkiDateTime", "List", "Set", "Map", "Collection", "Any", "JsonNode", "Nothing",
    "DateRange", "FiniteDateRange", "TimeRange", "DateSet", "Id", "YearMonth",
}
FORMAT_NOTES = {
    "HelsinkiDateTime": 'ISO-8601 timestamp with offset, e.g. "2026-10-05T08:00:00+03:00"',
    "LocalDate": '"YYYY-MM-DD"',
    "LocalTime": '"HH:MM" (seconds must be 0 in attendance tables)',
    "TimeRange": '{"start": "HH:MM", "end": "HH:MM"} (end exclusive, start < end)',
    "DateRange": '{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD" | null}',
    "FiniteDateRange": '{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} (both inclusive)',
    "DateSet": '[{"start": ..., "end": ...}, ...] list of FiniteDateRanges',
    "*Id": "uuid string (EvakaUserId of a citizen = person id, of an employee = employee id, "
           "system = 00000000-0000-0000-0000-000000000000)",
    "BigDecimal": "number or numeric string",
}


def git(repo, *args):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.strip()}\n"
                 "Hint: run `git fetch origin` in the eVaka repo, the commit may be newer than your clone.")
    return r.stdout


def show(repo, commit, path):
    return git(repo, "show", f"{commit}:{path}")


def row_types(repo, commit):
    src = show(repo, commit, ROWS_FILE)
    result = []
    for m in re.finditer(r'row<([\w.]+)>\(\s*"(\w+)"(?:\s*,\s*("?\w+"?|null))?', src):
        cls, typ, table = m.group(1), m.group(2), m.group(3)
        result.append((typ, cls.split(".")[-1], (table or f'"{typ}"').strip('"')))
    # nested classes declared inside McpToolsRows (e.g. DaycareAclRow)
    return result, src


def _grep(repo, commit, name, where):
    # data classes and enums first; a bare `sealed class X : DatabaseTable` (id marker) is useless
    for pattern in (rf"(data class|enum class) {name}\b", rf"(sealed class|class) {name}\b *[(<{{]"):
        r = subprocess.run(["git", "-C", repo, "grep", "-l", "-E", pattern, commit, "--", where],
                           capture_output=True, text=True)
        paths = [line.split(":", 1)[1] for line in r.stdout.splitlines() if line]
        if paths:
            paths.sort(key=lambda p: ("/shared/dev/" not in p, len(p)))
            return paths[0]
    return None


def find_decl(repo, commit, name, ctx_path, ctx_text):
    """Resolve a Kotlin type name like the compiler would: same file, explicit import,
    same package, then anywhere. Returns (path, file text)."""
    if ctx_text and re.search(rf"(data class|enum class|sealed class) {name}\b", ctx_text):
        return ctx_path, ctx_text
    candidates = []
    if ctx_text:
        m = re.search(rf"^import ([\w.]+)\.{name}$", ctx_text, re.M)
        if m:
            candidates.append(f"{KOTLIN_ROOT}/{m.group(1).replace('.', '/')}/")
    if ctx_path:
        candidates.append(ctx_path.rsplit("/", 1)[0] + "/")
    candidates.append(KOTLIN_ROOT)
    for where in candidates:
        path = _grep(repo, commit, name, where)
        if path:
            return path, show(repo, commit, path)
    return None, None


def extract_block(text, name):
    m = (re.search(rf"(@\w+(?:\([^)]*\))?\s*)*(data class|enum class) {name}\b", text)
         or re.search(rf"(@\w+(?:\([^)]*\))?\s*)*(sealed class|class) {name}\b", text))
    if not m:
        return None
    start = m.start()
    i = m.end()
    kind = m.group(2)
    # find end: balanced parens of the primary constructor, or braces of an enum body
    if kind == "enum class":
        j = text.index("{", i)
        depth, k = 0, j
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        body = re.sub(r"/\*.*?\*/|//[^\n]*", "", text[j + 1:k], flags=re.S)
        entries_part = body.split(";")[0]
        # drop constructor args of entries: NAME(...)
        entries, depth, cur = [], 0, ""
        for ch in entries_part:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == "," and depth == 0:
                entries.append(cur)
                cur = ""
                continue
            if depth == 0 and ch not in "()":
                cur += ch
        entries.append(cur)
        names = [re.sub(r"@\w+(\([^)]*\))?", "", e).strip().split()[0] for e in entries
                 if re.sub(r"@\w+(\([^)]*\))?", "", e).strip()]
        names = [n for n in names if re.match(r"^[A-Z0-9_]+$", n)]
        return f"enum {name}: " + " | ".join(names)
    if kind == "sealed class":
        # polymorphic type: show the whole declaration incl. nested subtypes and @JsonTypeName
        j = text.find("{", i)
        nl = text.find("\n", i)
        if j == -1 or j > nl:
            # subtypes declared elsewhere in the file: show every `: Name(` subclass
            subs = [mm.start() for mm in re.finditer(rf"\) *: *{name}\b|: *{name}\(", text)]
            return text[start:nl] + ("\n  // subtypes in same file: grep ': " + name + "'" if subs else "")
        depth, k = 0, j
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        lines = text[start:k + 1].splitlines()
        if len(lines) > 160:
            lines = lines[:160] + ["    ... (truncated, read the file for the rest)"]
        return "\n".join(lines)
    j = text.find("(", i)
    if j == -1 or text[i:j].strip() not in ("", ) and "<" not in text[i:j]:
        return text[start:text.find("\n", i)]
    depth, k = 0, j
    while k < len(text):
        if text[k] == "(":
            depth += 1
        elif text[k] == ")":
            depth -= 1
            if depth == 0:
                break
        k += 1
    return text[start:k + 1]


def referenced_types(block):
    names = set()
    for m in re.finditer(r":\s*([A-Z][\w.]*)(<[^=\n]*>)?", block):
        names.add(m.group(1).split(".")[-1])
        if m.group(2):
            names.update(re.findall(r"\b([A-Z]\w+)\b", m.group(2)))
    return {n for n in names if n not in SIMPLE and not n.endswith("Id")}


def describe(repo, commit, name, depth, seen, ctx_path, ctx_text, out):
    if name in seen:
        return
    seen.add(name)
    path, text = find_decl(repo, commit, name, ctx_path, ctx_text)
    if not text:
        out.append(f"// {name}: declaration not found (library type?)")
        return
    block = extract_block(text, name)
    if not block:
        out.append(f"// {name}: could not parse in {path}")
        return
    out.append(f"// {path}\n{block}\n")
    if depth > 0 and not block.startswith("enum"):
        for ref in sorted(referenced_types(block)):
            describe(repo, commit, ref, depth - 1, seen, path, text, out)


# ----------------------------------------------------------------------------- payload check


def split_top(params):
    parts, depth, cur = [], 0, ""
    for ch in params:
        if ch in "(<[{":
            depth += 1
        elif ch in ")>]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return parts


def parse_fields(block):
    """[(json_name, type, nullable, has_default)] of a data class primary constructor."""
    if not block or block.startswith("enum") or "(" not in block:
        return None
    m = re.search(r"\bclass \w+\s*\(", block)
    if not m:
        return None
    body = re.sub(r"//[^\n]*", "", block[m.end():block.rindex(")")])
    fields = []
    for part in split_top(body):
        rename = re.search(r'@(?:get:|field:|param:)?JsonProperty\("(\w+)"\)', part)
        clean = re.sub(r"@[\w:.]+(\([^)]*\))?", "", part).strip()
        m = re.match(r"(?:override\s+)?(?:val|var)\s+(\w+)\s*:\s*(.+?)\s*(=\s*.+)?$", clean, re.S)
        if not m:
            continue
        typ = " ".join(m.group(2).split())
        fields.append((rename.group(1) if rename else m.group(1), typ, typ.endswith("?"), m.group(3) is not None))
    return fields


class Checker:
    def __init__(self, repo, commit):
        self.repo, self.commit, self.cache = repo, commit, {}
        self.types, self.rows_src = row_types(repo, commit)

    def cls(self, name, ctx_path, ctx_text):
        key = (name, ctx_path)
        if key not in self.cache:
            path, text = find_decl(self.repo, self.commit, name, ctx_path, ctx_text)
            block = extract_block(text, name) if text else None
            self.cache[key] = (path, text, block)
        return self.cache[key]

    def check(self, obj, name, ctx_path, ctx_text, where, problems, depth=0):
        path, text, block = self.cls(name, ctx_path, ctx_text)
        if block is None or block.startswith("enum"):
            return
        if re.search(rf"sealed class {name}\b", block.split("{")[0] if "{" in block else block):
            # polymorphic: pick the subtype named by the discriminator ("type") via @JsonTypeName
            subtypes = dict(re.findall(r'@JsonTypeName\("(\w+)"\)\s*(?:@\w+\s*)*data class (\w+)', text))
            disc = obj.get("type")
            if disc is None or not subtypes:
                return
            if disc not in subtypes:
                problems.append(f"{where}: type '{disc}' is not one of {', '.join(subtypes)}")
                return
            sub = subtypes[disc]
            sub_block = extract_block(text, sub)
            self.cache[(sub, path)] = (path, text, sub_block)
            obj = {k: v for k, v in obj.items() if k != "type"}
            name, block = sub, sub_block
        fields = parse_fields(block)
        if not fields:
            return
        known = {f[0]: f for f in fields}
        for k in obj:
            if k not in known:
                import difflib
                close = difflib.get_close_matches(k, list(known), n=2, cutoff=0.6)
                problems.append(f"{where}: unknown field '{k}' is IGNORED by the server"
                                + (f" (did you mean {', '.join(close)}?)" if close else ""))
        for fname, typ, nullable, has_default in fields:
            if fname not in obj and not has_default and not nullable:
                problems.append(f"{where}: required field '{fname}: {typ}' missing")
            if fname not in obj and has_default and re.search(r"\d{4}, *\d+, *\d+", block.split(fname, 1)[1].split("\n")[0]):
                problems.append(f"{where}: '{fname}' omitted -> uses a hard-coded test default date "
                                "(e.g. 2019); set it explicitly")
            v = obj.get(fname)
            if depth > 4 or v is None:
                continue
            base = typ.rstrip("?")
            inner = re.match(r"(?:List|Set|Collection)<\s*(\w+)(?:<[^>]*>)?\s*\??>", base)
            if isinstance(v, dict) and re.match(r"^[A-Z]\w*$", base) and base not in SIMPLE and not base.endswith("Id"):
                self.check(v, base, path, text, f"{where}.{fname}", problems, depth + 1)
            elif isinstance(v, list) and inner and inner.group(1) not in SIMPLE:
                for i, item in enumerate(v):
                    if isinstance(item, dict):
                        self.check(item, inner.group(1), path, text, f"{where}.{fname}[{i}]", problems, depth + 1)
            elif isinstance(v, str) and base == "HelsinkiDateTime" and not re.search(r"(Z|[+-]\d\d:\d\d)$", v):
                problems.append(f"{where}.{fname}: timestamp '{v}' has no offset")

    def run(self, payload):
        by_type = {t: c for t, c, _ in self.types}
        problems = []
        for gi, group in enumerate(payload.get("rows", [])):
            t = group.get("type")
            if t not in by_type:
                if t != "__rollback__":
                    problems.append(f"group {gi}: unknown row type '{t}'")
                continue
            for ri, row in enumerate(group.get("rows", [])):
                self.check(row, by_type[t], ROWS_FILE, self.rows_src, f"{t}[{ri}]", problems)
        return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("types", nargs="*", help="row types (e.g. placement) to describe; omit to list all")
    ap.add_argument("--repo", default=os.environ.get("EVAKA_REPO", "."), help="eVaka git clone (env EVAKA_REPO)")
    ap.add_argument("--commit", default="HEAD", help="appCommit from get_environment_info")
    ap.add_argument("--depth", type=int, default=1, help="how deep to expand referenced classes/enums")
    ap.add_argument("--check", metavar="PAYLOAD_JSON",
                    help="check an insert_rows payload file: unknown/misspelled and missing fields")
    ap.add_argument("--class", dest="classes", action="append", default=[], help="describe any Kotlin class")
    a = ap.parse_args()

    if a.check:
        import json
        payload = json.load(open(a.check, encoding="utf-8"))
        problems = Checker(a.repo, a.commit).run(payload)
        # collapse repeated messages (same problem on many rows)
        counts = {}
        for p in problems:
            key = re.sub(r"\[\d+\]", "[*]", p)
            counts[key] = counts.get(key, 0) + 1
        for k, n in counts.items():
            print(f"{k}" + (f"  (x{n})" if n > 1 else ""))
        print(f"{len(problems)} problem(s) in {sum(len(g.get('rows', [])) for g in payload.get('rows', []))} rows")
        sys.exit(1 if problems else 0)
    types, rows_src = row_types(a.repo, a.commit)
    if not a.types and not a.classes:
        print(f"insert_rows row types at {a.commit[:12]} (type -> Kotlin class -> tracked table):")
        for t, c, tab in types:
            print(f"  {t:32} {c:34} {tab}")
        print("\nValue formats:")
        for k, v in FORMAT_NOTES.items():
            print(f"  {k:18} {v}")
        return
    by_type = {t: c for t, c, _ in types}
    out = []
    seen = set()
    for t in a.types:
        if t not in by_type:
            sys.exit(f"Unknown row type {t}. Known: {', '.join(by_type)}")
        out.append(f"===== row type '{t}' -> {by_type[t]} =====")
        describe(a.repo, a.commit, by_type[t], a.depth, seen, ROWS_FILE, rows_src, out)
    for c in a.classes:
        out.append(f"===== class {c} =====")
        describe(a.repo, a.commit, c, a.depth, seen, None, None, out)
    print("\n".join(out))
    print("Fields with a default value (`= ...`) may be omitted; all others are required.\n"
          "Unknown JSON fields are silently IGNORED (Jackson 3): a misspelled field falls back to its default.")


if __name__ == "__main__":
    main()
