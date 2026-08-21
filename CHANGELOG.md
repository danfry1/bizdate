# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-21

### Added

- Business-day arithmetic: `isBusinessDay`, `nextBusinessDay`, `previousBusinessDay`,
  `addBusinessDays`, `businessDaysBetween`, `nonBusinessDaysBetween`, `settlementDate`, and
  `adjust` with all seven ISDA business-day conventions.
- Rule-based market calendars for the NYSE, SIFMA, Fedwire, US settlement, TARGET2, the
  LSE and the UK, plus `weekendsOnly` and `everyDay`; `customCalendar` and `jointCalendar`
  for anything else. Every calendar matches QuantLib from 1971 to 2100.
- Twelve day count conventions as exact fractions, with `dayCountFraction`,
  `exactDayCountFraction`, `dayCountDays` and alias resolution via `normalizeConvention`.
- Schedule generation with roll direction, stubs, end-of-month rules, payment lags, and
  both adjusted and unadjusted period dates.
- Interest and amortization in integer minor units: `accrue`, `accrueExact`, `amortize`,
  `exactLevelPayment`, plus `roundFraction` and `allocate`.
- Exact rational arithmetic (`Fraction`) and civil date utilities.
- Typed errors with literal codes: `DateParseError`, `InvalidDateError`,
  `InvalidArgumentError`, `CalendarRangeError`, `ScheduleError`.
