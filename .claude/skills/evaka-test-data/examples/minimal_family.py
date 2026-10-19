#!/usr/bin/env python3
"""Minimal template: one family placed into an EXISTING unit group, with reservations,
attendances and a sick leave for the last two weeks. Copy and adapt.

Written against eVaka 6eb51e0b (2026-10). Look up shapes at your appCommit with row_types.py.

  python3 minimal_family.py --repo ~/evaka --commit <appCommit> --today 2026-10-16 \
      --unit <unitId> --group <groupId> --service-need-option <id from get_environment_info> \
      --out payload.json [--rollback]

Then: row_types.py --check payload.json, validate (rollback) and insert via insert_rows or
create_upload_url + post_upload.
"""
import argparse
import os
import random
import sys
from datetime import timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
from evaka_testdata import (Rows, uid, hdt, hm, D, T, add_minutes, date_range, time_range, workdays,  # noqa: E402
                            test_ssn, ascii_email, fake_address, absence_categories, FIRST_NAMES_F,
                            FIRST_NAMES_M, LAST_NAMES, SYSTEM_USER)

ap = argparse.ArgumentParser()
ap.add_argument("--repo", required=True)
ap.add_argument("--commit", required=True)
ap.add_argument("--today", required=True)
ap.add_argument("--unit", required=True)
ap.add_argument("--group", required=True)
ap.add_argument("--service-need-option", required=True, help="an option whose validPlacementType is DAYCARE")
ap.add_argument("--batch", default="minimal-family")
ap.add_argument("--out", default="payload.json")
ap.add_argument("--rollback", action="store_true", help="validate only: nothing is saved")
ap.add_argument("--seed", type=int, default=1)
a = ap.parse_args()

rng = random.Random(a.seed)
today = D(a.today)
r = Rows()

last = rng.choice(LAST_NAMES)
addr = fake_address(rng)
mom_first, dad_first = rng.choice(FIRST_NAMES_F), rng.choice(FIRST_NAMES_M)
mom = r.add("adult", id=uid(), firstName=mom_first, lastName=last, dateOfBirth="1989-05-12",
            ssn=test_ssn("1989-05-12", False, rng), email=ascii_email(mom_first, last),
            phone=f"+35840{rng.randrange(1000000, 9999999)}", municipalityOfResidence="Espoo", **addr)["id"]
dad = r.add("adult", id=uid(), firstName=dad_first, lastName=last, dateOfBirth="1987-11-02",
            ssn=test_ssn("1987-11-02", True, rng), email=ascii_email(dad_first, last),
            phone=f"+35850{rng.randrange(1000000, 9999999)}", municipalityOfResidence="Espoo", **addr)["id"]
kid_dob = "2022-03-18"
kid = r.add("child", id=uid(), firstName=rng.choice(FIRST_NAMES_F), lastName=last, dateOfBirth=kid_dob,
            ssn=test_ssn(kid_dob, False, rng), municipalityOfResidence="Espoo", **addr)["id"]
for g in (mom, dad):
    r.add("guardian", guardianId=g, childId=kid)
r.add("fridge_child", id=uid(), childId=kid, headOfChildId=mom, startDate=kid_dob, endDate="2040-03-17")
r.add("fridge_partnership", id=uid(), first=mom, second=dad, startDate="2015-06-01", endDate=None)

start, end = today - timedelta(days=60), D(f"{today.year + (today.month >= 8)}-07-31")
placement = r.add("placement", id=uid(), type="DAYCARE", childId=kid, unitId=a.unit,
                  startDate=start.isoformat(), endDate=end.isoformat())["id"]
r.add("service_need", id=uid(), placementId=placement, startDate=start.isoformat(), endDate=end.isoformat(),
      optionId=a.service_need_option, confirmedBy=SYSTEM_USER,  # or an employee id
      confirmedAt=hdt(start))
r.add("daycare_group_placement", id=uid(), daycarePlacementId=placement, daycareGroupId=a.group,
      startDate=start.isoformat(), endDate=end.isoformat())
r.add("daily_service_times", id=uid(), childId=kid, type="REGULAR",
      validityPeriod=date_range(start), regularTimes=time_range("08:00", "16:00"))

categories = absence_categories(a.repo, a.commit)["DAYCARE"]
sick = set(list(workdays(today - timedelta(days=9), today - timedelta(days=8))))
for d in workdays(today - timedelta(days=13), today + timedelta(days=7)):
    if d in sick:
        for c in categories:
            r.add("absence", id=uid(), childId=kid, date=d.isoformat(), absenceType="SICKLEAVE",
                  absenceCategory=c, modifiedBy=mom, modifiedAt=hdt(d, "06:45"))
        continue
    res_end = "15:30" if d.weekday() == 4 else "16:00"
    r.add("attendance_reservation", id=uid(), childId=kid, date=d.isoformat(), startTime="08:00",
          endTime=res_end, createdBy=mom, createdAt=hdt(d - timedelta(days=10), "20:00"))
    if d <= today:
        arr = add_minutes("08:00", rng.randint(-10, 12))
        dep = None if d == today else hm(add_minutes(res_end, rng.randint(-25, 8)))
        r.add("child_attendance", childId=kid, unitId=a.unit, date=d.isoformat(), arrived=hm(arr), departed=dep,
              modifiedAt=hdt(d, arr))

r.write(a.out, batch=a.batch, rollback=a.rollback)
