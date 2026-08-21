import { businessDaysBetween } from './businessday.js'
import type { Calendar } from './calendar.js'
import {
  addMonths,
  type CivilDate,
  type DateInput,
  daysInMonth,
  daysBetween,
  epochDayOf,
  isLeapYear,
  toCivil,
  toIsoDate,
} from './civil.js'
import { assertNever } from './assert.js'
import { InvalidArgumentError } from './errors.js'
import { type Frequency, frequencyStep } from './frequency.js'
import type { StringWithHints } from './types.js'
import { add, fraction, type Fraction, fromInteger, negate, toNumber, ZERO } from './rational.js'

/**
 * A day count convention: how a stretch of calendar time is turned into a
 * fraction of a year for interest purposes.
 *
 * - `30/360` — ISDA 2006 bond basis. Every month is 30 days, every year 360.
 * - `30/360 US` — the same, with the February end-of-month rule US agencies apply.
 * - `30E/360` — Eurobond basis: both dates capped at the 30th.
 * - `30E/360 ISDA` — 30E/360 where an end-of-month date becomes the 30th, except
 *   at a February termination date.
 * - `ACT/360` — actual days over a 360-day year. Money-market standard.
 * - `ACT/365F` — actual days over a fixed 365-day year.
 * - `NL/365` — actual days with 29 February never counted, over 365.
 * - `ACT/ACT ISDA` — actual days, split at each year boundary over the real
 *   length of each year.
 * - `ACT/ACT ICMA` — actual days over the actual coupon period; needs the
 *   period and frequency. The bond-market standard for accrued interest.
 * - `ACT/ACT AFB` — actual days over 365, or 366 when the period contains a
 *   29 February.
 * - `BUS/252` — business days on a calendar over 252. Brazilian market standard.
 * - `1/1` — one whole year per period, whatever its length.
 */
export type DayCountConvention =
  | '30/360'
  | '30/360 US'
  | '30E/360'
  | '30E/360 ISDA'
  | 'ACT/360'
  | 'ACT/365F'
  | 'NL/365'
  | 'ACT/ACT ISDA'
  | 'ACT/ACT ICMA'
  | 'ACT/ACT AFB'
  | 'BUS/252'
  | '1/1'

/** Every convention this package implements. */
export const DAY_COUNT_CONVENTIONS = [
  '30/360',
  '30/360 US',
  '30E/360',
  '30E/360 ISDA',
  'ACT/360',
  'ACT/365F',
  'NL/365',
  'ACT/ACT ISDA',
  'ACT/ACT ICMA',
  'ACT/ACT AFB',
  'BUS/252',
  '1/1',
] as const satisfies readonly DayCountConvention[]

const ALIASES = {
  '30/360': '30/360',
  '30/360 bond basis': '30/360',
  'bond basis': '30/360',
  '30/360 isda': '30/360',
  '30/360 us': '30/360 US',
  '30u/360': '30/360 US',
  '30/360 sia': '30/360 US',
  nasd: '30/360 US',
  '30e/360': '30E/360',
  'eurobond basis': '30E/360',
  '30/360 icma': '30E/360',
  '30/360 european': '30E/360',
  '30e/360 isda': '30E/360 ISDA',
  '30e/360 german': '30E/360 ISDA',
  german: '30E/360 ISDA',
  'act/360': 'ACT/360',
  'actual/360': 'ACT/360',
  'a/360': 'ACT/360',
  french: 'ACT/360',
  'act/365': 'ACT/365F',
  'act/365f': 'ACT/365F',
  'actual/365': 'ACT/365F',
  'actual/365 fixed': 'ACT/365F',
  'a/365f': 'ACT/365F',
  english: 'ACT/365F',
  'nl/365': 'NL/365',
  'act/365 no leap': 'NL/365',
  'actual/365 (no leap)': 'NL/365',
  'act/act': 'ACT/ACT ISDA',
  'act/act isda': 'ACT/ACT ISDA',
  'actual/actual': 'ACT/ACT ISDA',
  'actual/actual (isda)': 'ACT/ACT ISDA',
  'act/act historical': 'ACT/ACT ISDA',
  'act/act icma': 'ACT/ACT ICMA',
  'act/act isma': 'ACT/ACT ICMA',
  'actual/actual (icma)': 'ACT/ACT ICMA',
  'act/act bond': 'ACT/ACT ICMA',
  'act/act afb': 'ACT/ACT AFB',
  'act/act euro': 'ACT/ACT AFB',
  'actual/actual (afb)': 'ACT/ACT AFB',
  'bus/252': 'BUS/252',
  'business/252': 'BUS/252',
  '1/1': '1/1',
} as const satisfies Record<string, DayCountConvention>

/**
 * Resolves a convention written any of the usual ways — `Actual/360`,
 * `act/360`, `A/360` — to its canonical name.
 */
export function normalizeConvention(convention: string): DayCountConvention {
  const key = convention.trim().toLowerCase().replace(/\s+/g, ' ')
  const canonical = (ALIASES as Record<string, DayCountConvention | undefined>)[key]
  if (canonical === undefined)
    throw new InvalidArgumentError(
      'convention',
      `unknown day count convention ${JSON.stringify(convention)}. Known: ${DAY_COUNT_CONVENTIONS.join(', ')}`,
    )
  return canonical
}

/**
 * A convention name: one of the canonical names, or any of the aliases the
 * market writes them as. Editors still complete the canonical list.
 */
export type DayCountConventionInput = StringWithHints<DayCountConvention>

/** Extra inputs some conventions need. */
export type DayCountOptions = {
  /** `30E/360 ISDA`: the maturity of the instrument, which suppresses the February end-of-month rule. */
  readonly terminationDate?: DateInput
  /** `ACT/ACT ICMA`: how often the instrument pays. */
  readonly frequency?: Frequency
  /** `ACT/ACT ICMA`: start of the coupon period the accrual sits in. Defaults to `start`. */
  readonly referenceStart?: DateInput
  /** `ACT/ACT ICMA`: end of that coupon period. Defaults to `end`. */
  readonly referenceEnd?: DateInput
  /** `BUS/252`: the calendar whose business days are counted. */
  readonly calendar?: Calendar
}

const isLastOfFebruary = (date: CivilDate): boolean =>
  date.month === 2 && date.day === daysInMonth(date.year, 2)

const isEndOfItsMonth = (date: CivilDate): boolean =>
  date.day === daysInMonth(date.year, date.month)

function thirty360(
  start: CivilDate,
  end: CivilDate,
  variant: '30/360' | '30/360 US' | '30E/360' | '30E/360 ISDA',
  options: DayCountOptions,
): number {
  let d1 = start.day
  let d2 = end.day
  const m2 = end.month
  const y2 = end.year
  switch (variant) {
    case '30/360':
      if (d1 === 31) d1 = 30
      if (d2 === 31 && d1 === 30) d2 = 30
      break
    case '30/360 US':
      if (isLastOfFebruary(start) && isLastOfFebruary(end)) d2 = 30
      if (isLastOfFebruary(start)) d1 = 30
      if (d1 === 31) d1 = 30
      if (d2 === 31 && d1 === 30) d2 = 30
      break
    case '30E/360':
      if (d1 === 31) d1 = 30
      if (d2 === 31) d2 = 30
      break
    case '30E/360 ISDA': {
      if (isEndOfItsMonth(start)) d1 = 30
      const termination =
        options.terminationDate === undefined ? undefined : toCivil(options.terminationDate)
      const isTermination =
        termination !== undefined &&
        termination.year === end.year &&
        termination.month === end.month &&
        termination.day === end.day
      if (isEndOfItsMonth(end) && !(end.month === 2 && isTermination)) d2 = 30
      break
    }
  }
  return 360 * (y2 - start.year) + 30 * (m2 - start.month) + (d2 - d1)
}

const MONTH_OFFSET = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const

function noLeapDays(start: CivilDate, end: CivilDate): number {
  const serial = (date: CivilDate): number => {
    const offset = MONTH_OFFSET[date.month - 1] ?? 0
    const leapDay = date.month === 2 && date.day === 29 ? 1 : 0
    return date.day + offset + date.year * 365 - leapDay
  }
  return serial(end) - serial(start)
}

function actActIsda(start: DateInput, end: DateInput): Fraction {
  const from = toCivil(start)
  const to = toCivil(end)
  if (from.year === to.year)
    return fraction(BigInt(daysBetween(start, end)), BigInt(isLeapYear(from.year) ? 366 : 365))
  const startOfNextYear = toIsoDate({ year: from.year + 1, month: 1, day: 1 })
  const startOfEndYear = toIsoDate({ year: to.year, month: 1, day: 1 })
  const head = fraction(
    BigInt(daysBetween(start, startOfNextYear)),
    BigInt(isLeapYear(from.year) ? 366 : 365),
  )
  const tail = fraction(
    BigInt(daysBetween(startOfEndYear, end)),
    BigInt(isLeapYear(to.year) ? 366 : 365),
  )
  return add(add(head, tail), fromInteger(to.year - from.year - 1))
}

function actActAfb(start: DateInput, end: DateInput): Fraction {
  let newEnd = toIsoDate(end)
  let whole = 0
  for (;;) {
    let candidate = addMonths(newEnd, -12)
    const civil = toCivil(candidate)
    // A 29 February anniversary lands on the 28th; the AFB rule steps it back on.
    if (civil.month === 2 && civil.day === 28 && isLeapYear(civil.year))
      candidate = toIsoDate({ year: civil.year, month: 2, day: 29 })
    if (epochDayOf(candidate) < epochDayOf(start)) break
    whole += 1
    newEnd = candidate
  }
  let denominator = 365
  const endCivil = toCivil(newEnd)
  const startCivil = toCivil(start)
  const spansFeb29 = (year: number): boolean => {
    if (!isLeapYear(year)) return false
    const feb29 = epochDayOf(toIsoDate({ year, month: 2, day: 29 }))
    return epochDayOf(newEnd) > feb29 && epochDayOf(start) <= feb29
  }
  if (
    spansFeb29(endCivil.year) ||
    (endCivil.year !== startCivil.year && spansFeb29(startCivil.year))
  )
    denominator = 366
  return add(fromInteger(whole), fraction(BigInt(daysBetween(start, newEnd)), BigInt(denominator)))
}

function actActIcma(start: DateInput, end: DateInput, options: DayCountOptions): Fraction {
  if (options.frequency === undefined)
    throw new InvalidArgumentError(
      'frequency',
      'ACT/ACT ICMA needs the frequency of the instrument; pass { frequency } (and normally { referenceStart, referenceEnd })',
    )
  // ICMA reference periods are whole months. A weekly or daily coupon has no
  // month count to divide the year into, so it is refused rather than rounded
  // to something that is not the instrument's period.
  const step = frequencyStep(options.frequency)
  if (step.unit !== 'months')
    throw new InvalidArgumentError(
      'frequency',
      `ACT/ACT ICMA is defined for coupon periods of whole months; ${JSON.stringify(options.frequency)} is not one. Use ACT/365F or ACT/ACT ISDA for sub-monthly periods.`,
    )
  const months = step.count
  const referenceStart = options.referenceStart ?? start
  const referenceEnd = options.referenceEnd ?? end
  return icmaFraction(
    toIsoDate(start),
    toIsoDate(end),
    toIsoDate(referenceStart),
    toIsoDate(referenceEnd),
    months,
  )
}

function icmaFraction(
  start: string,
  end: string,
  referenceStart: string,
  referenceEnd: string,
  months: number,
): Fraction {
  if (epochDayOf(start) === epochDayOf(end)) return ZERO
  if (epochDayOf(start) > epochDayOf(end))
    return negate(icmaFraction(end, start, referenceStart, referenceEnd, months))
  const period = fraction(BigInt(months), 12n)
  if (epochDayOf(end) <= epochDayOf(referenceEnd)) {
    if (epochDayOf(start) >= epochDayOf(referenceStart))
      return multiplyPeriod(
        period,
        daysBetween(start, end),
        daysBetween(referenceStart, referenceEnd),
      )
    const previousReference = addMonths(referenceStart, -months)
    return epochDayOf(end) > epochDayOf(referenceStart)
      ? add(
          icmaFraction(start, referenceStart, previousReference, referenceStart, months),
          icmaFraction(referenceStart, end, referenceStart, referenceEnd, months),
        )
      : icmaFraction(start, end, previousReference, referenceStart, months)
  }
  let sum = icmaFraction(start, referenceEnd, referenceStart, referenceEnd, months)
  let index = 0
  let nextStart = referenceEnd
  let nextEnd = referenceEnd
  for (;;) {
    nextStart = addMonths(referenceEnd, months * index)
    nextEnd = addMonths(referenceEnd, months * (index + 1))
    if (epochDayOf(end) < epochDayOf(nextEnd)) break
    sum = add(sum, period)
    index += 1
  }
  return add(sum, icmaFraction(nextStart, end, nextStart, nextEnd, months))
}

const multiplyPeriod = (period: Fraction, days: number, periodDays: number): Fraction =>
  fraction(period.numerator * BigInt(days), period.denominator * BigInt(periodDays))

/**
 * The exact day count fraction between two dates: the share of a year the
 * period represents under `convention`, as a rational number.
 *
 * Nothing is rounded. `ACT/ACT ISDA` over a year boundary is the sum of two
 * exact fractions, not a float approximation of one, so interest computed from
 * it is exact until you round it to money.
 *
 * A `start` later than `end` gives a negative fraction.
 */
export function exactDayCountFraction(
  start: DateInput,
  end: DateInput,
  convention: DayCountConventionInput,
  options: DayCountOptions = {},
): Fraction {
  const canonical = normalizeConvention(convention)
  const from = toIsoDate(start)
  const to = toIsoDate(end)
  if (epochDayOf(from) > epochDayOf(to))
    return negate(exactDayCountFraction(to, from, canonical, options))
  switch (canonical) {
    case '30/360':
    case '30/360 US':
    case '30E/360':
    case '30E/360 ISDA':
      return fraction(BigInt(thirty360(toCivil(from), toCivil(to), canonical, options)), 360n)
    case 'ACT/360':
      return fraction(BigInt(daysBetween(from, to)), 360n)
    case 'ACT/365F':
      return fraction(BigInt(daysBetween(from, to)), 365n)
    case 'NL/365':
      return fraction(BigInt(noLeapDays(toCivil(from), toCivil(to))), 365n)
    case 'ACT/ACT ISDA':
      return actActIsda(from, to)
    case 'ACT/ACT ICMA':
      return actActIcma(from, to, options)
    case 'ACT/ACT AFB':
      return actActAfb(from, to)
    case 'BUS/252': {
      if (options.calendar === undefined)
        throw new InvalidArgumentError(
          'calendar',
          'BUS/252 needs a calendar to count business days',
        )
      return fraction(BigInt(businessDaysBetween(from, to, options.calendar)), 252n)
    }
    case '1/1':
      return fromInteger(1)
    default:
      return assertNever(canonical)
  }
}

/**
 * The day count fraction between two dates as a `number` — the form every
 * pricing formula wants.
 *
 * Computed exactly and converted once at the end, so it is never worse than the
 * float-by-float version and is often better.
 */
export function dayCountFraction(
  start: DateInput,
  end: DateInput,
  convention: DayCountConventionInput,
  options: DayCountOptions = {},
): number {
  return toNumber(exactDayCountFraction(start, end, convention, options))
}

/**
 * The numerator of the day count: the number of days the convention counts
 * between the dates, which is not always the number of calendar days.
 *
 * `30/360` counts 30 days from 31 January to 28 February; `NL/365` skips
 * 29 February; `BUS/252` counts only business days.
 */
export function dayCountDays(
  start: DateInput,
  end: DateInput,
  convention: DayCountConventionInput,
  options: DayCountOptions = {},
): number {
  const canonical = normalizeConvention(convention)
  const from = toIsoDate(start)
  const to = toIsoDate(end)
  if (epochDayOf(from) > epochDayOf(to)) return -dayCountDays(to, from, canonical, options)
  switch (canonical) {
    case '30/360':
    case '30/360 US':
    case '30E/360':
    case '30E/360 ISDA':
      return thirty360(toCivil(from), toCivil(to), canonical, options)
    case 'NL/365':
      return noLeapDays(toCivil(from), toCivil(to))
    case 'BUS/252': {
      if (options.calendar === undefined)
        throw new InvalidArgumentError(
          'calendar',
          'BUS/252 needs a calendar to count business days',
        )
      return businessDaysBetween(from, to, options.calendar)
    }
    case '1/1':
      return epochDayOf(to) === epochDayOf(from) ? 0 : 1
    case 'ACT/360':
    case 'ACT/365F':
    case 'ACT/ACT ISDA':
    case 'ACT/ACT ICMA':
    case 'ACT/ACT AFB':
      return daysBetween(from, to)
    default:
      return assertNever(canonical)
  }
}
