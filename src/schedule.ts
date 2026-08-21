import { assertNever } from './assert.js'
import { adjust, type BusinessDayConvention } from './businessday.js'
import type { Calendar } from './calendar.js'
import { weekendsOnly } from './calendars/basic.js'
import {
  addDays,
  addMonths,
  civilMonthOf,
  compareDates,
  type DateInput,
  epochDayOf,
  type IsoDate,
  lastDayOfMonth,
  toIsoDate,
} from './civil.js'
import { ScheduleError } from './errors.js'
import { type Frequency, frequencyStep } from './frequency.js'

/** Which end of the schedule the regular periods are measured from. */
export type RollDirection = 'backward' | 'forward'

/** One period of a schedule. */
export type SchedulePeriod = {
  /** Zero-based position in the schedule. */
  readonly index: number
  /** Period start before any business-day adjustment. */
  readonly unadjustedStart: IsoDate
  /** Period end before any business-day adjustment. */
  readonly unadjustedEnd: IsoDate
  /** Period start after adjustment — the date interest starts accruing. */
  readonly start: IsoDate
  /** Period end after adjustment — the date interest stops accruing. */
  readonly end: IsoDate
  /** When the period's payment is made, after any payment lag. */
  readonly paymentDate: IsoDate
  /** `true` when this period is shorter or longer than a regular one. */
  readonly isStub: boolean
}

/** A generated payment or coupon schedule. */
export type Schedule = {
  readonly periods: readonly SchedulePeriod[]
  readonly frequency: Frequency
  readonly roll: RollDirection
  readonly calendar: Calendar
  readonly convention: BusinessDayConvention
}

/** How to build a schedule. */
export type ScheduleOptions = {
  /** Start of the first period. */
  readonly effective: DateInput
  /** End of the last period: maturity. */
  readonly termination: DateInput
  readonly frequency: Frequency
  /** Defaults to weekends-only, which leaves adjusted dates off weekends alone. */
  readonly calendar?: Calendar
  /** Business-day convention for every date but the last. Defaults to `unadjusted`. */
  readonly convention?: BusinessDayConvention
  /** Business-day convention for the termination date. Defaults to `convention`. */
  readonly terminationConvention?: BusinessDayConvention
  /** Which end the regular periods are counted from. Defaults to `backward` (from maturity). */
  readonly roll?: RollDirection
  /**
   * Keeps every generated date on the last day of its month.
   *
   * Only has an effect when the date the schedule rolls from is itself the last
   * day of a month; otherwise it is ignored, as in QuantLib.
   */
  readonly endOfMonth?: boolean
  /** End of an irregular first period. Everything after it is regular. */
  readonly firstRegularDate?: DateInput
  /** Start of an irregular final period. Everything before it is regular. */
  readonly lastRegularDate?: DateInput
  /** Whole business days between a period's end and its payment. Defaults to 0. */
  readonly paymentLag?: number
  /** Business-day convention for payment dates. Defaults to `following`. */
  readonly paymentConvention?: BusinessDayConvention
}

function step(date: IsoDate, frequency: Frequency, count: number, endOfMonth: boolean): IsoDate {
  const unit = frequencyStep(frequency)
  switch (unit.unit) {
    case 'months': {
      // The date the schedule rolls from is never moved; only the dates
      // generated from it follow the end-of-month rule.
      if (count === 0) return date
      const moved = addMonths(date, unit.count * count)
      return endOfMonth ? lastDayOfMonth(moved) : moved
    }
    case 'days':
      return addDays(date, unit.count * count)
    case 'term':
      throw new ScheduleError('a "term" schedule has a single period; it cannot be stepped')
    default:
      return assertNever(unit)
  }
}

/**
 * Whether a date counts as the month's end for the roll rule.
 *
 * A date qualifies when it is the last day the market is open that month, not
 * only when it is the last day of the month — 30 March is an end-of-month roll
 * date in a market shut on the 31st. This is the rule QuantLib applies.
 */
function rollsFromMonthEnd(date: IsoDate, calendar: Calendar): boolean {
  return (
    civilMonthOf(epochDayOf(adjust(addDays(date, 1), 'following', calendar))) !==
    civilMonthOf(epochDayOf(date))
  )
}

/**
 * The unadjusted dates of a schedule, and which of its end periods are stubs.
 *
 * Regularity is recorded while the dates are generated, where it is known
 * exactly: every date produced by stepping the frequency is on the grid, and a
 * period is irregular precisely when one of its ends had to be inserted because
 * the effective or termination date did not land on that grid. Inferring it
 * afterwards from period lengths cannot distinguish a genuine stub from the
 * ordinary variation between a 28-day and a 31-day month.
 */
function unadjustedDates(
  options: ScheduleOptions,
  calendar: Calendar,
): {
  readonly dates: readonly IsoDate[]
  readonly firstIsStub: boolean
  readonly lastIsStub: boolean
} {
  const effective = toIsoDate(options.effective)
  const termination = toIsoDate(options.termination)
  if (compareDates(effective, termination) !== -1)
    throw new ScheduleError('termination must be later than effective')
  if (options.frequency === 'term')
    return { dates: [effective, termination], firstIsStub: false, lastIsStub: false }

  const roll = options.roll ?? 'backward'
  const firstRegular =
    options.firstRegularDate === undefined ? undefined : toIsoDate(options.firstRegularDate)
  const lastRegular =
    options.lastRegularDate === undefined ? undefined : toIsoDate(options.lastRegularDate)
  if (firstRegular !== undefined && compareDates(firstRegular, effective) !== 1)
    throw new ScheduleError('firstRegularDate must be later than effective')
  if (lastRegular !== undefined && compareDates(lastRegular, termination) !== -1)
    throw new ScheduleError('lastRegularDate must be earlier than termination')
  if (
    firstRegular !== undefined &&
    lastRegular !== undefined &&
    compareDates(firstRegular, lastRegular) !== -1
  )
    throw new ScheduleError('firstRegularDate must be earlier than lastRegularDate')

  const dates: IsoDate[] = []
  // An explicit stub boundary declares its own irregular period at that end.
  let firstIsStub = firstRegular !== undefined
  let lastIsStub = lastRegular !== undefined

  if (roll === 'backward') {
    const seed = lastRegular ?? termination
    const limit = firstRegular ?? effective
    const endOfMonth = (options.endOfMonth ?? false) && rollsFromMonthEnd(seed, calendar)
    for (let count = 0; ; count += 1) {
      const date = step(seed, options.frequency, -count, endOfMonth)
      dates.unshift(date)
      if (compareDates(date, limit) !== 1) break
      if (count > 4000) throw new ScheduleError('schedule is too long to generate')
    }
    // The walk stops at or below the limit. Landing below it means the limit is
    // not on the grid, so the period that starts there is a stub.
    if (compareDates(dates[0] ?? limit, limit) === -1) dates.shift()
    if (compareDates(dates[0] ?? limit, limit) !== 0) {
      dates.unshift(limit)
      if (firstRegular === undefined) firstIsStub = true
    }
    if (firstRegular !== undefined) dates.unshift(effective)
    if (lastRegular !== undefined) dates.push(termination)
  } else {
    const seed = firstRegular ?? effective
    const limit = lastRegular ?? termination
    const endOfMonth = (options.endOfMonth ?? false) && rollsFromMonthEnd(seed, calendar)
    for (let count = 0; ; count += 1) {
      const date = step(seed, options.frequency, count, endOfMonth)
      dates.push(date)
      if (compareDates(date, limit) !== -1) break
      if (count > 4000) throw new ScheduleError('schedule is too long to generate')
    }
    if (compareDates(dates[dates.length - 1] ?? limit, limit) === 1) dates.pop()
    if (compareDates(dates[dates.length - 1] ?? limit, limit) !== 0) {
      dates.push(limit)
      if (lastRegular === undefined) lastIsStub = true
    }
    if (firstRegular !== undefined) dates.unshift(effective)
    if (lastRegular !== undefined) dates.push(termination)
  }
  // A schedule with a single period has no regular period to be odd against.
  if (dates.length < 3) return { dates, firstIsStub: false, lastIsStub: false }
  return { dates, firstIsStub, lastIsStub }
}

/**
 * Builds a payment or coupon schedule.
 *
 * Periods are counted from the end by default — the market convention, which
 * keeps every regular payment on the maturity's day of the month and pushes any
 * odd period to the front. Each period carries both its unadjusted dates (what
 * the contract says) and its adjusted dates (when the market is actually open),
 * because interest usually accrues on one and settles on the other.
 */
export function generateSchedule(options: ScheduleOptions): Schedule {
  const calendar = options.calendar ?? weekendsOnly
  const convention = options.convention ?? 'unadjusted'
  const terminationConvention = options.terminationConvention ?? convention
  const paymentConvention = options.paymentConvention ?? 'following'
  const paymentLag = options.paymentLag ?? 0
  if (!Number.isInteger(paymentLag) || paymentLag < 0)
    throw new ScheduleError(
      `paymentLag must be a whole number of business days and not negative; received ${String(options.paymentLag)}`,
    )
  const { dates, firstIsStub, lastIsStub } = unadjustedDates(options, calendar)
  if (dates.length < 2) throw new ScheduleError('a schedule needs at least one period')

  const periods: SchedulePeriod[] = []
  for (let index = 0; index + 1 < dates.length; index += 1) {
    const unadjustedStart = dates[index] as IsoDate
    const unadjustedEnd = dates[index + 1] as IsoDate
    const isLast = index + 2 === dates.length
    const start = adjust(unadjustedStart, convention, calendar)
    const end = adjust(unadjustedEnd, isLast ? terminationConvention : convention, calendar)
    // Adjustment can collapse a period to nothing — a short weekly stub whose
    // two ends move onto the same open day. Such a period would accrue no
    // interest and pay twice on one date, so it is dropped.
    if (start === end) continue
    const isStub = (index === 0 && firstIsStub) || (isLast && lastIsStub)
    const paid = paymentLag === 0 ? end : addBusinessDaysLocal(end, paymentLag, calendar)
    periods.push({
      index: periods.length,
      unadjustedStart,
      unadjustedEnd,
      start,
      end,
      paymentDate: adjust(paid, paymentConvention, calendar),
      isStub,
    })
  }
  return Object.freeze({
    periods: Object.freeze(periods),
    frequency: options.frequency,
    roll: options.roll ?? 'backward',
    calendar,
    convention,
  })
}

function addBusinessDaysLocal(date: IsoDate, days: number, calendar: Calendar): IsoDate {
  // Imported lazily through `adjust` to keep the module graph acyclic.
  let result = date
  for (let count = 0; count < days; count += 1)
    result = adjust(addDays(result, 1), 'following', calendar)
  return result
}

/** Every date in a schedule, in order: the start of the first period and the end of every period. */
export function scheduleDates(schedule: Schedule): readonly IsoDate[] {
  const first = schedule.periods[0]
  if (first === undefined) return []
  return [first.start, ...schedule.periods.map((period) => period.end)]
}
