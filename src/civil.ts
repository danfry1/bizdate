import { DateParseError, InvalidDateError } from './errors.js'
import { err, ok, type Result } from './result.js'
import type { Brand } from './types.js'

/**
 * A calendar date in the proleptic Gregorian calendar, as `YYYY-MM-DD`.
 *
 * The brand records that the value has been validated: it is a real date in the
 * supported range, zero-padded, with no time, offset or trailing text. Values
 * are produced by {@link parseDate}, {@link parseDateOrThrow} and {@link toIsoDate};
 * every function in this package accepts a plain `string` and validates it, so
 * the brand never appears at a call site.
 */
export type IsoDate = Brand<string, 'IsoDate'>

/** A calendar date as separate fields. `month` is 1-12 and `day` is 1-31. */
export type CivilDate = {
  readonly year: number
  readonly month: number
  readonly day: number
}

/**
 * Anything this package accepts as a date: a `YYYY-MM-DD` string or a
 * {@link CivilDate}.
 *
 * `Date` is deliberately not accepted. A `Date` is an instant, not a calendar
 * date, so reading a day out of one requires choosing a time zone — a choice
 * that must be explicit. Use {@link fromJsDate} with the zone you mean.
 */
export type DateInput = IsoDate | string | CivilDate

/** ISO-8601 weekday number: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** ISO-8601 weekday numbers by name. */
export const WEEKDAY = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
} as const satisfies Record<string, Weekday>

/** First year this package supports. Earlier dates predate the Gregorian calendar in most of the world. */
export const MIN_YEAR = 1600
/** Last year this package supports. */
export const MAX_YEAR = 9999

const MIN_EPOCH_DAY = -135140 // 1600-01-01
const MAX_EPOCH_DAY = 2932896 // 9999-12-31

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Returns `true` if `year` is a leap year in the proleptic Gregorian calendar. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Number of days in `month` (1-12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    case 2:
      return isLeapYear(year) ? 29 : 28
    default:
      throw new InvalidDateError('month', month, 'must be 1-12')
  }
}

/** Number of days in `year`: 365, or 366 in a leap year. */
export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

/**
 * Days from 1970-01-01 to the given civil date, by Howard Hinnant's
 * `days_from_civil` algorithm. Exact for every supported year.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400 // [0, 399]
  const mp = (month + 9) % 12 // March = 0
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1 // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy // [0, 146096]
  return era * 146097 + doe - 719468
}

/** Inverse of {@link daysFromCivil}. */
export function civilFromDays(epochDay: number): CivilDate {
  const z = epochDay + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097 // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)) // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153) // [0, 11], March = 0
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1 // [1, 31]
  const month = mp < 10 ? mp + 3 : mp - 9 // [1, 12]
  return { year: month <= 2 ? y + 1 : y, month, day }
}

const pad2 = (n: number): string => (n < 10 ? `0${String(n)}` : String(n))
const pad4 = (n: number): string => String(n).padStart(4, '0')

/** Formats a {@link CivilDate} as `YYYY-MM-DD`. Assumes the fields are already valid. */
function format(date: CivilDate): IsoDate {
  return `${pad4(date.year)}-${pad2(date.month)}-${pad2(date.day)}` as IsoDate
}

function checkRange(year: number, month: number, day: number): string | undefined {
  if (year < MIN_YEAR || year > MAX_YEAR)
    return `year must be ${String(MIN_YEAR)}-${String(MAX_YEAR)}`
  if (month < 1 || month > 12) return 'month must be 01-12'
  const max = daysInMonth(year, month)
  if (day < 1 || day > max)
    return `day must be 01-${pad2(max)} for month ${pad2(month)} of ${pad4(year)}`
  return undefined
}

/**
 * Parses untrusted text as a `YYYY-MM-DD` calendar date.
 *
 * This is the one function in the package that returns a {@link Result}: text
 * arriving from a file, a form or an API is expected to be wrong sometimes, and
 * that is not a bug. Everywhere else, an invalid date is a programmer error and
 * throws.
 *
 * Rejects times, offsets, `Z` suffixes, unpadded fields and out-of-range values
 * — including the calendar-normalisation traps (`2026-02-30`, `2026-06-31`)
 * that `new Date()` silently rolls forward.
 */
export function parseDate(input: string): Result<IsoDate, DateParseError> {
  if (typeof input !== 'string') return err(new DateParseError(String(input), 'not a string'))
  const match = DATE_PATTERN.exec(input)
  if (match === null)
    return err(new DateParseError(input, 'expected exactly YYYY-MM-DD with zero-padded fields'))
  const [, rawYear, rawMonth, rawDay] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)
  const problem = checkRange(year, month, day)
  if (problem !== undefined) return err(new DateParseError(input, problem))
  return ok(format({ year, month, day }))
}

/** {@link parseDate}, but throws {@link DateParseError} instead of returning a result. */
export function parseDateOrThrow(input: string): IsoDate {
  const parsed = parseDate(input)
  if (parsed.ok) return parsed.value
  throw parsed.error
}

/** Returns `true` if `value` is a valid `YYYY-MM-DD` date string in the supported range. */
export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && parseDate(value).ok
}

/**
 * Normalises any {@link DateInput} to a validated {@link IsoDate}.
 *
 * Throws {@link DateParseError} for malformed text and {@link InvalidDateError}
 * for a {@link CivilDate} whose fields are not a real date — both are
 * programmer errors. Use {@link parseDate} for untrusted text.
 */
export function toIsoDate(date: DateInput): IsoDate {
  if (typeof date === 'string') return parseDateOrThrow(date)
  const { year, month, day } = date
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day))
    throw new InvalidDateError('date', Number.NaN, 'year, month and day must be integers')
  const problem = checkRange(year, month, day)
  if (problem !== undefined) throw new InvalidDateError('date', day, problem)
  return format({ year, month, day })
}

/** Splits a date into its year, month and day fields. */
export function toCivil(date: DateInput): CivilDate {
  if (typeof date !== 'string') {
    toIsoDate(date)
    return { year: date.year, month: date.month, day: date.day }
  }
  const iso = parseDateOrThrow(date)
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  }
}

/** Days from 1970-01-01 to `date`; negative before the epoch. */
export function epochDayOf(date: DateInput): number {
  const { year, month, day } = toCivil(date)
  return daysFromCivil(year, month, day)
}

/** The date `epochDay` days after 1970-01-01. */
export function dateFromEpochDay(epochDay: number): IsoDate {
  if (!Number.isInteger(epochDay))
    throw new InvalidDateError('epochDay', epochDay, 'must be an integer')
  if (epochDay < MIN_EPOCH_DAY || epochDay > MAX_EPOCH_DAY)
    throw new InvalidDateError(
      'epochDay',
      epochDay,
      `must be within ${String(MIN_YEAR)}-01-01 and ${String(MAX_YEAR)}-12-31`,
    )
  return format(civilFromDays(epochDay))
}

/** The ISO weekday of `date`: 1 is Monday, 7 is Sunday. */
export function dayOfWeek(date: DateInput): Weekday {
  return weekdayOfEpochDay(epochDayOf(date))
}

/** Internal: ISO weekday of an epoch day, without re-validating a date. */
export function weekdayOfEpochDay(epochDay: number): Weekday {
  // 1970-01-01 was a Thursday (ISO weekday 4).
  const w = (((epochDay + 3) % 7) + 7) % 7
  return (w + 1) as Weekday
}

/** The date `days` calendar days after `date`; pass a negative number to go back. */
export function addDays(date: DateInput, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new InvalidDateError('days', days, 'must be an integer')
  return dateFromEpochDay(epochDayOf(date) + days)
}

/**
 * The date `months` calendar months after `date`, clamped to the end of the
 * target month: 31 January plus one month is 28 (or 29) February.
 *
 * With `endOfMonth: true`, a date that is the last day of its month lands on the
 * last day of the target month — the "end of month" roll rule used by coupon and
 * payment schedules, where 30 November plus three months is 28 February, not 28.
 */
export function addMonths(
  date: DateInput,
  months: number,
  options?: { readonly endOfMonth?: boolean },
): IsoDate {
  if (!Number.isInteger(months)) throw new InvalidDateError('months', months, 'must be an integer')
  const { year, month, day } = toCivil(date)
  const total = year * 12 + (month - 1) + months
  const targetYear = Math.floor(total / 12)
  const targetMonth = (((total % 12) + 12) % 12) + 1
  const lastDay = daysInMonth(targetYear, targetMonth)
  const keepEndOfMonth = options?.endOfMonth === true && day === daysInMonth(year, month)
  const targetDay = keepEndOfMonth ? lastDay : Math.min(day, lastDay)
  return toIsoDate({ year: targetYear, month: targetMonth, day: targetDay })
}

/** The date `years` calendar years after `date`, clamping 29 February to 28 February in a common year. */
export function addYears(
  date: DateInput,
  years: number,
  options?: { readonly endOfMonth?: boolean },
): IsoDate {
  if (!Number.isInteger(years)) throw new InvalidDateError('years', years, 'must be an integer')
  return addMonths(date, years * 12, options)
}

/** The last day of the month containing `date`. */
export function lastDayOfMonth(date: DateInput): IsoDate {
  const { year, month } = toCivil(date)
  return toIsoDate({ year, month, day: daysInMonth(year, month) })
}

/** Returns `true` if `date` is the last day of its month. */
export function isEndOfMonth(date: DateInput): boolean {
  const { year, month, day } = toCivil(date)
  return day === daysInMonth(year, month)
}

/** Whole calendar days from `from` to `to`; negative if `to` is earlier. */
export function daysBetween(from: DateInput, to: DateInput): number {
  return epochDayOf(to) - epochDayOf(from)
}

/** Orders two dates: -1 if `a` is earlier, 0 if equal, 1 if later. */
export function compareDates(a: DateInput, b: DateInput): -1 | 0 | 1 {
  const left = epochDayOf(a)
  const right = epochDayOf(b)
  return left < right ? -1 : left > right ? 1 : 0
}

/** Returns `true` if `a` is strictly earlier than `b`. */
export const isBefore = (a: DateInput, b: DateInput): boolean => compareDates(a, b) === -1
/** Returns `true` if `a` is strictly later than `b`. */
export const isAfter = (a: DateInput, b: DateInput): boolean => compareDates(a, b) === 1
/** Returns `true` if `a` and `b` are the same calendar date. */
export const isSameDate = (a: DateInput, b: DateInput): boolean => compareDates(a, b) === 0

/**
 * Reads a calendar date out of a `Date`, in the time zone you name.
 *
 * A `Date` is an instant, so "which day is it" has two different answers. Naming
 * the zone keeps the choice in your code instead of in this library's defaults.
 */
export function fromJsDate(date: Date, options: { readonly zone: 'utc' | 'local' }): IsoDate {
  if (!(date instanceof Date) || Number.isNaN(date.getTime()))
    throw new InvalidDateError('date', Number.NaN, 'expected a valid Date')
  return options.zone === 'utc'
    ? toIsoDate({
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      })
    : toIsoDate({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

/** Converts a calendar date to a `Date` at midnight UTC. */
export function toJsDate(date: DateInput): Date {
  return new Date(epochDayOf(date) * 86_400_000)
}

/** Today's date, in the time zone you name. */
export function today(options: { readonly zone: 'utc' | 'local' }): IsoDate {
  return fromJsDate(new Date(), options)
}

/** Internal: a month key (`year * 12 + month`) for an epoch day, for month-crossing checks. */
export function civilMonthOf(epochDay: number): number {
  const { year, month } = civilFromDays(epochDay)
  return year * 12 + month
}
