# bizdate

[![CI](https://github.com/danfry1/bizdate/actions/workflows/ci.yml/badge.svg)](https://github.com/danfry1/bizdate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/bizdate.svg)](https://www.npmjs.com/package/bizdate)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://github.com/danfry1/bizdate/blob/main/package.json)
[![license](https://img.shields.io/npm/l/bizdate.svg)](https://github.com/danfry1/bizdate/blob/main/LICENSE)

Business days, market calendars, day count conventions and interest — for TypeScript.
Zero dependencies, and checked against QuantLib over 130 years of dates.

```ts
import { isBusinessDay, settlementDate, nyse } from 'bizdate'

isBusinessDay('2026-11-26', nyse)                        // false — Thanksgiving
settlementDate('2026-11-25', { days: 2, calendar: nyse }) // '2026-11-30' — T+2
```

- **Real market calendars** — NYSE, SIFMA, Fedwire, US settlement, TARGET2, LSE, UK, plus
  your own. Published rules in code, not a data feed, so a future year needs no update —
  within the years each calendar states it has been checked over, and excluding closures
  nobody has announced yet.
- **Twelve day count conventions** — 30/360 (US and bond basis), 30E/360, 30E/360 ISDA,
  ACT/360, ACT/365F, NL/365, ACT/ACT ISDA, ACT/ACT ICMA, ACT/ACT AFB, BUS/252, 1/1 — as
  **exact fractions**, not floats.
- **Schedules** — coupon and payment schedules with roll conventions, short and long stubs,
  end-of-month rules, payment lags, and both adjusted and unadjusted dates per period.
- **Money that adds up** — interest and amortization in integer minor units, where the only
  rounding is the one you asked for, and an amortization schedule provably repays the
  principal to the penny.
- **Checked against QuantLib 1.43** — every holiday on eight calendars from 1971 to 2100,
  46,540 day count cases, 1,144 generated schedules, and every business-day convention on
  ~3,900 dates.
- **Zero dependencies.** ESM and CommonJS, Node 20+, Deno, Bun and every evergreen browser.
  Tree-shakes: 4 KB gzipped for the business-day path, 12 KB for all of it.

## Install

```sh
npm install bizdate      # or: pnpm add bizdate · yarn add bizdate · bun add bizdate
```

```ts
import { isBusinessDay } from 'bizdate'                    // ESM
const { isBusinessDay } = require('bizdate')               // CommonJS
import { isBusinessDay } from 'npm:bizdate'                // Deno
```

## The next open day

```ts
import {
  addBusinessDays, adjust, businessDaysBetween, isBusinessDay,
  nextBusinessDay, settlementDate, holidays, jointCalendar,
  nyse, target, lse,
} from 'bizdate'

isBusinessDay('2026-12-25', nyse)                          // false
nextBusinessDay('2026-11-25', nyse)                        // '2026-11-27'
addBusinessDays('2026-11-24', 3, nyse)                     // '2026-11-30'
businessDaysBetween('2026-11-23', '2026-11-27', nyse)      // 3

// 31 January 2026 is a Saturday; the market convention moves it back rather
// than into February.
adjust('2026-01-31', 'modified-following', nyse)           // '2026-01-30'

// A euro/dollar trade settles only when both markets are open: Good Friday
// shuts both, and Easter Monday shuts TARGET2, so T+2 lands on the Tuesday.
settlementDate('2026-04-01', { days: 2, calendar: jointCalendar(nyse, target) })  // '2026-04-07'

holidays(lse, 2026)
// [{ date: '2026-01-01', name: "New Year's Day" }, … { date: '2026-12-28', name: 'Boxing Day' }]
```

Dates are plain `YYYY-MM-DD` strings in, plain strings out. No wrapper objects, no plugin
to register, and no dependency on `moment`, `dayjs`, `luxon` or `date-fns`. A
`Temporal.PlainDate` is accepted anywhere a date is — it already has `year`, `month` and
`day` — and `Temporal.PlainDate.from(result)` converts back.

### Coming from `moment-business-days`

Full guide, including Day.js and Luxon plugins and a `date-holidays` bridge for national
holidays: [MIGRATING.md](MIGRATING.md).

| moment-business-days | bizdate |
| --- | --- |
| `moment('2026-11-25').isBusinessDay()` | `isBusinessDay('2026-11-25', nyse)` |
| `moment('2026-11-24').businessAdd(3)` | `addBusinessDays('2026-11-24', 3, nyse)` |
| `moment('2026-11-25').nextBusinessDay()` | `nextBusinessDay('2026-11-25', nyse)` |
| `moment('2026-11-23').businessDiff(moment('2026-11-27'))` | `businessDaysBetween('2026-11-23', '2026-11-27', nyse)` |
| `moment.updateLocale('us', { holidays: [...] })` | `customCalendar({ id: 'us', dates: [...], validFrom, validThrough })` |

The holiday list is the part you no longer maintain: `moment-business-days` needs a
hand-written array of dates, updated every year. Here the calendars are rules, so 2031 is
as correct as 2026.

## Day count conventions

```ts
import { dayCountFraction, exactDayCountFraction, toFractionString } from 'bizdate'

dayCountFraction('2026-01-31', '2026-07-31', 'ACT/365F')   // 0.4958904109589041
dayCountFraction('2026-01-31', '2026-07-31', '30E/360')    // 0.5

// The same calculation, exact: a ratio of integers, never a float.
toFractionString(exactDayCountFraction('2026-01-31', '2026-07-31', 'ACT/365F'))  // '181/365'

// ACT/ACT ISDA splits at the year boundary — two fractions with different
// denominators, summed exactly rather than in binary floating point.
toFractionString(exactDayCountFraction('2023-12-01', '2024-02-01', 'ACT/ACT ISDA'))
// '22661/133590'
```

Names are matched the way the market writes them: `Actual/360`, `act/360` and `A/360` all
resolve to `ACT/360`; `ISMA` resolves to `ACT/ACT ICMA`. Conventions that need more than
two dates ask for it — `ACT/ACT ICMA` wants the coupon period and frequency, `BUS/252`
wants a calendar — and throw a typed error rather than guess.

## Schedules

```ts
import { generateSchedule, nyse } from 'bizdate'

const schedule = generateSchedule({
  effective: '2026-01-31',
  termination: '2031-01-31',
  frequency: 'semi-annual',
  calendar: nyse,
  convention: 'modified-following',
  endOfMonth: true,
  paymentLag: 2,
})

schedule.periods[0]
// {
//   index: 0,
//   unadjustedStart: '2026-01-31',   // what the contract says
//   unadjustedEnd:   '2026-07-31',
//   start: '2026-01-30',             // when the market is actually open
//   end:   '2026-07-31',
//   paymentDate: '2026-08-04',       // two business days later
//   isStub: false,
// }
```

Periods are counted back from maturity by default, so every regular payment keeps the
maturity's day of the month and any odd period falls at the front. Both the unadjusted and
adjusted dates are kept, because interest usually accrues on one and settles on the other.

## Interest and amortization

Money is integer minor units — `bigint` cents, pence, satoshi — so there is no float to
drift. Rates are decimal strings or numbers read as the decimal you wrote: `0.0525`,
`'0.0525'` and `'5.25%'` are the same rate, and none of them is the binary double
`0.05000000000000000277…`.

```ts
import { accrue, amortize } from 'bizdate'

accrue({
  notional: 1_000_000_00n,       // 1,000,000.00
  rate: '5.25%',
  start: '2026-01-31',
  end: '2026-07-31',
  convention: 'ACT/365F',
})                               // 2_603_425n → 26,034.25

const loan = amortize({
  kind: 'periodic',
  principal: 250_000_00n,
  annualRate: '4.99%',
  periodsPerYear: 12,
  periods: 360,
})

loan.payment                     // 134_053n → 1,340.53 a month
loan.periods[0].interest         // 103_958n
loan.periods[359].balance        // 0n — exactly, always
loan.periods.reduce((sum, p) => sum + p.principal, 0n) === 250_000_00n  // true
```

The instalment is the exact annuity for the periods given, rounded up as a lender would;
the final payment differs from it only by the rounding accumulated along the way. An
instalment you supply yourself is checked rather than adjusted: one too small to repay the
loan is refused unless you pass `balloon: true`, because silently turning a quoted payment
into a lump sum at maturity would be worse than an error.

`(1 + i)^360` is a ratio of two 1,827-digit integers. It is carried exactly and rounded
once, rather than accumulated through 360 floating-point multiplications — and a
360-period schedule still builds in about 0.2 ms.

Interest can also be charged on real dates rather than nominal periods, which is what a
loan actually does. Period rates then differ — a 92-day quarter costs more than an 89-day
one — so the instalment is solved for those actual periods rather than an average:

```ts
amortize({
  kind: 'dated',
  schedule,                      // from generateSchedule
  convention: 'ACT/365F',
  principal: 100_000_00n,
  annualRate: '6%',
})
```

### Accrued interest

The calculation behind a bond's dirty price, where every layer meets — the schedule finds
the coupon period, the convention measures it, the money layer rounds it once:

```ts
import { accruedInterest, generateSchedule, target } from 'bizdate'

const bond = generateSchedule({
  effective: '2024-05-15',
  termination: '2029-05-15',
  frequency: 'semi-annual',
  calendar: target,
  convention: 'following',
})

const accrued = accruedInterest({
  schedule: bond,
  settlement: '2026-08-22',
  notional: 1_000_000_00n,
  rate: '3.5%',
  convention: 'ACT/ACT ICMA',
  dates: 'unadjusted',
})

accrued.amount              // 941_576n → 9,415.76
accrued.days                // 99
accrued.period.unadjustedEnd // '2026-11-15' — the coupon it belongs to
```

Three things this does that a hand-written version usually gets wrong:

- **`dates` is required**, because it decides the number. A bond's term sheet describes
  unadjusted coupon dates and moves only the payment when a date is closed; a swap accrues
  on the adjusted dates it pays on. Both fields exist on every period, so the wrong one is
  one keystroke away and produces a plausible answer that is a day or two out.
- **`ACT/ACT ICMA` gets its frequency and reference period from the schedule**, rather than
  from you repeating them.
- **A stub coupon is measured against its notional period**, per ICMA rule 251 — not
  against its own shorter length, which would inflate the accrual.

All 1,375 of these are checked against QuantLib's own coupon accrual, boundaries included.

Splitting money is covered too: `allocate(100n, [1, 1, 1])` gives `[34n, 33n, 33n]` — the
total always survives the division.

## Correctness

The reference implementation for this domain is QuantLib, which the industry has checked
its own systems against for twenty years. The fixtures are generated from **QuantLib 1.43**
and compared exactly:

| What | Cases |
| --- | --- |
| Holiday calendars | every holiday on 8 calendars, 1971-2100 |
| Day count conventions | 4,654 date pairs × 10 conventions |
| ACT/ACT ICMA | 14 coupon periods including stubs and month ends |
| BUS/252 | 665 pairs on two calendars |
| Business-day conventions | 7 conventions × ~3,900 dates × 4 calendars |
| Schedule generation | 1,144 schedules, date for date |
| Accrued interest | 1,375 bond coupons: period, day count and amount |

Two places deliberately disagree with QuantLib, both listed in the tests with a reason:
Martin Luther King Jr. Day, which QuantLib starts in 1983 but which
[Public Law 98-144](https://www.govinfo.gov/content/pkg/STATUTE-97/pdf/STATUTE-97-Pg917.pdf)
first made an observed holiday in 1986; and the SIFMA close for President Carter's funeral
on 9 January 2025, which QuantLib does not carry.

### What is not covered

- **Early closes.** These calendars answer whether a market is open, not what time it
  shuts. The half-days around Thanksgiving, Christmas Eve and the SIFMA recommended
  early closes are ordinary business days here.
- **Closures nobody has announced yet.** A funeral, a storm or a proclaimed holiday
  becomes a pinned date in a patch release. A schedule built today cannot know about one.
- **Years outside each calendar's window.** `validFrom` and `validThrough` are checked, and
  a query outside them throws rather than guessing.
- **Intraday anything.** No times, no time zones, no cut-offs.

Primary sources for the shipped calendars:
[NYSE holidays and hours](https://www.nyse.com/markets/hours-calendars),
[SIFMA holiday schedule](https://www.sifma.org/resources/general/holiday-schedule/),
[Federal Reserve Bank services holidays](https://www.frbservices.org/about/holiday-schedules),
[US federal holidays (OPM)](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/),
[ECB TARGET closing days](https://www.ecb.europa.eu/paym/target/html/index.en.html),
[UK bank holidays](https://www.gov.uk/bank-holidays).

Beyond the reference tests: property-based tests (fast-check) pin the invariants that must
hold for every input — day count fractions are antisymmetric, an allocation always sums to
the original total, an amortization always ends at a zero balance — and the whole suite is
re-run against the built artifact so a packaging mistake cannot pass unnoticed.

Mutation testing puts a number on how much the tests are worth: Stryker rewrites the code
2,361 different ways and the suite catches **84.6%** of them. Every survivor has been
reviewed, and what remains is message wording, provably equivalent mutants, and guards on
states the types already rule out. [ASSURANCE.md](ASSURANCE.md) has the breakdown, the
methods and — as importantly — what none of them covers.

## Calendars

| Calendar | Covers |
| --- | --- |
| `nyse` | New York Stock Exchange trading days |
| `sifma` | US bond market (SIFMA recommendations) |
| `fedwire` | Fedwire funds transfer |
| `unitedStates` | US federal holidays, as observed for settlement |
| `target` | TARGET2 / T2 euro payments |
| `lse` | London Stock Exchange |
| `unitedKingdom` | England and Wales bank holidays |
| `weekendsOnly`, `everyDay` | no holidays at all / no closures at all |

Each calendar states the years it has been checked over (`validFrom`, `validThrough`);
asking about a year outside that window throws `CalendarRangeError` rather than guessing.
Build your own with `customCalendar`, and combine any of them with `jointCalendar`.

## Errors

Every failure is a typed error with a literal `code`, structured fields and a `toJSON`, so
a caller can branch on the failure instead of matching on a message:
`DateParseError`, `InvalidDateError`, `InvalidArgumentError`, `CalendarRangeError`,
`ScheduleError`, narrowed by `isBizDateError`.

Bad input from your own code throws. Bad input from a file, form or API is not a bug, so
that one path returns a result instead:

```ts
import { parseDate } from 'bizdate'

const parsed = parseDate(row.settlementDate)
if (!parsed.ok) return reject(parsed.error.reason)  // 'day must be 01-28 for month 02 of 2026'
```

`parseDate` rejects what `new Date()` quietly accepts: `2026-02-30`, `2026-06-31`,
unpadded fields, times, and offsets.

## Documentation

- [MIGRATING.md](MIGRATING.md) — swaps for `moment-business-days`, the Day.js and Luxon
  plugins, your own holiday list, and countries this package does not ship.
- [DESIGN.md](DESIGN.md) — why the API looks like this: exact arithmetic, no `Date`, where
  `Result` earns its place, and where this package deviates from QuantLib.
- [API-STABILITY.md](API-STABILITY.md) — what is frozen, what is not, and what is still open.
- [ASSURANCE.md](ASSURANCE.md) — what is verified, by what method, and what is not covered.
- [CHANGELOG.md](CHANGELOG.md)

## License

MIT
