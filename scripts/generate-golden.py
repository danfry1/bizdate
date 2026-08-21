"""Generates golden fixtures from QuantLib.

QuantLib is the reference implementation the finance industry checks its own
code against; every convention and calendar this package ships is validated
against it here rather than against hand-copied numbers.

Run with the venv interpreter that has QuantLib installed:
    python scripts/generate-golden.py tests/fixtures
"""
import json
import sys
from pathlib import Path

import QuantLib as ql

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures")
OUT.mkdir(parents=True, exist_ok=True)


def d(date: ql.Date) -> str:
    return f"{date.year():04d}-{date.month():02d}-{date.dayOfMonth():02d}"


def qld(iso: str) -> ql.Date:
    y, m, day = (int(part) for part in iso.split("-"))
    return ql.Date(day, m, y)


CALENDARS = {
    "nyse": ql.UnitedStates(ql.UnitedStates.NYSE),
    "sifma": ql.UnitedStates(ql.UnitedStates.GovernmentBond),
    "fedwire": ql.UnitedStates(ql.UnitedStates.FederalReserve),
    "unitedStates": ql.UnitedStates(ql.UnitedStates.Settlement),
    "target": ql.TARGET(),
    "lse": ql.UnitedKingdom(ql.UnitedKingdom.Exchange),
    "unitedKingdom": ql.UnitedKingdom(ql.UnitedKingdom.Settlement),
    "weekendsOnly": ql.WeekendsOnly(),
}

FIRST_YEAR, LAST_YEAR = 1971, 2100


def calendar_holidays() -> dict:
    out = {}
    for name, cal in CALENDARS.items():
        start = ql.Date(1, 1, FIRST_YEAR)
        end = ql.Date(31, 12, LAST_YEAR)
        # includeWeekEnds=False: weekend days are not holidays in this package's model.
        dates = ql.Calendar.holidayList(cal, start, end, False)
        out[name] = [d(x) for x in dates]
    return out


DAY_COUNTERS = {
    "30/360": ql.Thirty360(ql.Thirty360.BondBasis),
    "30/360 US": ql.Thirty360(ql.Thirty360.USA),
    "30E/360": ql.Thirty360(ql.Thirty360.European),
    "30E/360 ISDA": ql.Thirty360(ql.Thirty360.German),
    "ACT/360": ql.Actual360(),
    "ACT/365F": ql.Actual365Fixed(),
    "NL/365": ql.Actual365Fixed(ql.Actual365Fixed.NoLeap),
    "ACT/ACT ISDA": ql.ActualActual(ql.ActualActual.ISDA),
    "ACT/ACT AFB": ql.ActualActual(ql.ActualActual.AFB),
    "1/1": ql.OneDayCounter(),
}


def date_pairs() -> list:
    """Dates chosen to hit every edge the conventions distinguish: month ends,
    February in leap and common years, 30th/31st starts, year boundaries."""
    seeds = []
    for year in (1999, 2000, 2003, 2004, 2019, 2020, 2023, 2024, 2025, 2026, 2027, 2028):
        for month in range(1, 13):
            last = ql.Date.endOfMonth(ql.Date(1, month, year)).dayOfMonth()
            for day in {1, 14, 15, 28, 29, 30, 31, last, last - 1}:
                if 1 <= day <= last:
                    seeds.append(ql.Date(day, month, year))
    seeds = sorted(set(seeds), key=lambda x: x.serialNumber())
    pairs = []
    offsets = [1, 15, 28, 29, 30, 31, 59, 90, 181, 182, 183, 365, 366, 730, 1096]
    for i, start in enumerate(seeds):
        for offset in offsets[(i % 3) :: 3]:
            end = start + offset
            if end.year() <= 2030:
                pairs.append((start, end))
    return pairs


def day_counts() -> list:
    rows = []
    for start, end in date_pairs():
        entry = {"start": d(start), "end": d(end), "results": {}}
        for name, counter in DAY_COUNTERS.items():
            entry["results"][name] = {
                "days": counter.dayCount(start, end),
                "fraction": counter.yearFraction(start, end),
            }
        rows.append(entry)
    return rows


def bus252() -> list:
    rows = []
    counter = {name: ql.Business252(cal) for name, cal in CALENDARS.items() if name in ("nyse", "target")}
    for start, end in date_pairs()[::7]:
        if start.year() < FIRST_YEAR:
            continue
        rows.append(
            {
                "start": d(start),
                "end": d(end),
                "results": {
                    name: {"days": c.dayCount(start, end), "fraction": c.yearFraction(start, end)}
                    for name, c in counter.items()
                },
            }
        )
    return rows


ICMA_FREQUENCIES = {
    "annual": ql.Annual,
    "semi-annual": ql.Semiannual,
    "quarterly": ql.Quarterly,
    "monthly": ql.Monthly,
}


def act_act_icma() -> list:
    """Accrual inside, across and beyond coupon periods, including stubs."""
    rows = []
    counter = ql.ActualActual(ql.ActualActual.ISMA)
    cases = [
        ("2003-11-01", "2004-05-01", "2003-11-01", "2004-05-01", "semi-annual"),
        ("2003-11-01", "2004-01-15", "2003-11-01", "2004-05-01", "semi-annual"),
        ("2004-02-01", "2004-05-30", "2004-02-01", "2004-08-01", "semi-annual"),
        ("2004-02-01", "2004-04-01", "2004-02-01", "2004-08-01", "semi-annual"),
        ("2003-02-15", "2003-07-15", "2003-02-15", "2003-08-15", "semi-annual"),
        ("2026-01-31", "2026-04-30", "2026-01-31", "2026-07-31", "semi-annual"),
        ("2026-02-28", "2026-05-31", "2026-02-28", "2026-08-31", "semi-annual"),
        ("2024-01-01", "2024-12-31", "2024-01-01", "2025-01-01", "annual"),
        ("2024-03-15", "2024-06-15", "2024-03-15", "2024-06-15", "quarterly"),
        ("2024-03-15", "2024-05-01", "2024-03-15", "2024-06-15", "quarterly"),
        ("2024-01-15", "2024-02-15", "2024-01-15", "2024-02-15", "monthly"),
        ("2024-02-29", "2024-08-29", "2024-02-29", "2024-08-29", "semi-annual"),
        ("2023-12-31", "2024-06-30", "2023-12-31", "2024-06-30", "semi-annual"),
        ("2024-05-31", "2024-11-30", "2024-05-31", "2024-11-30", "semi-annual"),
    ]
    for start, end, ref_start, ref_end, freq in cases:
        rows.append(
            {
                "start": start,
                "end": end,
                "referenceStart": ref_start,
                "referenceEnd": ref_end,
                "frequency": freq,
                "fraction": counter.yearFraction(qld(start), qld(end), qld(ref_start), qld(ref_end)),
            }
        )
    return rows


CONVENTIONS = {
    "unadjusted": ql.Unadjusted,
    "following": ql.Following,
    "modified-following": ql.ModifiedFollowing,
    "preceding": ql.Preceding,
    "modified-preceding": ql.ModifiedPreceding,
    "nearest": ql.Nearest,
    "half-month-modified-following": ql.HalfMonthModifiedFollowing,
}


def adjustments() -> list:
    rows = []
    for cal_name in ("nyse", "target", "lse", "unitedStates"):
        cal = CALENDARS[cal_name]
        start = ql.Date(1, 1, 2019)
        for offset in range(0, 2900, 3):
            date = start + offset
            entry = {
                "calendar": cal_name,
                "date": d(date),
                "isBusinessDay": cal.isBusinessDay(date),
                "adjusted": {
                    name: d(cal.adjust(date, convention)) for name, convention in CONVENTIONS.items()
                },
                "advance": {
                    str(n): d(cal.advance(date, ql.Period(n, ql.Days)))
                    for n in (-5, -1, 0, 1, 2, 3, 10)
                },
                "businessDaysToPlus30": cal.businessDaysBetween(date, date + 30, True, False),
            }
            rows.append(entry)
    return rows


def write(name: str, payload) -> None:
    path = OUT / name
    path.write_text(json.dumps(payload, indent=0, separators=(",", ":")) + "\n")
    print(f"{name}: {path.stat().st_size // 1024} KiB")


write("quantlib-holidays.json", {"quantlib": ql.__version__, "calendars": calendar_holidays()})
write("quantlib-daycount.json", {"quantlib": ql.__version__, "cases": day_counts()})
write("quantlib-bus252.json", {"quantlib": ql.__version__, "cases": bus252()})
write("quantlib-icma.json", {"quantlib": ql.__version__, "cases": act_act_icma()})
write("quantlib-adjust.json", {"quantlib": ql.__version__, "cases": adjustments()})


TENORS = {
    "annual": ql.Period(12, ql.Months),
    "semi-annual": ql.Period(6, ql.Months),
    "quarterly": ql.Period(3, ql.Months),
    "monthly": ql.Period(1, ql.Months),
    "weekly": ql.Period(7, ql.Days),
}

RULES = {"backward": ql.DateGeneration.Backward, "forward": ql.DateGeneration.Forward}


def schedules() -> list:
    rows = []
    base = [
        ("2024-01-15", "2029-01-15"),
        ("2024-01-31", "2027-01-31"),
        ("2024-02-29", "2027-02-28"),
        ("2024-03-30", "2026-03-30"),
        ("2023-11-30", "2026-11-30"),
        ("2024-05-31", "2026-05-31"),
        ("2024-01-15", "2026-07-20"),
        ("2024-02-15", "2025-08-31"),
        ("2026-01-01", "2031-01-01"),
        ("2024-06-15", "2025-01-10"),
    ]
    for effective, termination in base:
        for freq, tenor in TENORS.items():
            for rule_name, rule in RULES.items():
                for eom in (False, True):
                    for conv_name, conv in (
                        ("unadjusted", ql.Unadjusted),
                        ("following", ql.Following),
                        ("modified-following", ql.ModifiedFollowing),
                    ):
                        for cal_name in ("target", "nyse"):
                            if freq == "weekly" and rule_name == "backward" and eom:
                                continue
                            sched = ql.Schedule(
                                qld(effective),
                                qld(termination),
                                tenor,
                                CALENDARS[cal_name],
                                conv,
                                conv,
                                rule,
                                eom,
                            )
                            rows.append(
                                {
                                    "effective": effective,
                                    "termination": termination,
                                    "frequency": freq,
                                    "roll": rule_name,
                                    "endOfMonth": eom,
                                    "convention": conv_name,
                                    "calendar": cal_name,
                                    "dates": [d(x) for x in sched],
                                }
                            )
    # Explicit stubs
    stubs = [
        ("2024-01-15", "2029-04-15", "semi-annual", "backward", "2024-07-15", None),
        ("2024-01-15", "2029-04-15", "semi-annual", "forward", None, "2029-01-15"),
        ("2024-02-10", "2027-08-31", "quarterly", "backward", "2024-05-31", None),
        ("2024-02-10", "2027-08-31", "quarterly", "forward", None, "2027-05-10"),
    ]
    for effective, termination, freq, rule_name, first, next_to_last in stubs:
        sched = ql.Schedule(
            qld(effective),
            qld(termination),
            TENORS[freq],
            CALENDARS["target"],
            ql.Unadjusted,
            ql.Unadjusted,
            RULES[rule_name],
            False,
            qld(first) if first else ql.Date(),
            qld(next_to_last) if next_to_last else ql.Date(),
        )
        rows.append(
            {
                "effective": effective,
                "termination": termination,
                "frequency": freq,
                "roll": rule_name,
                "endOfMonth": False,
                "convention": "unadjusted",
                "calendar": "target",
                "firstRegularDate": first,
                "lastRegularDate": next_to_last,
                "dates": [d(x) for x in sched],
            }
        )
    return rows


write("quantlib-schedule.json", {"quantlib": ql.__version__, "cases": schedules()})
