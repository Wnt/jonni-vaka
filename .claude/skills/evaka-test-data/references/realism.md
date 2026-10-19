# Making the data realistic (Finland / Espoo)

Testers notice unrealistic data, so use these defaults unless the request says otherwise.
Write all user-visible text (names, notes, descriptions, documents) in the unit's language
(Finnish for `language: fi` units, Swedish for `sv`).

## People and families
- Mix family shapes: two guardians (most), single parents, a family with 2-3 children
  (siblings in the same unit), a foster child, a family with a non-Finnish home language
  (person `language` e.g. "so", "ru", "vi", "ar", "et", "en").
- Ages: adults 25-45. Children per placement type (see domain-model.md).
- `test_ssn()` for everyone who would have an SSN. `@example.com` emails, `+35840...` phones.
- Names: `FIRST_NAMES_F/M`, `LAST_NAMES` in evaka_testdata.py, plus some international names.
- Addresses: real street names near the unit (`ESPOO_STREETS`), the same address for a
  household, `municipalityOfResidence: "Espoo"`.

## Units and staff
- A municipal centre has 3-6 groups by age: under 3 (e.g. Oravat), 3-5 (Siilit), preschool
  (Ketut). Typical group size: 12 under-3s or 21 over-3s. Child-to-staff ratio is 1:4 under 3
  and 1:7 over 3 → `daycare_caretaker` amounts 3 per group.
- Staff: a unit supervisor (päiväkodin johtaja, coefficient 0, often shared between units),
  per group 1 ECE teacher (varhaiskasvatuksen opettaja) + 2 childminders (lastenhoitaja), a
  roaming special education teacher (veo, 1-2 mornings a week), substitutes for sick days.
- Opening hours 6:30-17:30 Mon-Fri. Shifts e.g. early 6:30-14:15, middle 8:00-15:45, late
  9:45-17:30, rotating weekly. Real arrival/departure ±10 min of the plan, occasional
  overtime, sick days with a substitute, training days (type TRAINING, no group).

## Children's days
- Reservations by guardians, usually made a week or more ahead, often an earlier pickup on
  Fridays. Typical days 7:30-16:30. Part-time ≤ 5 h. Preschool 9:00-13:00.
- Actual attendance: arrival -10/+15 min and departure -25/+10 min of the reservation.
- Absences: sick days in 1-2-day streaks, typically in the morning by a guardian
  (SICKLEAVE), more in autumn and winter. Family holidays (OTHER_ABSENCE) around school
  holidays. Espoo autumn break is week 42, ski holiday week 9, Christmas and summer are the
  long ones.
- Daycare runs on weekdays except public holidays (`finnish_holidays()`); Christmas Eve and
  Midsummer Eve are closed too. Preschool follows the preschool term and its breaks.

## Documents and processes
- VASU (daycare) and LEOPS (preschool) are drafted within ~2 months of starting. Mid-year mix:
  most PREPARED and published to guardians, newest children still DRAFT. Content is written
  by the group's teacher: child-specific strengths, wellbeing, guardians' view, goals,
  pedagogical methods, support. Avoid copy-paste sameness.
- Applications: daycare applications are sent about 4 months before the start (due date =
  sent + 4 months, or 2 weeks if urgent). Preschool applications in January. Sibling basis
  when a sibling is in the unit.
- Preschool absence applications: a few per group (trips, family events), decided by the unit
  supervisor within a few days.
- Calendar: parents' evening, excursions, photography day, discussion-time surveys.
