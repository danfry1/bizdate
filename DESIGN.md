# Design

Why this package looks the way it does. Each decision is recorded with the alternative it
was chosen over, so a later change is a deliberate reversal rather than an accident.

## Exact arithmetic, rounded once

Every quantity — a day count fraction, an interest charge, a mortgage instalment — is
carried as an exact rational (`bigint` numerator over `bigint` denominator) until the
moment it becomes money. That is the single point where precision is lost, under a policy
the caller names.

The alternative, used by every comparable JavaScript library, is to accumulate in `number`.
It fails in two visible ways: `ACT/ACT ISDA` across a year boundary is a sum of fractions
with different denominators, and `(1 + i)^360` in a mortgage is a 1,827-digit ratio. Both
are exact here.

The public API still hands back a `number` where a `number` is what you need
(`dayCountFraction`), converted once at the end through a fixed-point division that stays
within one unit in the last place even when both parts overflow a double. `exactDayCountFraction`
returns the fraction itself.

Money is always integer minor units as `bigint`. A `number` notional is rejected rather
than silently rounded.

## `Result` only where failure is expected

`Result<T, E>` appears in exactly one place: `parseDate`, where the input is untrusted text
from a file, a form or an API and being wrong is ordinary. Everywhere else, invalid input
is a programmer error and throws a typed error.

The alternative — returning `Result` across the whole surface — would put an `unwrap` on
every `isBusinessDay` call. The cost of that ceremony is not paid back when the failure it
guards against is a bug that should stop the program. Three shapes cover the three needs:
`isIsoDate` (boolean), `parseDate` (result), `parseDateOrThrow` and everything else
(throws).

Errors carry a literal `code`, structured fields and a `toJSON`, so callers branch on the
failure rather than matching on a message.

## Dates are strings, and `Date` is not accepted

Every date in and out of this package is a `YYYY-MM-DD` string. There is no wrapper class
to construct, nothing to register as a plugin, and no coupling to `moment`, `dayjs`,
`luxon`, `date-fns` or `Temporal`. Internally dates become epoch-day integers, so the
arithmetic is integer arithmetic.

A JavaScript `Date` is an instant, not a calendar date: reading a day out of one requires
choosing a time zone, and a library that chooses silently will be wrong for half its users
at midnight. `fromJsDate(date, { zone: 'utc' | 'local' })` makes the choice explicit and
is one line at the boundary.

The supported range is 1600-01-01 to 9999-12-31, in the proleptic Gregorian calendar.
Calendars narrow that further to the years their rules have been checked over.

## Calendars are rules, not data

A holiday calendar is a list of rules — a fixed date with an observance rule, an nth
weekday, an offset from Easter — plus pinned one-off closures for the days a market shut
for a funeral or a storm. Rules generate correct dates arbitrarily far forward, so no
yearly data update is needed and no network fetch exists.

`validFrom` and `validThrough` state the years each calendar has actually been checked
over. Outside that window the honest answer is not a guess, so it is a
`CalendarRangeError`. One-off closures are historical facts, current as of the package
version; a newly announced closure is a patch release.

The rules are plain data, which is why `customCalendar` can accept the same shapes and
`jointCalendar` can combine markets without a special case.

## Checked against QuantLib, and where it is not

QuantLib is the reference implementation this domain has, so the calendars, conventions,
adjustments and schedules are all generated from it into fixtures and compared exactly —
not to a handful of copied numbers, but to every holiday on eight calendars from 1971 to
2100, 46,540 day count cases, and 1,144 schedules. `scripts/generate-golden.py` regenerates
the fixtures.

Two deliberate divergences are listed in `tests/golden-holidays.test.ts` with their
reasons, and anything not on that list fails the test:

- **Martin Luther King Jr. Day before 1986.** Public Law 98-144 was signed in November 1983
  and set the first observance for January 1986. QuantLib starts the holiday in 1983.
- **9 January 2025 on the SIFMA calendar.** SIFMA recommended a full close for the national
  day of mourning; QuantLib carries the closure for the NYSE but not the bond market.

Two behaviours match QuantLib because parity is more useful than the alternative, and both
are documented at their call sites: `endOfMonth` is ignored when the date a schedule rolls
from is not a month end, and a date counts as a month end when it is the last day the
market is open that month, not only the last day of the month.

## Amortization must repay the loan

An amortization schedule that does not sum back to the principal is not a rounding
difference, it is a wrong answer. Interest is computed exactly from the outstanding balance
and rounded once per period; principal is the remainder; the final period absorbs whatever
rounding left behind. The balance reaches exactly zero and the rows sum exactly to the
amount borrowed.

The instalment itself is rounded up by default, which is what lenders do — rounding an
instalment down can leave it below the interest charge, in which case the balance never
falls. When rounding would still leave a computed instalment short, it is raised to the
smallest amount that repays the loan. An instalment supplied by the caller is never
adjusted: if it cannot repay the loan, that is an `InvalidArgumentError`, because silently
changing a lender's quoted payment would be worse than refusing.

## Performance

The hot paths are integer arithmetic on epoch days with per-year memoised holiday sets:
about 4M business-day checks and 3M date adjustments a second. Where an exact rational
would be expensive — the mortgage instalment, whose reduction to lowest terms would mean a
greatest-common-divisor search over thousand-digit integers — the value is computed as an
unreduced ratio and rounded directly, since rounding needs only a division. A 360-period
schedule builds in about 0.2 ms.
