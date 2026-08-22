# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-21

First release. The public surface is frozen-additive from here — see
[API-STABILITY.md](API-STABILITY.md).

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

### Added later in 0.1.0

- `accruedInterest`, the calculation behind a bond's dirty price: it finds the coupon period
  a settlement date falls in, takes the frequency and reference period from the schedule,
  and requires an explicit choice between accruing on adjusted or unadjusted dates. A stub
  coupon is measured against its notional period per ICMA rule 251 rather than its own
  length. Checked against 1,375 QuantLib bond coupons, period boundaries included.
- `periodContaining`, the period lookup on its own.
- Mutation testing (`bun run test:mutation`), scored at 84.6% with every survivor reviewed;
  CI fails below 80%.

### Fixed

- A percentage rate with surrounding whitespace (`' 2.5% '`) was rejected as malformed: the
  `%` was looked for before the input was trimmed.
- A `null` rate escaped as a bare `TypeError` from reading a property of nothing, instead of
  the typed `InvalidArgumentError` every other bad input produces.

Both were found by tests written to close mutation-testing gaps, having survived reference
and property testing.

### Documentation

- [MIGRATING.md](MIGRATING.md): swaps for `moment-business-days`, `dayjs-business-days2`
  and `luxon-business-days`, turning an existing holiday list into a calendar, and a
  `date-holidays` bridge for national holidays in countries this package does not ship.
- [API-STABILITY.md](API-STABILITY.md): what is frozen, what is not (calendar contents move
  when a closure is announced), and the questions left open until 1.0.
- [ASSURANCE.md](ASSURANCE.md): every verification method, the mutation score with its
  survivor analysis, and what none of it covers.

### Notes

The exact-arithmetic helpers carry domain names — `addFractions`, `fractionToNumber`,
`raiseFraction` — rather than the bare `add`, `toNumber` and `power` they were written as.
A package root is a shared namespace, and freezing `add` into it would have been a
collision waiting to happen.

`Temporal.PlainDate` is accepted anywhere a date is, with no adapter and no dependency: it
already carries `year`, `month` and `day`.

Findings from a pre-release review, all fixed before this release and covered by regression
tests: the fixed-point conversion in `toNumber` quantised very small fractions towards zero;
`ACT/ACT ICMA` accepted sub-monthly frequencies it cannot express; schedules accepted
fractional and negative payment lags and inferred stubs from period lengths; dated
amortization sized its instalment from an average rate rather than solving the
variable-period annuity, and a caller-supplied instalment too small to repay the loan
produced a silent balloon; custom calendar rules describing impossible dates were clamped
rather than refused; and `allocate` quantised fractional weights to six decimal places.
