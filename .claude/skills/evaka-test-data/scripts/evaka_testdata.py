"""Helpers for building eVaka MCP `insert_rows` payloads. Python 3.9+, stdlib only.

Deliberately thin: rows are plain dicts in the JSON shape of the Kotlin Dev* classes, so a
field added or renamed in eVaka never needs a change here. Look the shapes up with
row_types.py (it reads the deployed commit), then build rows with `Rows.add(type, **fields)`.

    import sys; sys.path.insert(0, "<skill dir>/scripts")
    from evaka_testdata import *

    rows = Rows()
    unit = rows.add("daycare", id=uid(), name="Päiväkoti Testi", areaId=AREA, ...)["id"]
    ...
    rows.write("payload.json", batch="my-scenario")                 # real insert
    rows.write("validate.json", batch="my-scenario", rollback=True) # validate only, saves nothing
    # then: create_upload_url (MCP) -> post_upload(url, "validate.json")
"""
import json
import random
import subprocess
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Helsinki")
SYSTEM_USER = "00000000-0000-0000-0000-000000000000"  # evaka_user id of the system ("eVaka")
ROLLBACK_SENTINEL = "__rollback__"  # unknown row type -> insert_rows fails at the end -> nothing saved

# ----------------------------------------------------------------------------- basics


def uid() -> str:
    return str(uuid.uuid4())


def D(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def T(value) -> time:
    return value if isinstance(value, time) else time.fromisoformat(value)


def hdt(d, t="12:00") -> str:
    """HelsinkiDateTime JSON: ISO timestamp WITH offset (+03:00 summer / +02:00 winter)."""
    return datetime.combine(D(d), T(t), TZ).isoformat()


def hm(t) -> str:
    """LocalTime JSON as HH:MM (attendance tables reject non-zero seconds)."""
    return T(t).strftime("%H:%M")


def add_minutes(t, minutes: int) -> time:
    return (datetime.combine(date(2000, 1, 1), T(t)) + timedelta(minutes=minutes)).time()


def time_range(start, end) -> dict:
    return {"start": hm(start), "end": hm(end)}


def date_range(start, end=None) -> dict:
    """DateRange (end may be None) / FiniteDateRange (both set). Both are inclusive."""
    return {"start": D(start).isoformat(), "end": None if end is None else D(end).isoformat()}


def days(start, end):
    d = D(start)
    while d <= D(end):
        yield d
        d += timedelta(days=1)


def _easter(year: int) -> date:
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    return date(year, month, (h + l_ - 7 * m + 114) % 31 + 1)


def finnish_holidays(year: int) -> set:
    """Weekday public holidays when municipal daycare is normally closed (eVaka itself reads
    holidays from its own table; this is only for generating realistic attendance)."""
    e = _easter(year)
    midsummer_eve = next(date(year, 6, d) for d in range(19, 26) if date(year, 6, d).weekday() == 4)
    all_saints = next(date(year, 10, 31) + timedelta(days=i) for i in range(7)
                      if (date(year, 10, 31) + timedelta(days=i)).weekday() == 5)
    return {date(year, 1, 1), date(year, 1, 6), e - timedelta(days=2), e + timedelta(days=1),
            date(year, 5, 1), e + timedelta(days=39), midsummer_eve, all_saints,
            date(year, 12, 6), date(year, 12, 24), date(year, 12, 25), date(year, 12, 26)}


def workdays(start, end, skip=()):
    """Mon-Fri between start and end (inclusive), excluding Finnish public holidays and `skip`."""
    hol = set()
    for y in range(D(start).year, D(end).year + 1):
        hol |= finnish_holidays(y)
    for d in days(start, end):
        if d.weekday() < 5 and d not in hol and d not in skip:
            yield d


# ----------------------------------------------------------------------------- people

SSN_CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY"
_used_ssn = set()


def test_ssn(dob, male: bool, rng=random) -> str:
    """Valid-checksum Finnish SSN with individual number 900-999 (reserved for test use)."""
    dob = D(dob)
    sep = "+" if dob.year < 1900 else "-" if dob.year < 2000 else "A"
    while True:
        n = rng.randrange(900, 1000)
        if (n % 2 == 1) != male:
            continue
        base = dob.strftime("%d%m%y")
        s = f"{base}{sep}{n:03d}{SSN_CHECK[int(base + f'{n:03d}') % 31]}"
        if s not in _used_ssn:
            _used_ssn.add(s)
            return s


FIRST_NAMES_F = ["Aino", "Aada", "Eevi", "Ella", "Emma", "Helmi", "Ilona", "Isla", "Lilja", "Lumi", "Mila",
                 "Olivia", "Sofia", "Venla", "Elsa", "Hilla", "Iida", "Kerttu", "Linnea", "Pihla",
                 "Laura", "Hanna", "Johanna", "Kaisa", "Noora", "Petra", "Sanna", "Jenni", "Maria", "Tiina"]
FIRST_NAMES_M = ["Eino", "Eeli", "Leo", "Oliver", "Onni", "Väinö", "Elias", "Noel", "Nooa", "Lenni",
                 "Toivo", "Veikko", "Aaro", "Topias", "Otso", "Mikko", "Ville", "Antti", "Juho", "Tero",
                 "Riku", "Samuel", "Jussi", "Matti", "Ilkka", "Pekka", "Teemu", "Sami", "Janne", "Lauri"]
LAST_NAMES = ["Korhonen", "Virtanen", "Mäkinen", "Nieminen", "Mäkelä", "Hämäläinen", "Laine", "Heikkinen",
              "Koskinen", "Järvinen", "Lehtonen", "Lehtinen", "Saarinen", "Salminen", "Heinonen", "Niemi",
              "Heikkilä", "Kinnunen", "Salonen", "Turunen", "Salo", "Laitinen", "Tuominen", "Rantanen",
              "Karjalainen", "Jokinen", "Mattila", "Savolainen", "Lahtinen", "Ahonen"]
# a few real Espoo street names per postal code, for plausible addresses
ESPOO_STREETS = {
    "02320": ["Ulappakatu", "Kivenlahdentie", "Merisaapas", "Espoonlahdenkatu", "Kivenlahdenkatu"],
    "02360": ["Soukankuja", "Kaitaantie", "Soukanväylä"],
    "02230": ["Matinkatu", "Piispansilta", "Suomenlahdentie"],
    "02100": ["Tapiontori", "Kauppamiehentie", "Itätuulentie"],
    "02600": ["Leppävaarankatu", "Hevosenkenkä", "Säterinkatu"],
    "02770": ["Kirkkojärventie", "Espoonkatu", "Siltakatu"],
}


def fake_address(rng=random, postal=None):
    postal = postal or rng.choice(list(ESPOO_STREETS))
    street = f"{rng.choice(ESPOO_STREETS[postal])} {rng.randint(1, 30)} {rng.choice('ABCD')} {rng.randint(1, 40)}"
    return {"streetAddress": street, "postalCode": postal, "postOffice": "ESPOO"}


def ascii_email(first, last, domain="example.com"):
    tr = str.maketrans("äöåÄÖÅ", "aoaAOA")
    return f"{first}.{last}@{domain}".lower().translate(tr).replace(" ", "")


# ----------------------------------------------------------------------------- domain rules

def absence_categories(repo: str, commit: str = "HEAD") -> dict:
    """{placementType: [absenceCategory, ...]} read from PlacementType.absenceCategories() at the
    deployed commit. An absence row is needed for EACH category of the child's placement type
    (that is what eVaka creates when an absence is marked in the UI)."""
    import re
    src = subprocess.run(["git", "-C", repo, "show",
                          f"{commit}:service/src/main/kotlin/evaka/core/placement/PlacementType.kt"],
                         capture_output=True, text=True, check=True).stdout
    body = src[src.index("fun absenceCategories"):]
    body = body[body.index("when"):]
    body = body[:body.index("\n        }\n")]
    result = {}
    for types, cats in re.findall(r"((?:\s*[A-Z_]+,?)+)\s*->\s*\{?\s*setOf\(([^)]*)\)", body):
        for t in re.findall(r"[A-Z_]+", types):
            result[t] = re.findall(r"AbsenceCategory\.(\w+)", cats)
    if not result:
        raise RuntimeError("Could not parse PlacementType.absenceCategories(); read the file manually")
    return result


# ----------------------------------------------------------------------------- payload


class Rows:
    """Ordered collection of insert_rows groups. Groups are emitted in first-use order, so add
    parents (unit, employee, person, placement...) before rows that reference them."""

    def __init__(self):
        self.groups = {}

    def add(self, type_, **fields) -> dict:
        self.groups.setdefault(type_, []).append(fields)
        return fields

    def extend(self, type_, rows):
        for r in rows:
            self.add(type_, **r)

    def count(self):
        return {k: len(v) for k, v in self.groups.items()}

    def payload(self, batch: str, rollback=False) -> dict:
        groups = [{"type": k, "rows": v} for k, v in self.groups.items()]
        if rollback:
            groups.append({"type": ROLLBACK_SENTINEL, "rows": []})
        return {"batch": batch, "rows": groups}

    def write(self, path: str, batch: str, rollback=False):
        problems = self.lint()
        for p in problems:
            print("LINT:", p)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.payload(batch, rollback), f, ensure_ascii=False, indent=1)
        print(f"wrote {path}: {sum(self.count().values())} rows {self.count()}"
              + (" (+ rollback sentinel: validate only)" if rollback else ""))
        return problems

    # -- local checks for constraints that most often fail on the server -----------------
    def lint(self):
        p = []
        g = self.groups

        def overlaps(items, label):
            items = sorted(items)
            for (a1, b1, k1), (a2, b2, k2) in zip(items, items[1:]):
                if k1 == k2 and (b1 is None or a2 < b1):
                    p.append(f"{label}: overlapping {k1} {a1}..{b1} / {a2}..{b2}")

        for r in g.get("child_attendance", []):
            for k in ("arrived", "departed"):
                if r.get(k) and len(r[k]) > 5 and not r[k].endswith(":00"):
                    p.append(f"child_attendance {r['childId']} {r['date']}: {k} has seconds")
            if r.get("departed") and r["departed"] <= r["arrived"]:
                p.append(f"child_attendance {r['childId']} {r['date']}: departed <= arrived")
        open_att = [r["childId"] for r in g.get("child_attendance", []) if not r.get("departed")]
        if len(open_att) != len(set(open_att)):
            p.append("child_attendance: a child can have only ONE attendance without departed")
        res = []
        for r in g.get("attendance_reservation", []):
            if r.get("startTime") and r["endTime"] <= r["startTime"]:
                p.append(f"attendance_reservation {r['childId']} {r['date']}: end <= start")
            res.append((r["date"] + (r.get("startTime") or ""), r["date"] + (r.get("endTime") or "~"), r["childId"]))
        overlaps(res, "attendance_reservation")
        sa = [(r["arrived"], r.get("departed"), r["employeeId"]) for r in g.get("staff_attendance_realtime", [])]
        overlaps(sa, "staff_attendance_realtime")
        for r in g.get("staff_attendance_realtime", []):
            if r.get("groupId") is None and r.get("type", "PRESENT") not in ("TRAINING", "OTHER_WORK", "SICKNESS", "CHILD_SICKNESS"):
                p.append(f"staff_attendance_realtime {r['employeeId']} {r['arrived']}: groupId required for type {r.get('type', 'PRESENT')}")
        overlaps([(r["startTime"], r["endTime"], r["employeeId"]) for r in g.get("staff_attendance_plan", [])],
                 "staff_attendance_plan")
        overlaps([(r["startDate"], r["endDate"], r["childId"]) for r in g.get("placement", [])], "placement")
        seen = set()
        for r in g.get("absence", []):
            k = (r["childId"], r["date"], r["absenceCategory"])
            if k in seen:
                p.append(f"absence duplicate {k}")
            seen.add(k)
        for t in ("document_template",):
            for r in g.get(t, []):
                if (r.get("processDefinitionNumber") is None) != (r.get("archiveDurationMonths") is None):
                    p.append("document_template: processDefinitionNumber and archiveDurationMonths must both be set or both null")
        for t, rows in g.items():
            for r in rows:
                for k, v in r.items():
                    if isinstance(v, str) and len(v) == 19 and v[10:11] == "T" and v[4] == "-":
                        p.append(f"{t}.{k}={v}: timestamp without offset (use hdt())")
        if "employee" in g:
            for r in g["employee"]:
                if "ADMIN" in r.get("roles", []):
                    p.append("employee: ADMIN role is refused by the MCP server")
        return p


def post_upload(url: str, path: str, timeout=600) -> str:
    """POST a payload file to a create_upload_url URL (one-time, 10 min). Uses curl so that
    proxy/CA settings of the environment apply."""
    r = subprocess.run(["curl", "-sS", "-m", str(timeout), "-X", "POST", "-H", "Content-Type: application/json",
                        "--data-binary", f"@{path}", url], capture_output=True, text=True)
    out = r.stdout or r.stderr
    print(out[:4000])
    return out
