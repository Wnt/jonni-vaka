# eVaka domain model for test data

The data model has been stable for years. Exact fields: `scripts/row_types.py`.
Insert in this order (a row may only reference rows inserted earlier or existing ones).

```
care_area (use existing: get_environment_info)
└─ daycare (unit: type CENTRE/FAMILY/PRESCHOOL/CLUB..., operationTimes, enabledPilotFeatures)
   ├─ daycare_group ── daycare_caretaker (planned staff count per group, for occupancy)
   └─ daycare_acl (employee's unit role) ── daycare_group_acl ── employee_pin
employee
adult / child (person; a "child" row also creates the child-specific row)
├─ guardian (custody: guardian ↔ child)
├─ fridge_child (head of family ↔ child, for finance and family view; one head at a time)
├─ fridge_partnership (two adults living together)
├─ foster_parent, family_contact, backup_pickup
application (status as given; use advance_application for the real lifecycle)
placement (child, unit, type, dates; source/sourceApplicationId optional)
├─ service_need (option must match the placement type; confirmedBy employee)
├─ daycare_group_placement (child in a group, within the placement)
└─ backup_care (temporary care in another unit/group)
daily_service_times (child's regular daily times; REGULAR/IRREGULAR/VARIABLE_TIME)
attendance_reservation (guardian's booked times per day; times null = present, no times)
absence (per day AND per absence category of the placement type)
child_attendance (actual arrival/departure per day and unit)
absence_application (preschool absence request; WAITING_DECISION/ACCEPTED/REJECTED)
staff_attendance_plan (planned shifts) / staff_attendance_realtime (actual, per group)
document_template (global!) ── child_document (VASU, LEOPS, HOJKS, pedagogical assessment...)
pedagogical_document (documentation note for guardians)
calendar_event ── calendar_event_attendee (unit / group / child) ── calendar_event_time
  (DISCUSSION_SURVEY = bookable discussion slots; childId set = reserved)
assistance_factor, daycare_assistance, preschool_assistance, other_assistance_measure,
assistance_action
income, income_statement (polymorphic body), fee_alteration, fee_decision ── fee_decision_child,
voucher_value_decision, invoice (rows nested)
service_application (citizen's request to change service need; decided in the unit)
holiday_period ── holiday_period_questionnaire ── holiday_questionnaire_answer (all global)
```

## Placement types and what goes with them

| Placement type | Typical age | Notes |
|---|---|---|
| DAYCARE | 0-5 | full-day early childhood education |
| DAYCARE_PART_TIME | 0-5 | ≤ 5 h/day, ≤ 25 h/week |
| DAYCARE_FIVE_YEAR_OLDS / _PART_TIME_ | 5 | (municipality-specific free hours) |
| PRESCHOOL | 6 | preschool only (e.g. 9-13), no reservations needed |
| PRESCHOOL_DAYCARE | 6 | preschool + connected daycare |
| PRESCHOOL_DAYCARE_ONLY | 6 | only the connected daycare part |
| PREPARATORY(_DAYCARE) | 6 | preparatory education for immigrants |
| CLUB, PRESCHOOL_CLUB | 2-6 | clubs |
| TEMPORARY_DAYCARE(_PART_DAY) | any | short-term care |

Absence categories per type: `absence_categories(repo, commit)`. Valid service need
options per type: `get_environment_info` (`validPlacementType`).

## Unit features

`enabledPilotFeatures` switch UI features per unit, e.g. MESSAGING, MOBILE, RESERVATIONS,
VASU_AND_PEDADOC, REALTIME_STAFF_ATTENDANCE, PLACEMENT_TERMINATION, SERVICE_APPLICATIONS,
MOBILE_MESSAGING, PUSH_NOTIFICATIONS (list: `row_types.py --class PilotFeature`). Enable what
the scenario needs. Set `uploadToVarda`, `uploadChildrenToVarda` and `uploadToKoski` to false
for new test units so that the integrations don't try to send them anywhere. Set realistic
`operationTimes` (index 0 = Monday, null = closed). The fixture default is open 24 h
Mon-Fri.

## Finding existing data

`search_units` (groups included), `search_persons` (guardians, children, placements with
groups and placement ids), `search_employees` (roles per unit). Use them to attach data to
existing test persons or units, e.g. reservations for children someone already set up.
Only data created via MCP can be deleted with `delete_test_data`.
