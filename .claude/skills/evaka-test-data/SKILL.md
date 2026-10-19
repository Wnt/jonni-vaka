---
name: evaka-test-data
description: Creates realistic test data of any shape in eVaka test environments (e.g. Espoo staging) through the eVaka MCP server - units, groups, staff and their attendance, families, applications and their decision workflow, placements, reservations, absences, attendance, VASU/LEOPS and other child documents, preschool absence applications, assistance, finance (fees, invoices, incomes), messages and calendar events. Use whenever someone asks to create, seed, populate, extend or clean up eVaka test/demo data or test data batches, in Finnish or English (e.g. "luo testidata stagingiin", "lisää päiväkotiin lapsia ja läsnäoloja").
compatibility: Needs the eVaka MCP server connected (https://<environment>/api/mcp), a git clone of espoon-voltti/evaka with the deployed commit, python3 (3.9+), git and curl. Works with any agent that supports Agent Skills and MCP (Claude Code, Codex, GitHub Copilot, ...).
metadata:
  version: "1.0"
---

# eVaka test data

The eVaka MCP server (tools `get_environment_info`, `search_units`, `search_persons`,
`search_employees`, `insert_rows`, `create_upload_url`, `advance_application`, `send_message`,
`list_test_data`, `delete_test_data`) inserts rows with eVaka's Kotlin test fixture classes and
runs some real business workflows. This skill makes that fast and safe for ANY scenario.

Core idea: **never guess or memorize row shapes**. The server is part of the eVaka repo and
deserializes each row into a Kotlin class at the deployed commit, so the repo at that commit is
the only source of truth. `scripts/row_types.py` reads it for you in under a second. This keeps
the skill valid when eVaka changes, without anyone maintaining it.

Paths below are relative to this skill's directory. `$EVAKA_REPO` = path to an eVaka clone
(ask the user or look for one, e.g. a sibling directory containing `service/` and `frontend/`;
clone `https://github.com/espoon-voltti/evaka` if none exists).

## Workflow

1. **Environment.** Call `get_environment_info`: today's date, `appCommit`, care areas, service
   need options (ids are environment specific), existing batches. Make sure the clone has the
   commit: `git -C $EVAKA_REPO cat-file -e <appCommit> || git -C $EVAKA_REPO fetch origin`.
2. **Plan the scenario** from the request. Fill gaps with realistic defaults instead of asking
   (ask only about things that are both unclear and costly to redo, e.g. which environment, or
   whether to use an existing unit). Decide: one batch name (kebab-case, describes the
   scenario), which existing entities to reuse (`search_*`), which row types to create.
   Read `references/domain-model.md` for the entity graph, insertion order and the business
   rules the fixtures do NOT enforce, and `references/realism.md` for realistic values.
3. **Look up shapes** of every row type you will use, at the deployed commit:
   `python3 scripts/row_types.py --repo $EVAKA_REPO --commit <appCommit>` (lists types and
   value formats), then `... --commit <appCommit> placement absence child_document --depth 2`.
   Fields with `= default` are optional, others required. Polymorphic types show their
   `@JsonTypeName` variants.
4. **Write a generator script** (Python, stdlib) rather than hand-writing JSON. Import
   `scripts/evaka_testdata.py` (helpers: `Rows`, `uid`, `hdt`, `workdays`, `test_ssn`,
   `absence_categories`, names/addresses, `post_upload`). Copy and adapt
   `examples/minimal_family.py` or `examples/full_unit_scenario.py`. Use a fixed random seed,
   explicit ids for every row that something else references, and add parents before
   children (groups are inserted in order). Keep the script in a scratch directory and show it
   to the user at the end so the scenario can be re-run or tweaked.
5. **Check locally**: `Rows.write()` prints lint findings (overlaps, time formats, known
   constraints). Then always run
   `python3 scripts/row_types.py --repo $EVAKA_REPO --commit <appCommit> --check payload.json`.
   It catches misspelled/unknown fields (the server SILENTLY IGNORES them), missing required
   fields, fields left to hard-coded 2019 defaults and wrong polymorphic `type`s. Fix everything.
6. **Validate on the server without saving** (always, for anything bigger than a few rows):
   write the payload with `rollback=True`. That appends a group of the non-existent type
   `__rollback__`: every real row is inserted and checked by the database, then the transaction
   fails and nothing is saved. Success looks exactly like
   `Unknown row type '__rollback__' in group N`. Any other error names the failing group and
   row: fix and repeat. Send small payloads directly with `insert_rows`; for big ones call
   `create_upload_url` and run `post_upload(url, path)` (or the curl command it returns).
   Each upload URL works once and expires in 10 minutes, so get a new one per attempt.
7. **Insert for real** with the same payload without the sentinel. If an upload times out,
   check `list_test_data` before retrying: the rows may have been committed.
8. **Run workflows** that need real business logic after the rows exist: application
   lifecycle with `advance_application`, messages with `send_message`. See
   `references/pitfalls.md` § Applications and § Messages. Rows that depend on system-created
   entities (e.g. a group placement for a placement created by accepting a decision) go in a
   follow-up `insert_rows` to the same batch. Find the system-created ids with `search_persons`.
9. **Verify** with `search_units` / `search_persons` / `list_test_data`. Spot-check counts
   and a couple of entities.
10. **Report** to the user: batch name, what was created (counts and the story), employee UI
    links (`<baseUrl>/employee/units/<unitId>`, `/employee/child-information/<childId>`,
    `/employee/applications/<id>`), anything global or shared you created, caveats, and how to
    delete (`delete_test_data` with `dryRun` first).

Before the first insert into a shared environment, re-read `references/pitfalls.md`. It is short,
and each item cost a failed run once.

## When the server returns an error

- **Constraint, overlap or FK errors** (`violates check constraint "..."`): look up the
  constraint: `git -C $EVAKA_REPO show <appCommit>:docs/db/schema.sql | grep -n "<name>"`. Fix the
  data, re-validate with the rollback sentinel.
- **Deserialization errors** (`Cannot deserialize`, `Invalid input`, `missing ... parameter`,
  unknown enum value) or **unknown row type**: eVaka changed. Do the compatibility check in
  `references/compatibility.md`: diff the fixture classes and migrations since the commit the
  example or your knowledge is based on, re-run `row_types.py` for the affected types, adapt the
  generator, and re-validate. Never change the skill to hard-code shapes. If a helper script in
  this skill itself breaks because the Kotlin source layout changed, fix the script minimally
  and tell the user, so the fix can be contributed back to the skill repository.
- **Forbidden/Conflict from workflow tools**: see `references/pitfalls.md`. These are
  deliberate safety rules of the MCP server (test-only entities, no ADMIN employees, no
  deciding real applications).

## Safety rules

- Test environments are shared. Everything goes into ONE named batch per scenario so it can be
  listed and deleted together. Don't reference another batch's rows unless asked: that blocks
  deleting the other batch.
- Do not create global data (care areas, preschool/club terms, holiday periods and
  questionnaires, service need options, published document templates) unless the scenario
  really needs it. If you do, say so in the report: it is visible to every unit and user.
- Use only fake people: `test_ssn()` (individual numbers 900-999) and `@example.com` emails.
- `delete_test_data`: always `dryRun` first. Set `allowUntrackedRows` only after showing the
  user what is untracked and getting their OK, unless the untracked rows clearly came from
  your own workflow calls in this session.
