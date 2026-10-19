# Pitfalls

✔ = verified against Espoo staging with the MCP server (eVaka 6eb51e0b, 2026-10).
Others come from reading the source. Re-verify with the rollback sentinel if in doubt.

## Payload and formats

- ✔ **Unknown fields are silently ignored** (Jackson 3 default). A typo (`nmae`, `startdate`)
  makes the server use the field's default value without any error. Always run
  `row_types.py --check payload.json`.
- ✔ **Omitted fields get fixture defaults**, and many are hard-coded test dates such as
  `LocalDate.of(2019, 1, 1)` (placement/group placement dates, assistance validity, invoice
  dates, `childDateOfBirth` in finance decisions, holiday questionnaire `active`, ...). Always
  set dates explicitly. `--check` warns about them.
- ✔ **HelsinkiDateTime needs an offset**: `2026-10-05T08:00:00+03:00` (or `Z`). Without one,
  deserialization fails. Finland is +03:00 from the last Sunday of March to the last Sunday
  of October, otherwise +02:00. `hdt()` handles it.
- ✔ **No seconds in attendance times**: `child_attendance_time_resolution`. Use `HH:MM`.
- Ids that later rows reference must be given by you (uuid4). The server generates the others.
- `insert_rows` inserts groups in the given order in ONE transaction: the first failing row
  aborts everything. The error names the group index, row index and type.
- ✔ **Validation without saving**: append a group with an unknown type (`__rollback__`). See
  SKILL.md step 6. Also handy to probe whether global data already exists (e.g. try a
  preschool term: an exclusion-constraint error means one already covers the dates).
- Upload URLs (`create_upload_url`) are single use and valid for 10 minutes, even when the
  request fails.

## Who did it (evaka_user ids)

- `createdBy` / `modifiedBy` / `*By` of type `EvakaUserId`: a citizen's id = their person id, an
  employee's = the employee id, the system = `00000000-0000-0000-0000-000000000000`.
  Inserting `adult` and `employee` rows creates the evaka_user rows. Use the guardian as
  creator for things citizens do (reservations, sick-leave absences, applications, absence
  applications) and staff for staff actions, so the UI shows believable names.
- Some fixtures take a full `EvakaUser` object (`{"id", "name", "type"}`) instead of an id
  (assistance rows). Check the shape.
- ✔ Employees with the `ADMIN` role are refused. Unit roles go in `daycare_acl`
  (`UNIT_SUPERVISOR`, `STAFF`, `SPECIAL_EDUCATION_TEACHER`, `EARLY_CHILDHOOD_EDUCATION_SECRETARY`).
  Group access goes in `daycare_group_acl`. `employee_pin` is for mobile login.

## Business rules the fixtures do NOT enforce (you must)

Dev inserts write rows directly. Nothing checks that the data makes sense in the UI:
- attendances, reservations and absences only on days the child has a placement and the unit
  operates (weekdays per `operationTimes`, no public holidays; see `workdays()`).
- group placements and service needs inside their placement's dates, with no gaps if the UI
  should look complete. The service need option's `validPlacementType` must match the
  placement type.
- one placement per child per day (overlapping placements are accepted but break things).
- **absences need one row per absence category of the placement type**.
  `absence_categories(repo, commit)` reads them from `PlacementType.absenceCategories()`
  (e.g. PRESCHOOL_DAYCARE needs BILLABLE and NONBILLABLE).
- a reservation and an absence on the same day contradict each other. Marking an absence in
  eVaka deletes the reservation, so don't insert both.
- guardianship (`guardian`), head of family (`fridge_child`, one head per child) and partners
  (`fridge_partnership`) are separate: insert all that apply. VTJ relations of inserted
  persons are marked as fetched, so eVaka keeps what you inserted.
- today's data: an attendance today has `departed: null` only if arrival is before now, and a
  child can have only ONE open attendance (unique index). Staff likewise.

## Constraints that bite

- `staff_attendance_realtime`: `groupId` is required unless type is TRAINING, OTHER_WORK,
  SICKNESS or CHILD_SICKNESS. No overlapping periods per employee. `occupancyCoefficient` "7.00"
  counts towards staffing, "0.00" doesn't (supervisor, special education teacher).
- `staff_attendance_plan`, `attendance_reservation`, `child_attendance`: no overlaps per
  person, start < end.
- ✔ `document_template`: `processDefinitionNumber` and `archiveDurationMonths` must both be null
  or both set (`check$archive_fields_nullability`).
- `absence_application`: `decidedAt`/`decidedBy` must be set if and only if the status is not
  WAITING_DECISION. `rejectedReason` must be set if and only if REJECTED. Only meaningful for
  children with a PRESCHOOL* placement. An ACCEPTED one should come with OTHER_ABSENCE absences
  for the period (what the accept action creates).

## Global data (visible to everyone in the environment)

`care_area`, `preschool_term`, `club_term`, `holiday_period`, `holiday_period_questionnaire`,
`service_need_option` and published `document_template`s affect every unit. ✔ Espoo staging
already has preschool and club terms for 2026-27 (exclusion constraints reject overlapping
ones). Check with a rollback probe before creating any. Prefer existing service need options
from `get_environment_info`. If you create a document template, put "(testidata)" in its name.

## Child documents

- Template `content.sections[].questions[]` and document `content.answers[]` are polymorphic
  by `type` (TEXT, CHECKBOX, CHECKBOX_GROUP, RADIO_BUTTON_GROUP, STATIC_TEXT_DISPLAY, DATE,
  GROUPED_TEXT_FIELDS). Each answer's `questionId` and `type` must match the template.
- Allowed statuses depend on `ChildDocumentType` (e.g. VASU/LEOPS: DRAFT → PREPARED →
  COMPLETED). They are listed in `enum class ChildDocumentType` in
  `service/src/main/kotlin/evaka/core/document/DocumentTemplate.kt`.
- Guardians see a document only when it has `publishedVersions`. `documentKey: null` means
  no PDF exists (the UI still shows the content).

## Applications (`advance_application`)

- Works only for applications inserted via MCP. Steps:
  `MOVE_TO_WAITING_PLACEMENT` → `CREATE_PLACEMENT_PLAN` (✔ requires WAITING_PLACEMENT; it
  verifies the application, takes the unit and dates from the preferences unless given) →
  either `SEND_DECISIONS_WITHOUT_PROPOSAL`, or `SEND_PLACEMENT_PROPOSAL` →
  `ACCEPT_PLACEMENT_PROPOSAL` → [`CONFIRM_DECISION_MAILED` if status is WAITING_MAILING] →
  `ACCEPT_DECISIONS` / `REJECT_DECISIONS`. ✔ all verified.
- ✔ If the guardian has no SSN/address, or the child has no guardian, decisions go to
  WAITING_MAILING and need `CONFIRM_DECISION_MAILED`. With a guardian with SSN and address they
  go straight to WAITING_CONFIRMATION.
- ✔ Accepting creates a real placement (and service need if the form has an option) but NO
  group placement. Get its `placementId` from `search_persons` and insert a
  `daycare_group_placement` into the same batch.
- `ACCEPT_PLACEMENT_PROPOSAL` confirms all pending proposals of the unit and refuses if any
  belongs to a non-MCP application. Use your own unit.
- `SEND_DECISIONS_*` fails if the environment lacks decision reasoning texts. An admin must
  add them in the UI.
- Applications inserted directly with a final status (e.g. ACTIVE) have no decisions. That is
  fine as history for placements you insert yourself (`source: APPLICATION`,
  `sourceApplicationId`).
- Form (`ApplicationForm`): `preferences.preferredUnits` = `[{id, name}]`;
  `serviceNeed.serviceNeedOption` may be null. PRESCHOOL applications with connected daycare
  have `serviceNeed` != null and `connectedDaycarePreferredStartDate`.

## Messages (`send_message`)

- ✔ The sender must be an MCP-created employee with a unit role in the children's unit.
- ✔ Only children with a placement active today get recipients (guardians). A child whose
  placement starts later is silently skipped (check `recipientCount`).

## Deleting

- ✔ `delete_test_data` refuses while another batch references the batch's rows (e.g. a
  backup care into your unit from another batch), even in dryRun. Delete the referencing
  batch first.
- ✔ Workflows create rows outside the batch tracking (e.g. `fridge_child` and `sfi_message`
  from decisions). They show up as `untrackedRowCounts` and need `allowUntrackedRows: true`.
- Everything created by triggers or inserts on top of your rows (message accounts, invoice
  rows, published versions, ...) is tracked automatically (`trackedDependentRows`).
