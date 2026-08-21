import { assertNever } from './assert.js'
import { type Calendar, isBusinessEpochDay } from './calendar.js'
import {
  civilMonthOf,
  type DateInput,
  dateFromEpochDay,
  epochDayOf,
  type IsoDate,
} from './civil.js'
import { InvalidArgumentError } from './errors.js'

/**
 * What to do when a date lands on a day the market is shut.
 *
 * - `unadjusted` — leave it where it is.
 * - `following` — move forward to the next business day.
 * - `modified-following` — move forward, unless that crosses into the next
 *   calendar month, in which case move back instead. The market standard for
 *   swap and loan payment dates.
 * - `preceding` — move back to the previous business day.
 * - `modified-preceding` — move back, unless that crosses into the previous
 *   month, in which case move forward.
 * - `nearest` — take whichever business day is closer, preferring the later one
 *   when the distance is equal.
 * - `half-month-modified-following` — move forward, unless that crosses either
 *   the middle or the end of the month.
 */
export type BusinessDayConvention =
  | 'unadjusted'
  | 'following'
  | 'modified-following'
  | 'preceding'
  | 'modified-preceding'
  | 'nearest'
  | 'half-month-modified-following'

/** Returns `true` if the market is open on `date`: not a weekend, not a holiday. */
export function isBusinessDay(date: DateInput, calendar: Calendar): boolean {
  return isBusinessEpochDay(epochDayOf(date), calendar)
}

function stepToBusiness(epochDay: number, direction: 1 | -1, calendar: Calendar): number {
  let day = epochDay
  while (!isBusinessEpochDay(day, calendar)) day += direction
  return day
}

/** The first business day strictly after `date`. */
export function nextBusinessDay(date: DateInput, calendar: Calendar): IsoDate {
  return dateFromEpochDay(stepToBusiness(epochDayOf(date) + 1, 1, calendar))
}

/** The last business day strictly before `date`. */
export function previousBusinessDay(date: DateInput, calendar: Calendar): IsoDate {
  return dateFromEpochDay(stepToBusiness(epochDayOf(date) - 1, -1, calendar))
}

function adjustEpochDay(
  epochDay: number,
  convention: BusinessDayConvention,
  calendar: Calendar,
): number {
  if (isBusinessEpochDay(epochDay, calendar) || convention === 'unadjusted') return epochDay
  switch (convention) {
    case 'following':
      return stepToBusiness(epochDay, 1, calendar)
    case 'preceding':
      return stepToBusiness(epochDay, -1, calendar)
    case 'modified-following': {
      const forward = stepToBusiness(epochDay, 1, calendar)
      return civilMonthOf(forward) === civilMonthOf(epochDay)
        ? forward
        : stepToBusiness(epochDay, -1, calendar)
    }
    case 'modified-preceding': {
      const backward = stepToBusiness(epochDay, -1, calendar)
      return civilMonthOf(backward) === civilMonthOf(epochDay)
        ? backward
        : stepToBusiness(epochDay, 1, calendar)
    }
    case 'half-month-modified-following': {
      const forward = stepToBusiness(epochDay, 1, calendar)
      const crossedMonth = civilMonthOf(forward) !== civilMonthOf(epochDay)
      const start = dayOfMonth(epochDay)
      const crossedMidMonth = start <= 15 && dayOfMonth(forward) > 15
      return crossedMonth || crossedMidMonth ? stepToBusiness(epochDay, -1, calendar) : forward
    }
    case 'nearest': {
      let forward = epochDay
      let backward = epochDay
      while (!isBusinessEpochDay(forward, calendar) && !isBusinessEpochDay(backward, calendar)) {
        forward += 1
        backward -= 1
      }
      return isBusinessEpochDay(forward, calendar) ? forward : backward
    }
    default:
      return assertNever(convention)
  }
}

function dayOfMonth(epochDay: number): number {
  return Number(dateFromEpochDay(epochDay).slice(8, 10))
}

/** Moves `date` onto a business day according to `convention`. */
export function adjust(
  date: DateInput,
  convention: BusinessDayConvention,
  calendar: Calendar,
): IsoDate {
  return dateFromEpochDay(adjustEpochDay(epochDayOf(date), convention, calendar))
}

/**
 * The date `days` business days after `date`; pass a negative number to go back.
 *
 * Zero returns `date` unchanged, even if it is not itself a business day — use
 * {@link adjust} or {@link nextBusinessDay} when you want to snap onto one.
 */
export function addBusinessDays(date: DateInput, days: number, calendar: Calendar): IsoDate {
  if (!Number.isInteger(days)) throw new InvalidArgumentError('days', 'must be an integer')
  let epochDay = epochDayOf(date)
  const direction = days < 0 ? -1 : 1
  let remaining = Math.abs(days)
  while (remaining > 0) {
    epochDay += direction
    epochDay = stepToBusiness(epochDay, direction, calendar)
    remaining -= 1
  }
  return dateFromEpochDay(epochDay)
}

/**
 * The settlement date `days` business days after `date` — T+1, T+2, and so on.
 *
 * A trade date that is not itself a business day is moved forward first, so the
 * count always starts from an open day.
 */
export function settlementDate(
  tradeDate: DateInput,
  options: { readonly days: number; readonly calendar: Calendar },
): IsoDate {
  if (!Number.isInteger(options.days) || options.days < 0)
    throw new InvalidArgumentError('days', 'must be a non-negative integer')
  const start = stepToBusiness(epochDayOf(tradeDate), 1, options.calendar)
  return addBusinessDays(dateFromEpochDay(start), options.days, options.calendar)
}

/**
 * How many business days lie between two dates.
 *
 * By default the range includes `from` and excludes `to`, so Monday to Friday of
 * the same week is four business days — the same convention QuantLib uses.
 */
export function businessDaysBetween(
  from: DateInput,
  to: DateInput,
  calendar: Calendar,
  options?: { readonly includeFrom?: boolean; readonly includeTo?: boolean },
): number {
  const includeFrom = options?.includeFrom ?? true
  const includeTo = options?.includeTo ?? false
  const start = epochDayOf(from)
  const end = epochDayOf(to)
  if (start === end) return includeFrom && includeTo && isBusinessEpochDay(start, calendar) ? 1 : 0
  const sign = start < end ? 1 : -1
  const [lo, hi] = start < end ? [start, end] : [end, start]
  let count = 0
  for (let day = lo; day <= hi; day += 1) {
    if (!isBusinessEpochDay(day, calendar)) continue
    if (day === lo && !includeFrom) continue
    if (day === hi && !includeTo) continue
    count += 1
  }
  return sign * count
}

/** Every non-business day between `from` and `to` inclusive, in date order. */
export function nonBusinessDaysBetween(
  from: DateInput,
  to: DateInput,
  calendar: Calendar,
): readonly IsoDate[] {
  const start = epochDayOf(from)
  const end = epochDayOf(to)
  if (end < start) throw new InvalidArgumentError('to', 'must not be earlier than from')
  const found: IsoDate[] = []
  for (let day = start; day <= end; day += 1)
    if (!isBusinessEpochDay(day, calendar)) found.push(dateFromEpochDay(day))
  return found
}
