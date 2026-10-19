#!/usr/bin/env python3
"""Full reference scenario, inserted successfully into Espoo staging (eVaka 6eb51e0b, 2026-10-16):
a new unit "Päiväkoti Kuusikallio" with 3 groups, 12 staff with shift plans and realtime
attendance, 10 families / 15 children, applications, placements, service needs, reservations,
absences, attendances, preschool absence applications, VASU/LEOPS templates and documents,
pedagogical documentation and calendar events. Two pending applications were afterwards
advanced with advance_application.

Standalone (does not use evaka_testdata.py) and hard-codes Espoo staging ids (care area,
service need options) and the date. Use it as a source of realistic content and structure;
take ids from get_environment_info and shapes from row_types.py at your appCommit.

  python3 full_unit_scenario.py payload.json ids.json
"""
import json
import random
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

random.seed(20261016)
TZ = ZoneInfo("Europe/Helsinki")
TODAY = date(2026, 10, 16)
NOW_LOCAL = time(10, 50)  # data is "as of" this moment today
SYSTEM_USER = "00000000-0000-0000-0000-000000000000"
AREA_ESPOONLAHTI = "d60f3dae-e164-4ad0-b5ec-af9c8c35a586"

SN = {
    "full35": "84877c88-2e0c-11ef-a3d8-8b8fd78712d2",  # Kokopäiväinen vähintään 35 h
    "full20_35": "84877eea-2e0c-11ef-a3d9-3f1e56964b24",  # Kokopäiväinen yli 20 alle 35 h
    "part20_25": "84877fc6-2e0c-11ef-a3db-9f2939776019",  # Osapäiväinen yli 20 h enintään 25 h
    "pre_40": "84878142-2e0c-11ef-a3df-63c8c2c8c8af",  # Kokopäiväinen liittyvä enintään 40 h
    "pre_40_45": "848780de-2e0c-11ef-a3de-87faf67f4473",  # Kokopäiväinen liittyvä yli 40 enintään 45 h
    "preschool": "107eaa94-b323-11eb-b0b7-2f56459b8df1",  # Esiopetus
}


def uid():
    return str(uuid.uuid4())


def hdt(d, t):
    return datetime.combine(d, t, TZ).isoformat()


def hm(t):
    return t.strftime("%H:%M")


def T(s):
    return time.fromisoformat(s)


def add_min(t, m):
    return (datetime.combine(TODAY, t) + timedelta(minutes=m)).time()


def tr(a, b):
    return {"start": a, "end": b}


def workdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


SSN_CHARS = "0123456789ABCDEFHJKLMNPRSTUVWXY"
used_ssn = set()


def ssn(dob, male):
    while True:
        n = random.randrange(900, 999)
        if (n % 2 == 1) != male:
            continue
        base = dob.strftime("%d%m%y")
        s = f"{base}{'-' if dob.year < 2000 else 'A'}{n:03d}{SSN_CHARS[int(base + f'{n:03d}') % 31]}"
        if s not in used_ssn:
            used_ssn.add(s)
            return s


rows = {}


def add(kind, row):
    rows.setdefault(kind, []).append(row)
    return row


# ---------------------------------------------------------------- unit
UNIT = uid()
UNIT_NAME = "Päiväkoti Kuusikallio"
add("daycare", {
    "id": UNIT,
    "name": UNIT_NAME,
    "openingDate": "2026-08-01",
    "closingDate": None,
    "areaId": AREA_ESPOONLAHTI,
    "type": ["CENTRE", "PRESCHOOL"],
    "dailyPreschoolTime": tr("09:00", "13:00"),
    "dailyPreparatoryTime": None,
    "daycareApplyPeriod": {"start": "2026-03-01", "end": None},
    "preschoolApplyPeriod": {"start": "2026-03-01", "end": None},
    "clubApplyPeriod": None,
    "providerType": "MUNICIPAL",
    "capacity": 60,
    "language": "fi",
    "ghostUnit": False,
    "uploadToVarda": False,
    "uploadChildrenToVarda": False,
    "uploadToKoski": False,
    "invoicedByMunicipality": True,
    "costCenter": "31578",
    "additionalInfo": "Uusi kuusiryhmäinen päiväkoti Kivenlahdessa, avattu elokuussa 2026. Tällä hetkellä toiminnassa kolme ryhmää.",
    "phone": "+358 9 816 30470",
    "email": "kuusikallio.paivakoti@example.com",
    "url": "https://www.espoo.fi/fi/toimipisteet/paivakoti-kuusikallio",
    "visitingAddress": {"streetAddress": "Kuusikalliontie 4", "postalCode": "02320", "postOffice": "Espoo"},
    "location": {"lat": 60.1452, "lon": 24.6427},
    "mailingAddress": {"streetAddress": "PL 3536", "poBox": None, "postalCode": "02070", "postOffice": "ESPOON KAUPUNKI"},
    "unitManager": {"name": "Riikka Mäkelä", "phone": "+358 43 824 6610", "email": "riikka.makela@example.com"},
    "preschoolManagerName": "Riikka Mäkelä",
    "decisionCustomization": {
        "daycareName": UNIT_NAME,
        "preschoolName": UNIT_NAME,
        "handler": "Varhaiskasvatuksen palveluohjaus",
        "handlerAddress": "PL 3536, 02070 Espoon kaupunki",
    },
    "operationTimes": [tr("06:30", "17:30")] * 5 + [None, None],
    "shiftCareOperationTimes": None,
    "shiftCareOpenOnHolidays": False,
    "enabledPilotFeatures": [
        "MESSAGING", "MOBILE", "RESERVATIONS", "VASU_AND_PEDADOC", "MOBILE_MESSAGING",
        "PLACEMENT_TERMINATION", "REALTIME_STAFF_ATTENDANCE", "PUSH_NOTIFICATIONS", "SERVICE_APPLICATIONS",
    ],
    "mealtimeBreakfast": tr("08:00", "08:30"),
    "mealtimeLunch": tr("11:00", "11:45"),
    "mealtimeSnack": tr("14:00", "14:30"),
})

GROUP_START = "2026-08-01"
G_ORAVAT, G_SIILIT, G_KETUT = uid(), uid(), uid()
GROUPS = {G_ORAVAT: "Oravat", G_SIILIT: "Siilit", G_KETUT: "Ketut (eskari)"}
for gid, name in GROUPS.items():
    add("daycare_group", {"id": gid, "daycareId": UNIT, "name": name, "startDate": GROUP_START, "endDate": None})
for gid, amount in [(G_ORAVAT, 3), (G_SIILIT, 3), (G_KETUT, 2)]:
    add("daycare_caretaker", {"id": uid(), "groupId": gid, "amount": amount, "startDate": GROUP_START, "endDate": None})

# ---------------------------------------------------------------- staff
STAFF_CREATED = hdt(date(2026, 6, 15), T("09:00"))
staff = {}


def employee(key, first, last, role, groups, coefficient, pin, title):
    eid = uid()
    staff[key] = {"id": eid, "first": first, "last": last, "groups": groups, "coef": coefficient, "title": title}
    add("employee", {
        "id": eid, "firstName": first, "lastName": last,
        "email": f"{first.lower()}.{last.lower()}@example.com".replace("ä", "a").replace("ö", "o"),
        "employeeNumber": str(random.randrange(100000, 999999)),
        "roles": [], "created": STAFF_CREATED, "lastLogin": hdt(TODAY, T("07:10")), "active": True,
    })
    add("daycare_acl", {"daycareId": UNIT, "employeeId": eid, "role": role})
    for g in groups:
        add("daycare_group_acl", {"groupId": g, "employeeId": eid})
    if pin:
        add("employee_pin", {"id": uid(), "userId": eid, "pin": pin, "locked": False})
    return eid


SUPERVISOR = employee("riikka", "Riikka", "Mäkelä", "UNIT_SUPERVISOR", [G_ORAVAT, G_SIILIT, G_KETUT], "0.00", "4821", "päiväkodin johtaja")
employee("anniina", "Anniina", "Laaksonen", "STAFF", [G_ORAVAT], "7.00", "1357", "varhaiskasvatuksen opettaja")
employee("mervi", "Mervi", "Salo", "STAFF", [G_ORAVAT], "7.00", "2468", "lastenhoitaja")
employee("pirjo", "Pirjo", "Koskinen", "STAFF", [G_ORAVAT], "7.00", "3690", "lastenhoitaja")
employee("juho", "Juho", "Nieminen", "STAFF", [G_SIILIT], "7.00", "7531", "varhaiskasvatuksen opettaja")
employee("elina", "Elina", "Rantanen", "STAFF", [G_SIILIT], "7.00", "8642", "lastenhoitaja")
employee("tuomas", "Tuomas", "Lehtonen", "STAFF", [G_SIILIT], "7.00", "9517", "lastenhoitaja")
employee("sanna", "Sanna", "Heikkinen", "STAFF", [G_KETUT], "7.00", "1593", "varhaiskasvatuksen opettaja (esiopetus)")
employee("aino", "Aino", "Virtanen", "STAFF", [G_KETUT], "7.00", "7539", "lastenhoitaja")
employee("katja", "Katja", "Järvinen", "SPECIAL_EDUCATION_TEACHER", [], "0.00", None, "varhaiskasvatuksen erityisopettaja")
employee("laura", "Laura", "Hakala", "STAFF", [G_ORAVAT, G_SIILIT, G_KETUT], "7.00", "2580", "sijainen")
employee("satu", "Satu", "Kallio", "EARLY_CHILDHOOD_EDUCATION_SECRETARY", [], "0.00", None, "varhaiskasvatussihteeri")

SHIFTS = {"A": ("06:30", "14:15"), "V": ("08:00", "15:45"), "I": ("09:45", "17:30")}
# shift rotation per ISO week: week 41 (5.-9.10), 42 (12.-16.10), 43 (19.-23.10)
ROTATION = {
    41: {"anniina": "V", "mervi": "A", "pirjo": "I", "juho": "A", "elina": "I", "tuomas": "V", "sanna": "V", "aino": "I"},
    42: {"anniina": "A", "mervi": "I", "pirjo": "V", "juho": "V", "elina": "A", "tuomas": "I", "sanna": "A", "aino": "I"},
    43: {"anniina": "I", "mervi": "V", "pirjo": "A", "juho": "I", "elina": "V", "tuomas": "A", "sanna": "V", "aino": "A"},
}
SICK = {("pirjo", date(2026, 10, 7)), ("pirjo", date(2026, 10, 8))}
CHILD_SICK = {("elina", date(2026, 10, 13))}
TRAINING = {("juho", date(2026, 10, 14)): ("08:30", "15:30", "Koulutus: Lasten tunnetaidot (Espoon vaka-akatemia)")}
OVERTIME = {("tuomas", date(2026, 10, 6)): 25, ("aino", date(2026, 10, 15)): 15}
PLAN_START, PLAN_END = date(2026, 10, 5), date(2026, 10, 23)


def realtime(key, d, start, end, group, typ="PRESENT", coef=None, open_today=True):
    e = staff[key]
    arrived = hdt(d, start)
    departed = None if (d == TODAY and open_today and end > NOW_LOCAL) else hdt(d, end)
    add("staff_attendance_realtime", {
        "id": uid(), "employeeId": e["id"], "groupId": group, "arrived": arrived, "departed": departed,
        "occupancyCoefficient": coef if coef is not None else e["coef"], "type": typ,
        "departedAutomatically": False,
        "modifiedAt": departed or arrived, "modifiedBy": e["id"],
    })


for d in workdays(PLAN_START, PLAN_END):
    week = d.isocalendar()[1]
    past_or_today = d <= TODAY
    # supervisor
    add("staff_attendance_plan", {"id": uid(), "employeeId": staff["riikka"]["id"], "type": "PRESENT",
                                  "startTime": hdt(d, T("08:00")), "endTime": hdt(d, T("16:00")), "description": None})
    if past_or_today:
        realtime("riikka", d, add_min(T("08:00"), random.randint(-10, 5)), add_min(T("16:00"), random.randint(-5, 20)), G_SIILIT)
    # special education teacher visits Mon & Wed mornings
    if d.weekday() in (0, 2):
        add("staff_attendance_plan", {"id": uid(), "employeeId": staff["katja"]["id"], "type": "PRESENT",
                                      "startTime": hdt(d, T("08:30")), "endTime": hdt(d, T("12:00")),
                                      "description": "Konsultaatio ja havainnointi"})
        if past_or_today:
            realtime("katja", d, add_min(T("08:30"), random.randint(-5, 5)), add_min(T("12:00"), random.randint(-5, 10)),
                     G_SIILIT if d.weekday() == 0 else G_KETUT)
    # group staff
    for key, shift in ROTATION[week].items():
        s, e = SHIFTS[shift]
        group = staff[key]["groups"][0]
        if (key, d) in TRAINING:
            ts, te, desc = TRAINING[(key, d)]
            add("staff_attendance_plan", {"id": uid(), "employeeId": staff[key]["id"], "type": "TRAINING",
                                          "startTime": hdt(d, T(ts)), "endTime": hdt(d, T(te)), "description": desc})
            if past_or_today:
                realtime(key, d, T(ts), T(te), None, typ="TRAINING", coef="0.00", open_today=False)
            continue
        add("staff_attendance_plan", {"id": uid(), "employeeId": staff[key]["id"], "type": "PRESENT",
                                      "startTime": hdt(d, T(s)), "endTime": hdt(d, T(e)), "description": None})
        if not past_or_today:
            continue
        if (key, d) in SICK or (key, d) in CHILD_SICK:
            realtime(key, d, T(s), T(e), None, typ="SICKNESS" if (key, d) in SICK else "CHILD_SICKNESS",
                     coef="0.00", open_today=False)
            # substitute covers the shift
            realtime("laura", d, add_min(T(s), random.randint(-5, 3)), add_min(T(e), random.randint(-3, 8)), group)
            continue
        arr = add_min(T(s), random.randint(-8, 4))
        dep = add_min(T(e), random.randint(-4, 9) + OVERTIME.get((key, d), 0))
        realtime(key, d, arr, dep, group)

# ---------------------------------------------------------------- families
STREETS = {
    1: ("Ulappakatu 5 B 12", "02320"), 2: ("Kivenlahdentie 3 A 7", "02320"), 3: ("Merisaapas 2 C 21", "02320"),
    4: ("Soukankuja 6 A 4", "02360"), 5: ("Kaitaantie 11 B 9", "02360"), 6: ("Espoonlahdenkatu 8 A 15", "02320"),
    7: ("Kivenlahdenkatu 14 D 30", "02320"), 8: ("Vilniementie 7", "02330"), 9: ("Ulappakatu 1 A 3", "02320"),
    10: ("Merikansantie 9 B 18", "02320"),
}

# key, first, last, dob, male, family
ADULTS = [
    ("mikko", "Mikko", "Korhonen", date(1987, 5, 22), True, 1),
    ("laurak", "Laura", "Korhonen", date(1989, 9, 3), False, 1),
    ("minh", "Minh", "Nguyen", date(1986, 2, 17), True, 2),
    ("sofia", "Sofia", "Lindqvist", date(1988, 12, 1), False, 2),
    ("jenni", "Jenni", "Virtanen", date(1992, 4, 9), False, 3),
    ("abdi", "Abdi", "Ahmed", date(1985, 8, 30), True, 4),
    ("hodan", "Hodan", "Ali", date(1990, 3, 12), False, 4),
    ("ville", "Ville", "Laine", date(1990, 7, 7), True, 5),
    ("hanna", "Hanna", "Laine", date(1991, 1, 25), False, 5),
    ("petra", "Petra", "Mäkinen", date(1984, 10, 14), False, 6),
    ("olga", "Olga", "Smirnova", date(1988, 6, 6), False, 7),
    ("antti", "Antti", "Heino", date(1986, 11, 19), True, 7),
    ("tero", "Tero", "Saarinen", date(1983, 3, 3), True, 8),
    ("kaisa", "Kaisa", "Saarinen", date(1985, 5, 28), False, 8),
    ("johanna", "Johanna", "Berg", date(1993, 2, 14), False, 9),
    ("samuel", "Samuel", "Berg", date(1992, 9, 9), True, 9),
    ("riku", "Riku", "Hämäläinen", date(1989, 4, 1), True, 10),
    ("noora", "Noora", "Hämäläinen", date(1990, 8, 21), False, 10),
]
LANG = {"minh": "vi", "abdi": "so", "hodan": "so", "olga": "ru"}
P = {}
for key, first, last, dob, male, fam in ADULTS:
    street, postal = STREETS[fam]
    pid = uid()
    P[key] = {"id": pid, "first": first, "last": last, "dob": dob, "fam": fam, "ssn": ssn(dob, male),
              "phone": f"+35840{random.randrange(1000000, 9999999)}",
              "email": f"{first.lower()}.{last.lower()}@example.com".replace("ä", "a").replace("ö", "o")}
    add("adult", {
        "id": pid, "dateOfBirth": dob.isoformat(), "firstName": first, "lastName": last, "ssn": P[key]["ssn"],
        "email": P[key]["email"], "verifiedEmail": P[key]["email"], "phone": P[key]["phone"],
        "language": LANG.get(key, "fi"), "streetAddress": street, "postalCode": postal, "postOffice": "ESPOO",
        "residenceCode": f"KTJ{fam:04d}{random.randrange(1000, 9999)}", "municipalityOfResidence": "Espoo",
    })

FAMILY_GUARDIANS = {1: ["mikko", "laurak"], 2: ["sofia", "minh"], 3: ["jenni"], 4: ["hodan", "abdi"], 5: ["hanna", "ville"],
                    6: ["petra"], 7: ["olga", "antti"], 8: ["kaisa", "tero"], 9: ["johanna", "samuel"], 10: ["noora", "riku"]}
for fam, gs in FAMILY_GUARDIANS.items():
    if len(gs) == 2:
        add("fridge_partnership", {"id": uid(), "first": P[gs[0]]["id"], "second": P[gs[1]]["id"],
                                   "startDate": f"{2012 + fam % 6}-0{1 + fam % 8}-01", "endDate": None,
                                   "createdAt": hdt(date(2026, 6, 1), T("12:00")), "conflict": False})

# key, first, last, dob, male, family, group, placementType, start, serviceNeed, times (arr, dep), extra
CHILDREN = [
    ("eeli", "Eeli", "Korhonen", date(2020, 3, 14), True, 1, G_KETUT, "PRESCHOOL_DAYCARE", "2026-08-11", "pre_40_45", ("07:45", "16:00")),
    ("ilona", "Ilona", "Korhonen", date(2023, 6, 2), False, 1, G_ORAVAT, "DAYCARE", "2026-08-03", "full35", ("07:45", "16:00")),
    ("leo", "Leo", "Nguyen", date(2022, 1, 21), True, 2, G_SIILIT, "DAYCARE", "2026-08-03", "full35", ("07:30", "16:15")),
    ("aada", "Aada", "Virtanen", date(2021, 9, 30), False, 3, G_SIILIT, "DAYCARE", "2026-08-03", "full35", ("08:00", "16:30")),
    ("yusuf", "Yusuf", "Ahmed", date(2020, 7, 8), True, 4, G_KETUT, "PRESCHOOL_DAYCARE", "2026-08-11", "pre_40", ("08:00", "15:00")),
    ("amina", "Amina", "Ahmed", date(2022, 11, 15), False, 4, G_SIILIT, "DAYCARE", "2026-08-03", "full20_35", ("08:30", "14:00")),
    ("oliver", "Oliver", "Laine", date(2024, 2, 11), True, 5, G_ORAVAT, "DAYCARE", "2026-10-01", "full35", ("08:00", "15:30")),
    ("venla", "Venla", "Mäkinen", date(2020, 11, 27), False, 6, G_KETUT, "PRESCHOOL_DAYCARE", "2026-08-11", "pre_40_45", ("07:30", "16:30")),
    ("mila", "Mila", "Heino", date(2021, 4, 4), False, 7, G_SIILIT, "DAYCARE", "2026-08-03", "full35", ("07:15", "15:45")),
    ("eino", "Eino", "Heino", date(2024, 5, 19), True, 7, G_ORAVAT, "DAYCARE", "2026-08-03", "full20_35", ("08:30", "14:30")),
    ("lumi", "Lumi", "Saarinen", date(2020, 2, 2), False, 8, G_KETUT, "PRESCHOOL", "2026-08-11", "preschool", ("08:55", "13:05")),
    ("nooa", "Nooa", "Berg", date(2023, 12, 3), True, 9, G_ORAVAT, "DAYCARE_PART_TIME", "2026-08-17", "part20_25", ("08:30", "13:00")),
    ("elsa", "Elsa", "Hämäläinen", date(2022, 6, 17), False, 10, G_SIILIT, "DAYCARE", "2026-08-03", "full35", ("08:15", "16:00")),
]
# children with pending applications (not placed yet)
PENDING_CHILDREN = [
    ("sara", "Sara", "Ahmed", date(2025, 4, 20), False, 4),
    ("topias", "Topias", "Hämäläinen", date(2024, 8, 9), True, 10),
]
C = {}
for row in [c[:6] for c in CHILDREN] + PENDING_CHILDREN:
    key, first, last, dob, male, fam = row
    street, postal = STREETS[fam]
    cid = uid()
    C[key] = {"id": cid, "first": first, "last": last, "dob": dob, "fam": fam, "ssn": ssn(dob, male)}
    add("child", {
        "id": cid, "dateOfBirth": dob.isoformat(), "firstName": first, "lastName": last, "ssn": C[key]["ssn"],
        "language": "fi", "streetAddress": street, "postalCode": postal, "postOffice": "ESPOO",
        "municipalityOfResidence": "Espoo",
    })
    head = FAMILY_GUARDIANS[fam][0]
    for g in FAMILY_GUARDIANS[fam]:
        add("guardian", {"guardianId": P[g]["id"], "childId": cid})
    add("fridge_child", {"id": uid(), "childId": cid, "headOfChildId": P[head]["id"], "startDate": dob.isoformat(),
                         "endDate": (dob.replace(year=dob.year + 18) - timedelta(days=1)).isoformat(),
                         "createdAt": hdt(date(2026, 6, 1), T("12:00"))})

add("backup_pickup", {"id": uid(), "childId": C["eeli"]["id"], "name": "Marja Korhonen (mummo)", "phone": "+358405551234"})
add("backup_pickup", {"id": uid(), "childId": C["ilona"]["id"], "name": "Marja Korhonen (mummo)", "phone": "+358405551234"})
add("backup_pickup", {"id": uid(), "childId": C["aada"]["id"], "name": "Kirsi Virtanen (täti)", "phone": "+358449876543"})
add("backup_pickup", {"id": uid(), "childId": C["mila"]["id"], "name": "Irina Smirnova (isoäiti)", "phone": "+358401112233"})
add("backup_pickup", {"id": uid(), "childId": C["eino"]["id"], "name": "Irina Smirnova (isoäiti)", "phone": "+358401112233"})

# ---------------------------------------------------------------- applications
UNIT_PREF = [{"id": UNIT, "name": UNIT_NAME}]


def app_form(child_key, start, typ, times, part_time, other_info="", allergies="", diet="", sibling=None,
             connected_start=None, urgent=False):
    c = C[child_key]
    gkeys = FAMILY_GUARDIANS[c["fam"]]
    g = P[gkeys[0]]
    street, postal = STREETS[c["fam"]]
    addr = {"street": street, "postalCode": postal, "postOffice": "Espoo"}
    others = [{"firstName": C[k]["first"], "lastName": C[k]["last"], "socialSecurityNumber": C[k]["ssn"]}
              for k in C if C[k]["fam"] == c["fam"] and k != child_key]
    return {
        "child": {"person": {"firstName": c["first"], "lastName": c["last"], "socialSecurityNumber": c["ssn"]},
                  "dateOfBirth": c["dob"].isoformat(), "address": addr, "futureAddress": None,
                  "nationality": "FI", "language": "fi", "allergies": allergies, "diet": diet,
                  "assistanceNeeded": False, "assistanceDescription": ""},
        "guardian": {"person": {"firstName": g["first"], "lastName": g["last"], "socialSecurityNumber": g["ssn"]},
                     "address": addr, "futureAddress": None, "phoneNumber": g["phone"], "email": g["email"]},
        "secondGuardian": None, "otherPartner": None, "otherChildren": others,
        "preferences": {
            "preferredUnits": UNIT_PREF, "preferredStartDate": start,
            "connectedDaycarePreferredStartDate": connected_start,
            "serviceNeed": None if times is None else
            {"startTime": times[0], "endTime": times[1], "shiftCare": False, "partTime": part_time, "serviceNeedOption": None},
            "siblingBasis": sibling, "preparatory": False, "urgent": urgent,
        },
        "otherInfo": other_info, "clubDetails": None,
    }


APP = {}
APP_INFO = {
    "eeli": dict(sent=date(2026, 1, 14), extra=dict(other_info="Eeli on aiemmin ollut Päiväkoti Kivenlahdessa, toivomme siirtoa uuteen lähipäiväkotiin sisaren kanssa.")),
    "ilona": dict(sent=date(2026, 2, 26), extra=dict(other_info="Äidin vanhempainvapaa päättyy heinäkuussa.")),
    "leo": dict(sent=date(2026, 3, 9), extra=dict(allergies="Pähkinäallergia (adrenaliinikynä mukana)", diet="Pähkinätön")),
    "aada": dict(sent=date(2026, 2, 2), extra=dict(other_info="Yksinhuoltaja, teen vuorotyötä arkisin klo 17 asti.")),
    "yusuf": dict(sent=date(2026, 1, 20), extra={}),
    "amina": dict(sent=date(2026, 3, 18), extra=dict(sibling={"siblingName": "Yusuf Ahmed", "siblingSsn": "", "siblingUnit": UNIT_NAME})),
    "oliver": dict(sent=date(2026, 6, 22), extra=dict(other_info="Isän vanhempainvapaa päättyy syyskuun lopussa.")),
    "venla": dict(sent=date(2026, 1, 9), extra={}),
    "mila": dict(sent=date(2026, 2, 17), extra=dict(diet="Laktoositon")),
    "eino": dict(sent=date(2026, 2, 17), extra=dict(sibling={"siblingName": "Mila Heino", "siblingSsn": "", "siblingUnit": UNIT_NAME})),
    "lumi": dict(sent=date(2026, 1, 22), extra={}),
    "nooa": dict(sent=date(2026, 4, 3), extra=dict(other_info="Toivomme aluksi osapäivähoitoa, äiti opiskelee aamupäivisin.")),
    "elsa": dict(sent=date(2026, 3, 1), extra=dict(allergies="Siitepölyallergia", diet="")),
}
for ck, first, last, dob, male, fam, group, ptype, start, sn, times in CHILDREN:
    info = APP_INFO[ck]
    sent = info["sent"]
    gkeys = FAMILY_GUARDIANS[fam]
    preschool = ptype.startswith("PRESCHOOL")
    app_id = uid()
    APP[ck] = app_id
    if preschool:
        form = app_form(ck, start, "PRESCHOOL", None if ptype == "PRESCHOOL" else times, False,
                        connected_start=None if ptype == "PRESCHOOL" else start, **info["extra"])
    else:
        form = app_form(ck, start, "DAYCARE", times, ptype == "DAYCARE_PART_TIME", **info["extra"])
    created = hdt(sent - timedelta(days=1), T("20:14"))
    add("application", {
        "id": app_id, "type": "PRESCHOOL" if preschool else "DAYCARE",
        "createdAt": created, "createdBy": P[gkeys[0]]["id"],
        "modifiedAt": hdt(sent + timedelta(days=40), T("10:00")), "modifiedBy": SUPERVISOR,
        "sentDate": sent.isoformat(), "sentTime": "21:03", "dueDate": (sent + timedelta(days=120)).isoformat(),
        "status": "ACTIVE", "guardianId": P[gkeys[0]]["id"], "childId": C[ck]["id"], "origin": "ELECTRONIC",
        "checkedByAdmin": True, "confidential": False, "hideFromGuardian": False, "transferApplication": False,
        "allowOtherGuardianAccess": True, "otherGuardians": [P[g]["id"] for g in gkeys[1:]], "form": form,
    })

PENDING_APPS = []
sara_app = uid()
add("application", {
    "id": sara_app, "type": "DAYCARE",
    "createdAt": hdt(date(2026, 9, 21), T("19:40")), "createdBy": P["hodan"]["id"],
    "modifiedAt": hdt(date(2026, 9, 21), T("19:58")), "modifiedBy": P["hodan"]["id"],
    "sentDate": "2026-09-21", "sentTime": "19:58", "dueDate": "2027-01-21", "status": "SENT",
    "guardianId": P["hodan"]["id"], "childId": C["sara"]["id"], "origin": "ELECTRONIC", "checkedByAdmin": False,
    "confidential": None, "hideFromGuardian": False, "transferApplication": False, "allowOtherGuardianAccess": True,
    "otherGuardians": [P["abdi"]["id"]],
    "form": app_form("sara", "2027-01-11", "DAYCARE", ("08:00", "15:30"), False,
                     other_info="Toivomme paikkaa samasta päiväkodista sisarusten kanssa. Äidin hoitovapaa päättyy tammikuussa.",
                     sibling={"siblingName": "Amina Ahmed", "siblingSsn": C["amina"]["ssn"], "siblingUnit": UNIT_NAME}),
})
topias_app = uid()
add("application", {
    "id": topias_app, "type": "DAYCARE",
    "createdAt": hdt(date(2026, 7, 28), T("21:05")), "createdBy": P["noora"]["id"],
    "modifiedAt": hdt(date(2026, 7, 28), T("21:20")), "modifiedBy": P["noora"]["id"],
    "sentDate": "2026-07-28", "sentTime": "21:20", "dueDate": "2026-11-28", "status": "SENT",
    "guardianId": P["noora"]["id"], "childId": C["topias"]["id"], "origin": "ELECTRONIC", "checkedByAdmin": True,
    "confidential": False, "hideFromGuardian": False, "transferApplication": False, "allowOtherGuardianAccess": True,
    "otherGuardians": [P["riku"]["id"]],
    "form": app_form("topias", "2026-11-02", "DAYCARE", ("08:00", "16:00"), False,
                     allergies="Kananmuna-allergia", diet="Kananmunaton",
                     sibling={"siblingName": "Elsa Hämäläinen", "siblingSsn": C["elsa"]["ssn"], "siblingUnit": UNIT_NAME}),
})

# ---------------------------------------------------------------- placements
PL = {}
for ck, first, last, dob, male, fam, group, ptype, start, sn, times in CHILDREN:
    pid = uid()
    PL[ck] = pid
    end = "2027-05-31" if ptype.startswith("PRESCHOOL") else "2027-07-31"
    sent = APP_INFO[ck]["sent"]
    add("placement", {
        "id": pid, "type": ptype, "childId": C[ck]["id"], "unitId": UNIT, "startDate": start, "endDate": end,
        "placeGuarantee": False, "createdAt": hdt(sent + timedelta(days=40), T("10:00")), "createdBy": SYSTEM_USER,
        "modifiedAt": hdt(sent + timedelta(days=40), T("10:00")), "modifiedBy": SYSTEM_USER,
        "source": "APPLICATION", "sourceApplicationId": APP[ck],
    })
    add("service_need", {"id": uid(), "placementId": pid, "startDate": start, "endDate": end, "optionId": SN[sn],
                         "shiftCare": "NONE", "partWeek": False, "confirmedBy": SUPERVISOR,
                         "confirmedAt": hdt(date(2026, 8, 20), T("13:30"))})
    add("daycare_group_placement", {"id": uid(), "daycarePlacementId": pid, "daycareGroupId": group,
                                    "startDate": start, "endDate": end})
    if ptype != "PRESCHOOL":
        add("daily_service_times", {"id": uid(), "childId": C[ck]["id"], "type": "REGULAR",
                                    "validityPeriod": {"start": start, "end": None}, "regularTimes": tr(*times)})

add("service_application", {
    "id": uid(), "sentAt": hdt(date(2026, 10, 12), T("20:41")), "personId": P["johanna"]["id"],
    "childId": C["nooa"]["id"], "startDate": "2026-11-02", "serviceNeedOptionId": SN["full20_35"],
    "additionalInfo": "Opiskeluni muuttuu marraskuusta alkaen iltapäiväpainotteiseksi, joten tarvitsemme Nooalle pidemmät hoitopäivät (n. 8.30–15.00).",
})

# ---------------------------------------------------------------- absences, reservations, attendances
ABS = {}  # (child, date) -> (type, modifiedBy, modifiedAt)


def absence(ck, d1, d2, typ, by, at):
    for d in workdays(d1, d2):
        ABS[(ck, d)] = (typ, by, at)


def gid(ck):
    return P[FAMILY_GUARDIANS[C[ck]["fam"]][0]]["id"]


absence("ilona", date(2026, 10, 6), date(2026, 10, 7), "SICKLEAVE", gid("ilona"), hdt(date(2026, 10, 6), T("06:52")))
absence("eeli", date(2026, 10, 8), date(2026, 10, 9), "SICKLEAVE", P["laurak"]["id"], hdt(date(2026, 10, 8), T("06:40")))
absence("leo", date(2026, 10, 12), date(2026, 10, 16), "OTHER_ABSENCE", gid("leo"), hdt(date(2026, 9, 25), T("21:10")))
absence("mila", date(2026, 10, 12), date(2026, 10, 14), "OTHER_ABSENCE", gid("mila"), hdt(date(2026, 9, 28), T("19:30")))
absence("eino", date(2026, 10, 12), date(2026, 10, 14), "OTHER_ABSENCE", gid("eino"), hdt(date(2026, 9, 28), T("19:30")))
absence("aada", date(2026, 10, 15), date(2026, 10, 16), "SICKLEAVE", gid("aada"), hdt(date(2026, 10, 15), T("06:31")))
absence("amina", date(2026, 10, 5), date(2026, 10, 5), "SICKLEAVE", P["abdi"]["id"], hdt(date(2026, 10, 5), T("08:05")))
absence("venla", date(2026, 10, 8), date(2026, 10, 9), "OTHER_ABSENCE", SUPERVISOR, hdt(date(2026, 10, 1), T("14:12")))
absence("lumi", date(2026, 10, 13), date(2026, 10, 13), "SICKLEAVE", gid("lumi"), hdt(date(2026, 10, 13), T("07:15")))
absence("lumi", date(2026, 9, 24), date(2026, 9, 25), "OTHER_ABSENCE", SUPERVISOR, hdt(date(2026, 9, 15), T("12:03")))
absence("nooa", date(2026, 10, 9), date(2026, 10, 9), "OTHER_ABSENCE", gid("nooa"), hdt(date(2026, 10, 7), T("18:22")))
absence("oliver", date(2026, 10, 9), date(2026, 10, 9), "SICKLEAVE", P["hanna"]["id"], hdt(date(2026, 10, 9), T("07:01")))
absence("elsa", date(2026, 10, 23), date(2026, 10, 23), "OTHER_ABSENCE", gid("elsa"), hdt(date(2026, 10, 11), T("20:45")))
absence("yusuf", date(2026, 10, 30), date(2026, 10, 30), "OTHER_ABSENCE", P["hodan"]["id"], hdt(date(2026, 10, 14), T("21:00")))

CATEGORIES = {"DAYCARE": ["BILLABLE"], "DAYCARE_PART_TIME": ["BILLABLE"],
              "PRESCHOOL_DAYCARE": ["NONBILLABLE", "BILLABLE"], "PRESCHOOL": ["NONBILLABLE"]}
CH = {c[0]: c for c in CHILDREN}
for (ck, d), (typ, by, at) in sorted(ABS.items(), key=lambda x: (x[0][0], x[0][1])):
    for cat in CATEGORIES[CH[ck][7]]:
        add("absence", {"id": uid(), "childId": C[ck]["id"], "date": d.isoformat(), "absenceType": typ,
                        "modifiedAt": at, "modifiedBy": by, "absenceCategory": cat})

RES_START, RES_END = date(2026, 10, 5), date(2026, 10, 30)
ATT_START = date(2026, 10, 5)
for ck, first, last, dob, male, fam, group, ptype, start, sn, times in CHILDREN:
    s0, e0 = T(times[0]), T(times[1])
    booker = P[FAMILY_GUARDIANS[fam][random.randrange(len(FAMILY_GUARDIANS[fam]))]]["id"]
    for d in workdays(max(RES_START, date.fromisoformat(start)), RES_END):
        if (ck, d) in ABS:
            continue
        rs, re_ = s0, e0
        if d.weekday() == 4 and ptype != "PRESCHOOL":
            re_ = add_min(e0, -30)
        if ptype != "PRESCHOOL":
            if random.random() < 0.15:
                rs = add_min(rs, random.choice([-15, 15, 30]))
            add("attendance_reservation", {
                "id": uid(), "childId": C[ck]["id"], "date": d.isoformat(), "startTime": hm(rs), "endTime": hm(re_),
                "createdAt": hdt(date(2026, 9, 27) if d < date(2026, 10, 19) else date(2026, 10, 11), T("20:35")),
                "createdBy": booker,
            })
        if ATT_START <= d <= TODAY:
            arr = add_min(rs, random.randint(-10, 12))
            if d == TODAY and arr > NOW_LOCAL:
                continue
            dep = None if d == TODAY else add_min(re_, random.randint(-25, 8))
            add("child_attendance", {"childId": C[ck]["id"], "unitId": UNIT, "date": d.isoformat(),
                                     "arrived": hm(arr), "departed": None if dep is None else hm(dep),
                                     "modifiedAt": hdt(d, dep or arr), "modifiedBy": random.choice(
                                         [s["id"] for s in staff.values() if group in s["groups"] and s["coef"] != "0.00"])})

# ---------------------------------------------------------------- preschool absence applications
def abs_app(ck, d1, d2, desc, status, created, by, decided=None, reason=None):
    add("absence_application", {
        "id": uid(), "createdAt": created, "createdBy": by, "modifiedAt": decided or created,
        "modifiedBy": SUPERVISOR if decided else by, "childId": C[ck]["id"], "startDate": d1, "endDate": d2,
        "description": desc, "status": status, "decidedAt": decided, "decidedBy": SUPERVISOR if decided else None,
        "rejectedReason": reason,
    })


abs_app("venla", "2026-10-08", "2026-10-09",
        "Venlan isoäidin 70-vuotisjuhlat Kuopiossa. Lähdemme ajamaan torstaiaamuna ja palaamme sunnuntaina.",
        "ACCEPTED", hdt(date(2026, 9, 29), T("20:17")), P["petra"]["id"], hdt(date(2026, 10, 1), T("14:12")))
abs_app("lumi", "2026-09-24", "2026-09-25",
        "Isovanhempien kultahääjuhlat Vaasassa, matkustamme junalla torstaina aamupäivällä.",
        "ACCEPTED", hdt(date(2026, 9, 10), T("21:44")), P["kaisa"]["id"], hdt(date(2026, 9, 15), T("12:03")))
abs_app("yusuf", "2026-11-16", "2026-11-20",
        "Perhe matkustaa Tukholmaan serkun häihin. Yusuf tekee matkalla eskaritehtäviä opettajan antamien ohjeiden mukaan.",
        "WAITING_DECISION", hdt(date(2026, 10, 13), T("21:30")), P["hodan"]["id"])
abs_app("eeli", "2026-11-02", "2026-11-03",
        "Mökkiviikonloppu Kolilla venyy maanantaille ja tiistaille isän lomien vuoksi.",
        "WAITING_DECISION", hdt(date(2026, 10, 15), T("19:05")), P["mikko"]["id"])

# ---------------------------------------------------------------- documents (VASU & LEOPS)
VASU_T, LEOPS_T = uid(), uid()
AREAS = [("kieli", "Kielten rikas maailma"), ("ilmaisu", "Ilmaisun monet muodot"),
         ("yhteiso", "Minä ja meidän yhteisömme"), ("tutkin", "Tutkin ja toimin ympäristössäni"),
         ("kasvan", "Kasvan, liikun ja kehityn")]
SUPPORT = [("ei", "Ei tuen tarvetta"), ("yleinen", "Yleinen tuki"), ("tehostettu", "Tehostettu tuki"), ("erityinen", "Erityinen tuki")]


def q_text(i, label, multiline=True, info=""):
    return {"id": i, "type": "TEXT", "label": label, "infoText": info, "multiline": multiline}


def q_date(i, label):
    return {"id": i, "type": "DATE", "label": label, "infoText": ""}


def template_content(leops):
    child_word = "esiopetuksen" if leops else "varhaiskasvatuksen"
    return {"sections": [
        {"id": "perustiedot", "label": "1. Perustiedot", "infoText": "", "questions": [
            q_text("laatijat", "Suunnitelman laatimiseen osallistuneet"),
            q_date("keskustelupvm", "Huoltajan kanssa käydyn keskustelun päivämäärä"),
            q_text("aiemmat", "Aiemmat suunnitelmat ja muut huomioitavat asiakirjat",
                   info="Esim. aiemman yksikön vasu, pedagogiset arviot tai terveydenhuollon lausunnot."),
        ]},
        {"id": "lapsi", "label": "2. Lapsen vahvuudet, kiinnostuksen kohteet ja hyvinvointi", "infoText": "", "questions": [
            q_text("vahvuudet", "Lapsen vahvuudet ja kiinnostuksen kohteet"),
            q_text("hyvinvointi", "Lapsen hyvinvointiin liittyvät asiat (esim. uni, ruokailu, ulkoilu, kaverisuhteet)"),
            q_text("huoltaja", "Huoltajan näkemys ja toiveet"),
        ]},
        {"id": "tavoitteet", "label": f"3. Pedagogiset tavoitteet {child_word}ssa", "infoText": "", "questions": [
            {"id": "alueet", "type": "CHECKBOX_GROUP", "label": "Oppimisen alueet, joita painotetaan tänä toimintakautena",
             "infoText": "", "options": [{"id": i, "label": l, "withText": False} for i, l in AREAS]},
            q_text("tavoitteet", "Tavoitteet lapsen kehityksen ja oppimisen tukemiseksi"),
            q_text("toimenpiteet", "Pedagogiset toimenpiteet ja menetelmät tavoitteiden saavuttamiseksi"),
        ]},
        {"id": "tuki", "label": "4. Lapsen tuki", "infoText": "", "questions": [
            {"id": "tukitaso", "type": "RADIO_BUTTON_GROUP", "label": "Lapsen saama tuki", "infoText": "",
             "options": [{"id": i, "label": l} for i, l in SUPPORT]},
            q_text("tukitoimet", "Tukitoimet ja niiden toteuttaminen"),
        ]},
        {"id": "arviointi", "label": "5. Arviointi ja yhteistyö", "infoText": "", "questions": [
            q_text("sovitut", "Yhteistyöstä sovitut asiat"),
            q_date("seuraava", "Suunnitelman seuraava arviointi"),
            {"id": "huoltajanakemys", "type": "CHECKBOX", "label": "Huoltaja on osallistunut suunnitelman laatimiseen", "infoText": ""},
        ]},
    ]}


VALIDITY = {"start": "2026-08-01", "end": "2027-07-31"}
CONF = {"durationYears": 25, "basis": "JulkL 24.1 § 25 ja 30 k."}
add("document_template", {
    "id": VASU_T, "name": "Varhaiskasvatussuunnitelma 2026–2027 (testidata)", "type": "VASU",
    "placementTypes": ["DAYCARE", "DAYCARE_PART_TIME", "DAYCARE_FIVE_YEAR_OLDS", "DAYCARE_PART_TIME_FIVE_YEAR_OLDS"],
    "language": "FI", "confidentiality": CONF, "legalBasis": "Varhaiskasvatuslaki (540/2018) 23 §",
    "validity": VALIDITY, "processDefinitionNumber": None, "archiveDurationMonths": None, "published": True,
    "content": template_content(False), "archiveExternally": False, "endDecisionWhenUnitChanges": None,
    "deletionRetentionDays": 3650, "deletionRetentionBasis": "PLACEMENT_END",
})
add("document_template", {
    "id": LEOPS_T, "name": "Lapsen esiopetuksen oppimissuunnitelma 2026–2027 (testidata)", "type": "LEOPS",
    "placementTypes": ["PRESCHOOL", "PRESCHOOL_DAYCARE", "PRESCHOOL_DAYCARE_ONLY"],
    "language": "FI", "confidentiality": CONF, "legalBasis": "Perusopetuslaki (628/1998) 16 §, Esiopetuksen OPS 2014",
    "validity": VALIDITY, "processDefinitionNumber": None, "archiveDurationMonths": None, "published": True,
    "content": template_content(True), "archiveExternally": False, "endDecisionWhenUnitChanges": None,
    "deletionRetentionDays": 3650, "deletionRetentionBasis": "PLACEMENT_END",
})

TEACHER = {G_ORAVAT: "anniina", G_SIILIT: "juho", G_KETUT: "sanna"}
DOCS = {
    # child: (status, discussion date, strengths, wellbeing, guardian view, areas, goals, methods, support, support text)
    "ilona": ("PREPARED", "2026-09-22",
              "Ilona on utelias ja rohkea tutkija. Hän nauttii musiikista, laululeikeistä ja vesileikeistä. Ilona leikkii mielellään kotileikkejä nukkien kanssa.",
              "Ilona nukkuu päiväunet hyvin noin 1,5 tuntia. Ruokailussa hän harjoittelee haarukan käyttöä. Siirtymätilanteissa Ilona tarvitsee aikuisen tukea ja ennakointia.",
              "Huoltajat toivovat, että Ilona saa harjoitella pukemista ja että ryhmässä tuetaan puheen kehitystä. Kotona Ilona puhuu jo kahden sanan lauseita.",
              ["kieli", "ilmaisu", "kasvan"],
              "Ilona harjoittelee omien tunteiden ja toiveiden ilmaisemista sanoin. Tavoitteena on lisätä omatoimisuutta pukemisessa ja ruokailussa.",
              "Kuvatuki päivän struktuurissa, laululeikit ja lorut, pienryhmätoiminta. Aikuinen sanoittaa tilanteita ja tunteita.",
              "ei", ""),
    "oliver": ("DRAFT", "2026-10-14",
               "Oliver on iloinen ja sosiaalinen. Hän pitää autoista, palikoista ja ulkona juoksemisesta.",
               "Oliverin varhaiskasvatus alkoi lokakuussa ja tutustumisjakso sujui hyvin. Päiväunille nukahtaminen vaatii vielä aikuisen läsnäoloa.",
               "Huoltajat toivovat, että Oliver saa rauhassa kiintyä uusiin aikuisiin ja että unirytmi vakiintuu.",
               ["yhteiso", "kasvan"],
               "Turvallisen kiintymyssuhteen muodostuminen omahoitajaan. Ryhmän rutiineihin tutustuminen.",
               "Omahoitajuus, rauhallinen aloitus aamuisin, kuvakortit päivän kulusta.",
               "ei", ""),
    "eino": ("PREPARED", "2026-09-29",
             "Eino on tarkka havainnoija ja rakastaa kirjoja ja eläinkuvia. Hän osaa jo nimetä monia eläimiä.",
             "Eino on lyhyempää päivää (n. 6 h). Hän syö hyvin ja ulkoilee mielellään hiekkalaatikolla.",
             "Huoltajat toivovat tukea kaverileikkeihin ja jakamisen harjoitteluun. Kotikielenä suomi ja venäjä.",
             ["kieli", "yhteiso"],
             "Eino harjoittelee vuorottelua ja leikkiin liittymistä. Kaksikielisyyden tukeminen: suomen kielen sanavaraston laajentaminen.",
             "Aikuisen tukemat pienryhmäleikit, kirjojen lukeminen yhdessä, kuvat ja tukiviittomat.",
             "ei", ""),
    "nooa": ("DRAFT", "2026-10-07",
             "Nooa on energinen ja liikunnallinen. Hän kiipeilee taitavasti ja nauttii palloleikeistä.",
             "Nooa on osapäiväisessä varhaiskasvatuksessa aamupäivisin. Ruokailu sujuu hyvin.",
             "Huoltajat toivovat, että Nooa oppii odottamaan vuoroaan ja rauhoittumaan lepohetkeen.",
             ["kasvan", "yhteiso"],
             "Itsesäätelytaitojen harjoittelu: odottaminen ja rauhoittuminen.",
             "Selkeä päivärytmi, liikunnalliset tauot, rauhoittumisnurkkaus.",
             "ei", ""),
    "leo": ("PREPARED", "2026-09-15",
            "Leo on luova rakentaja ja kertoo mielellään tarinoita. Hän on kiinnostunut dinosauruksista ja avaruudesta.",
            "Leolla on pähkinäallergia, adrenaliinikynä säilytetään ryhmän lääkekaapissa. Leo nukkuu lepohetkellä harvoin, hän lepää kirjan kanssa.",
            "Huoltajat toivovat, että Leon vietnamin kieltä arvostetaan ja että hän saa haasteita rakenteluun ja matematiikkaan.",
            ["tutkin", "kieli", "ilmaisu"],
            "Leo harjoittelee kuuntelemista ryhmätilanteissa ja omien ideoiden yhteensovittamista kavereiden kanssa.",
            "Projektityöskentely (avaruusprojekti), pienryhmät, monikielisyyden näkyväksi tekeminen ryhmässä.",
            "ei", ""),
    "aada": ("PREPARED", "2026-09-17",
             "Aada on empaattinen ja huolehtii pienemmistä kavereista. Hän piirtää ja askartelee paljon.",
             "Aadan päivät ovat pitkiä, joten lepohetki on hänelle tärkeä. Aada on viime aikoina ollut aamuisin väsynyt.",
             "Huoltaja toivoo, että Aadan väsymystä seurataan ja että hän saa riittävästi lepoa päivän aikana.",
             ["ilmaisu", "yhteiso"],
             "Aada harjoittelee omien rajojensa ilmaisemista ja vahvistaa itsetuntoa.",
             "Taidekasvatus, tunnetaitokortit, aikuisen kahdenkeskinen hetki päivittäin.",
             "ei", ""),
    "amina": ("PREPARED", "2026-09-24",
              "Amina on iloinen ja leikkii mielellään roolileikkejä. Hän on kiinnostunut laulamisesta ja tanssista.",
              "Amina syö hyvin, ruokavaliossa huomioidaan sianlihaton ruoka. Amina tarvitsee tukea pukemisessa ulkoilutilanteissa.",
              "Huoltajat toivovat suomen kielen vahvistamista; kotikieli on somali. Tulkki (somali) käytössä keskustelussa.",
              ["kieli", "ilmaisu"],
              "Suomen kielen sanavaraston kehittäminen arjen tilanteissa ja leikeissä.",
              "S2-tuki ryhmässä, kuvatuki, laulut ja lorut, kielitietoinen toiminta.",
              "yleinen", "S2-opetuksen tuki ryhmässä, kuvat päivän struktuurissa."),
    "mila": ("PREPARED", "2026-09-21",
             "Mila on kielellisesti taitava ja kertoo pitkiä tarinoita. Hän on kiinnostunut kirjaimista ja numeroista.",
             "Milalla on laktoositon ruokavalio. Kaverisuhteet ovat tärkeitä, Mila leikkii mielellään pienessä porukassa.",
             "Huoltajat toivovat, että Milan kiinnostusta kirjaimiin tuetaan ja että kaksikielisyys (suomi-venäjä) huomioidaan.",
             ["kieli", "tutkin", "yhteiso"],
             "Mila harjoittelee ristiriitatilanteiden ratkaisemista sanoin.",
             "Kirjainleikit, tarinankerronta, sovittelun mallintaminen aikuisen tuella.",
             "ei", ""),
    "elsa": ("DRAFT", "2026-10-12",
             "Elsa on rauhallinen ja keskittyvä. Hän nauttii palapeleistä ja luontoretkistä.",
             "Elsalla on siitepölyallergia keväisin. Elsa on aluksi varovainen uusissa tilanteissa.",
             "Huoltajat toivovat, että Elsaa rohkaistaan kokeilemaan uusia asioita ja ilmaisemaan itseään ryhmässä.",
             ["tutkin", "ilmaisu"],
             "Rohkeuden ja osallisuuden vahvistaminen ryhmätilanteissa.",
             "Pienryhmätoiminta, onnistumisen kokemukset, luontoretket.",
             "ei", ""),
    "eeli": ("PREPARED", "2026-09-30",
             "Eeli on matemaattisesti lahjakas ja innostuu kaikista peleistä. Hän osaa lukea lyhyitä sanoja.",
             "Eeli on aktiivinen ja tarvitsee paljon liikuntaa. Ruokailussa hän harjoittelee rauhassa istumista.",
             "Huoltajat toivovat, että Eeli saa riittävästi haasteita ja että hänen keskittymistään tuetaan ennen koulun alkua.",
             ["tutkin", "kieli", "kasvan"],
             "Eeli harjoittelee tehtävien loppuun saattamista ja ohjeiden kuuntelemista ryhmässä.",
             "Eriyttäminen ylöspäin matematiikassa, liikuntatauot, selkeät ohjeet visuaalisesti.",
             "ei", ""),
    "yusuf": ("PREPARED", "2026-10-02",
              "Yusuf on hyvä kaveri ja auttaa muita. Hän pitää jalkapallosta ja rakentelusta.",
              "Yusuf syö hyvin, ruokavaliossa huomioidaan sianlihaton ruoka. Hän on usein väsynyt maanantaisin.",
              "Huoltajat toivovat suomen kielen vahvistamista koulua varten. Kotikieli somali. Tulkki käytössä keskustelussa.",
              ["kieli", "yhteiso", "kasvan"],
              "Suomen kielen käsitteiden vahvistaminen (matemaattiset käsitteet, ajan käsitteet).",
              "S2-opetus pienryhmässä kahdesti viikossa, kuvatuki, toiminnallinen oppiminen.",
              "yleinen", "S2-opetus esiopetuksessa, kuvatuki."),
    "venla": ("DRAFT", "2026-10-06",
              "Venla on taiteellinen ja musikaalinen. Hän laulaa ja keksii omia lauluja.",
              "Venla on pitkää päivää, iltapäivisin hän tarvitsee rauhallisen hetken.",
              "Huoltaja toivoo, että Venlan itsevarmuutta tuetaan ja kaverisuhteita vahvistetaan.",
              ["ilmaisu", "yhteiso"],
              "Venla harjoittelee omien mielipiteiden ilmaisemista ryhmässä.",
              "Draamaleikit, musiikkikasvatus, vertaisparityöskentely.",
              "ei", ""),
    "lumi": ("DRAFT", "2026-10-09",
             "Lumi on tarkka ja huolellinen. Hän pitää luonnosta, eläimistä ja kirjoista.",
             "Lumi on vain esiopetuksessa (klo 9–13). Hän syö lounaan päiväkodilla.",
             "Huoltajat toivovat, että Lumi saa kokemuksia ryhmässä toimimisesta ennen koulua.",
             ["tutkin", "yhteiso"],
             "Ryhmätyötaitojen harjoittelu ja oman vuoron odottaminen.",
             "Pienryhmätyöskentely, luontoprojekti, vuorottelupelit.",
             "ei", ""),
}
for ck, (status, disc, strengths, wellbeing, gview, areas, goals, methods, sup, suptext) in DOCS.items():
    group = CH[ck][6]
    teacher = staff[TEACHER[group]]
    gkeys = FAMILY_GUARDIANS[C[ck]["fam"]]
    disc_d = date.fromisoformat(disc)
    participants = f"{teacher['first']} {teacher['last']} ({teacher['title']}), " + ", ".join(
        f"{P[g]['first']} {P[g]['last']} (huoltaja)" for g in gkeys)
    if sup != "ei":
        participants += ", Katja Järvinen (varhaiskasvatuksen erityisopettaja)"
    content = {"answers": [
        {"questionId": "laatijat", "type": "TEXT", "answer": participants},
        {"questionId": "keskustelupvm", "type": "DATE", "answer": disc},
        {"questionId": "aiemmat", "type": "TEXT", "answer": "Aiemman yksikön varhaiskasvatussuunnitelma luettu." if ck not in ("oliver", "nooa", "ilona", "eino") else ""},
        {"questionId": "vahvuudet", "type": "TEXT", "answer": strengths},
        {"questionId": "hyvinvointi", "type": "TEXT", "answer": wellbeing},
        {"questionId": "huoltaja", "type": "TEXT", "answer": gview},
        {"questionId": "alueet", "type": "CHECKBOX_GROUP", "answer": [{"optionId": a, "extra": ""} for a in areas]},
        {"questionId": "tavoitteet", "type": "TEXT", "answer": goals},
        {"questionId": "toimenpiteet", "type": "TEXT", "answer": methods},
        {"questionId": "tukitaso", "type": "RADIO_BUTTON_GROUP", "answer": sup},
        {"questionId": "tukitoimet", "type": "TEXT", "answer": suptext},
        {"questionId": "sovitut", "type": "TEXT", "answer": "Kuulumisia vaihdetaan hakutilanteissa ja eVakan viesteillä. Väliarviointikeskustelu sovitaan helmikuussa."},
        {"questionId": "seuraava", "type": "DATE", "answer": "2027-02-15"},
        {"questionId": "huoltajanakemys", "type": "CHECKBOX", "answer": True},
    ]}
    modified = hdt(disc_d + timedelta(days=1 if status == "PREPARED" else 0), T("14:20"))
    published = []
    if status == "PREPARED":
        published = [{"versionNumber": 1, "createdAt": hdt(disc_d + timedelta(days=1), T("14:25")),
                      "createdBy": teacher["id"], "publishedContent": content, "documentKey": None}]
    add("child_document", {
        "id": uid(), "createdAt": hdt(disc_d - timedelta(days=7), T("13:00")), "createdBy": teacher["id"],
        "status": status, "childId": C[ck]["id"], "templateId": LEOPS_T if CH[ck][7].startswith("PRESCHOOL") else VASU_T,
        "content": content, "modifiedAt": modified, "modifiedBy": teacher["id"],
        "statusModifiedAt": modified, "contentLockedAt": modified, "contentLockedBy": None,
        "publishedVersions": published,
    })

# ---------------------------------------------------------------- pedagogical documentation & calendar
for ck, text, d in [
    ("leo", "Avaruusprojekti: Leo rakensi ryhmän kanssa raketin pahvilaatikoista ja kertoi muille, miten planeetat kiertävät aurinkoa.", date(2026, 10, 1)),
    ("mila", "Mila kirjoitti ensimmäistä kertaa oman nimensä ja kaverinsa nimen syyskorttiin.", date(2026, 10, 6)),
    ("eeli", "Eskarin metsäretkellä Eeli laski ja lajitteli käpyjä ja lehtiä ja teki niistä pylväsdiagrammin.", date(2026, 10, 7)),
    ("ilona", "Ilona tanssi rohkeasti musiikkituokiossa ja keksi itse uuden liikkeen Hämähäkki-lauluun.", date(2026, 10, 8)),
]:
    teacher = staff[TEACHER[CH[ck][6]]]["id"]
    add("pedagogical_document", {"id": uid(), "childId": C[ck]["id"], "description": text,
                                 "createdAt": hdt(d, T("15:10")), "createdBy": teacher,
                                 "modifiedAt": hdt(d, T("15:10")), "modifiedBy": teacher})

ev1, ev2, ev3 = uid(), uid(), uid()
add("calendar_event", {"id": ev1, "title": "Vanhempainilta", "description": "Tervetuloa uuden päiväkodin ensimmäiseen vanhempainiltaan! Kahvitarjoilu klo 17.30, ohjelmassa toimintakauden suunnitelmat ja yhteistyö. Lapsille järjestetään hoito salissa.",
                       "period": {"start": "2026-10-27", "end": "2026-10-27"}, "modifiedAt": hdt(date(2026, 10, 5), T("12:00")),
                       "modifiedBy": SUPERVISOR, "eventType": "DAYCARE_EVENT"})
add("calendar_event_attendee", {"id": uid(), "calendarEventId": ev1, "unitId": UNIT})
add("calendar_event", {"id": ev2, "title": "Eskarin metsäretki Nuuksioon", "description": "Lähdemme bussilla klo 8.45 ja palaamme n. klo 14. Lapsella oltava sään mukainen vaatetus, kumisaappaat ja reppu juomapullon kanssa. Eväät päiväkodista.",
                       "period": {"start": "2026-10-21", "end": "2026-10-21"}, "modifiedAt": hdt(date(2026, 10, 9), T("14:00")),
                       "modifiedBy": staff["sanna"]["id"], "eventType": "DAYCARE_EVENT"})
add("calendar_event_attendee", {"id": uid(), "calendarEventId": ev2, "unitId": UNIT, "groupId": G_KETUT})
add("calendar_event", {"id": ev3, "title": "Valokuvaus", "description": "Ryhmä- ja yksilökuvaus. Sisarkuvat otetaan aamupäivällä klo 9–10.",
                       "period": {"start": "2026-11-05", "end": "2026-11-05"}, "modifiedAt": hdt(date(2026, 10, 12), T("09:30")),
                       "modifiedBy": SUPERVISOR, "eventType": "DAYCARE_EVENT"})
add("calendar_event_attendee", {"id": uid(), "calendarEventId": ev3, "unitId": UNIT})

# ---------------------------------------------------------------- output
ORDER = ["daycare", "daycare_group", "daycare_caretaker", "employee", "daycare_acl", "daycare_group_acl", "employee_pin",
         "staff_attendance_plan", "staff_attendance_realtime", "adult", "child", "guardian", "fridge_child",
         "fridge_partnership", "backup_pickup", "application", "placement", "service_need", "daycare_group_placement",
         "daily_service_times", "service_application", "absence", "attendance_reservation", "child_attendance",
         "absence_application", "document_template", "child_document", "pedagogical_document", "calendar_event",
         "calendar_event_attendee"]
assert set(ORDER) == set(rows), set(rows) ^ set(ORDER)
out = {"batch": "kuusikallio-testidata", "rows": [{"type": k, "rows": rows[k]} for k in ORDER]}
import sys
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
json.dump({"unit": UNIT, "sara_app": sara_app, "topias_app": topias_app, "groups": GROUPS,
           "staff": {k: v["id"] for k, v in staff.items()}}, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
for k in ORDER:
    print(k, len(rows[k]))
