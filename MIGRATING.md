# Migrating to bizdate

Every date is a plain `YYYY-MM-DD` string, in and out. There is no wrapper object to
construct, no plugin to register, and no dependency on the date library you happen to use —
which is the point: the calendar knowledge is the part worth depending on, not the date
type.

Every example below is a straight swap. Pick the calendar once and pass it explicitly;
nothing is configured globally, so two parts of an application can use two different
markets without fighting over a shared holiday list.

## From `moment-business-days`

| moment-business-days | bizdate |
| --- | --- |
| `moment('2026-11-25').isBusinessDay()` | `isBusinessDay('2026-11-25', nyse)` |
| `moment('2026-11-24').businessAdd(3)` | `addBusinessDays('2026-11-24', 3, nyse)` |
| `moment('2026-11-30').businessSubtract(3)` | `addBusinessDays('2026-11-30', -3, nyse)` |
| `moment('2026-11-25').nextBusinessDay()` | `nextBusinessDay('2026-11-25', nyse)` |
| `moment('2026-11-27').prevBusinessDay()` | `previousBusinessDay('2026-11-27', nyse)` |
| `moment('2026-11-23').businessDiff(moment('2026-11-27'))` | `businessDaysBetween('2026-11-23', '2026-11-27', nyse)` |
| `moment('2026-11-25').monthBusinessDays()` | `nonBusinessDaysBetween(...)`, or filter a range |
| `moment.updateLocale('us', { holidays, holidayFormat })` | a calendar value — see below |

The holiday list is the part you stop maintaining. `moment-business-days` needs an array of
dates, extended by hand every year. Here the calendars are rules, so 2031 is as correct as
2026 without a release.

```ts
// before
import moment from 'moment'
import 'moment-business-days'
moment.updateLocale('us', {
  holidays: ['2026-01-01', '2026-07-03', '2026-12-25'],  // …and again next year
  holidayFormat: 'YYYY-MM-DD',
})
const settles = moment('2026-11-25').businessAdd(2).format('YYYY-MM-DD')

// after
import { addBusinessDays, nyse } from 'bizdate'
const settles = addBusinessDays('2026-11-25', 2, nyse)
```

Two behaviours differ deliberately:

- **`businessAdd(0)`** on a non-business day moves to the next one in some versions.
  `addBusinessDays(date, 0, calendar)` returns the date untouched; use
  `adjust(date, 'following', calendar)` when you want it snapped onto an open day.
- **`businessDiff`** counts the days between two dates. `businessDaysBetween` includes the
  first day and excludes the last by default — the market convention, and the same one
  QuantLib uses. Pass `{ includeFrom, includeTo }` for anything else.

## From `dayjs-business-days2` or `dayjs-business-time`

| dayjs plugin | bizdate |
| --- | --- |
| `dayjs('2026-11-25').isBusinessDay()` | `isBusinessDay('2026-11-25', nyse)` |
| `dayjs('2026-11-24').businessDaysAdd(3)` | `addBusinessDays('2026-11-24', 3, nyse)` |
| `dayjs('2026-11-25').nextBusinessDay()` | `nextBusinessDay('2026-11-25', nyse)` |
| `dayjs('2026-11-23').businessDiff(dayjs('2026-11-27'))` | `businessDaysBetween('2026-11-23', '2026-11-27', nyse)` |
| `dayjs.extend(businessDays, { holidays, holidayFormat })` | a calendar value |

Keep using Day.js for formatting and parsing if you like it; hand bizdate the
`format('YYYY-MM-DD')` string and put the result back into `dayjs()`.

## From `luxon-business-days`

| luxon-business-days | bizdate |
| --- | --- |
| `dt.isBusinessDay()` | `isBusinessDay(dt.toISODate(), nyse)` |
| `dt.plusBusiness({ days: 3 })` | `addBusinessDays(dt.toISODate(), 3, nyse)` |
| `dt.minusBusiness({ days: 3 })` | `addBusinessDays(dt.toISODate(), -3, nyse)` |
| `dt.setupBusiness({ holidayMatchers })` | a calendar value |

`DateTime.fromISO(result)` converts back.

## Your own holiday list

A list of dates you already maintain becomes a calendar directly, and can be mixed with
rules for the parts that repeat:

```ts
import { customCalendar, isBusinessDay } from 'bizdate'

const office = customCalendar({
  id: 'acme',
  // One-off closures, exactly as you had them.
  dates: ['2026-07-06', '2026-12-24', '2026-12-31'],
  // Anything that recurs, expressed once instead of per year.
  rules: [
    { kind: 'fixed', name: "Founders' Day", month: 9, day: 1, observed: 'nearest-weekday' },
    { kind: 'nth-weekday', name: 'Volunteering Day', month: 6, weekday: 5, nth: 1 },
  ],
  validFrom: 2024,
  validThrough: 2030,
})

isBusinessDay('2026-07-06', office) // false
```

`validFrom` and `validThrough` are required, and they are load-bearing: a query outside them
throws rather than answering from rules that were never checked that far.

## Public holidays for a country bizdate does not ship

bizdate ships *market* calendars — the days an exchange or payment system is shut. For
national public holidays anywhere in the world, [`date-holidays`](https://www.npmjs.com/package/date-holidays)
already has the data; feed it in once and keep the business-day arithmetic here:

```ts
import Holidays from 'date-holidays'
import { customCalendar, addBusinessDays } from 'bizdate'

const source = new Holidays('GB')
const validFrom = 2020
const validThrough = 2035
const dates: string[] = []
for (let year = validFrom; year <= validThrough; year += 1)
  for (const holiday of source.getHolidays(year))
    if (holiday.type === 'public') dates.push(holiday.date.slice(0, 10))

const unitedKingdomPublic = customCalendar({
  id: 'gb-public',
  dates,
  validFrom,
  validThrough,
})

addBusinessDays('2026-12-24', 2, unitedKingdomPublic) // '2026-12-30'
```

Generate that list at build time and commit it if you would rather not ship the dependency.

## Combining markets

A cross-border settlement date needs every market involved to be open:

```ts
import { jointCalendar, settlementDate, nyse, target } from 'bizdate'

settlementDate('2026-04-01', { days: 2, calendar: jointCalendar(nyse, target) })
// '2026-04-07' — Good Friday shuts both, Easter Monday shuts TARGET2
```

## What you gain by moving

- Holiday rules instead of a list that goes stale every January.
- Exchange and payment-system calendars, not just national public holidays.
- Day count conventions, coupon schedules and exact interest, when you need them later.
- No `moment` (in maintenance mode since 2020), no plugin registration, no global state.
- 4 KB gzipped for the business-day path, tree-shaken.
