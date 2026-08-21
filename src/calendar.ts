import {
  civilFromDays,
  type DateInput,
  dateFromEpochDay,
  daysFromCivil,
  daysInMonth,
  epochDayOf,
  type IsoDate,
  type Weekday,
  weekdayOfEpochDay,
} from './civil.js'
import { assertNever } from './assert.js'
import { easterSunday } from './easter.js'
import { CalendarRangeError, InvalidArgumentError } from './errors.js'

/**
 * How a holiday that lands on a weekend is observed.
 *
 * - `none` — not observed at all. The market simply stays shut on its usual
 *   weekend, and no weekday is taken (TARGET2, most European exchanges).
 * - `nearest-weekday` — Saturday moves back to Friday, Sunday forward to Monday
 *   (US federal holidays, NYSE, most US markets).
 * - `sunday-to-monday` — Sunday moves forward to Monday, Saturday is not
 *   observed (NYSE's New Year's Day; Fedwire, which stays open the Friday
 *   before a Saturday holiday).
 * - `next-weekday` — moves forward to the next weekday not already taken by
 *   another holiday, cascading (UK substitute days: Christmas on a Saturday
 *   takes Monday, and Boxing Day then takes Tuesday).
 */
export type ObservedRule = 'none' | 'nearest-weekday' | 'sunday-to-monday' | 'next-weekday'

/** A holiday that always falls on the same month and day. */
export type FixedHolidayRule = {
  readonly kind: 'fixed'
  readonly name: string
  /** Month, 1-12. */
  readonly month: number
  /** Day of month, 1-31. */
  readonly day: number
  readonly observed?: ObservedRule
  /** First year the holiday exists. */
  readonly from?: number
  /** Last year the holiday exists. */
  readonly through?: number
}

/** A holiday on the nth weekday of a month, such as the third Monday in January. */
export type NthWeekdayHolidayRule = {
  readonly kind: 'nth-weekday'
  readonly name: string
  /** Month, 1-12. */
  readonly month: number
  readonly weekday: Weekday
  /** 1-4 counts from the start of the month; -1 is the last such weekday. */
  readonly nth: 1 | 2 | 3 | 4 | -1
  readonly from?: number
  readonly through?: number
}

/** A holiday at a fixed offset from Easter Sunday: Good Friday is -2, Easter Monday is +1. */
export type EasterHolidayRule = {
  readonly kind: 'easter'
  readonly name: string
  readonly offset: number
  readonly from?: number
  readonly through?: number
  /**
   * Suppresses the holiday when it falls in the first seven days of a month.
   *
   * The US bond market uses this: since 1996 Good Friday is only an early close,
   * not a full close, when it coincides with the release of the employment
   * report — which is the first Friday of the month.
   */
  readonly unless?: 'in-first-week-of-month'
}

/** A one-off closure on a specific date: a funeral, a storm, a proclaimed extra holiday. */
export type OneOffHolidayRule = {
  readonly kind: 'one-off'
  readonly name: string
  readonly date: string
}

/** A single holiday rule. */
export type HolidayRule =
  | FixedHolidayRule
  | NthWeekdayHolidayRule
  | EasterHolidayRule
  | OneOffHolidayRule

/**
 * A holiday calendar defined as published rules plus pinned one-off closures.
 *
 * Rules generate correct dates arbitrarily far forward, so no data feed or
 * yearly table update is needed. One-off closures are historical facts and are
 * pinned as of the package version. `validFrom`/`validThrough` state the years
 * the calendar has been checked over; outside that window queries throw
 * {@link CalendarRangeError} rather than guess.
 */
export type RuleCalendar = {
  readonly kind: 'rules'
  readonly id: string
  readonly name: string
  /** Days of the week the market is closed. Usually Saturday and Sunday. */
  readonly weekend: readonly Weekday[]
  readonly rules: readonly HolidayRule[]
  readonly validFrom: number
  readonly validThrough: number
}

/** The union of several calendars: closed when any member is closed. */
export type JointCalendar = {
  readonly kind: 'joint'
  readonly id: string
  readonly name: string
  readonly members: readonly Calendar[]
}

/** A holiday calendar: either a set of rules or the union of other calendars. */
export type Calendar = RuleCalendar | JointCalendar

const yearCache = new WeakMap<RuleCalendar, Map<number, ReadonlyMap<number, string>>>()

function inYearRange(rule: HolidayRule, year: number): boolean {
  if (rule.kind === 'one-off') return true
  return (rule.from ?? -Infinity) <= year && year <= (rule.through ?? Infinity)
}

function nthWeekdayEpochDay(rule: NthWeekdayHolidayRule, year: number): number {
  if (rule.nth === -1) {
    const last = daysFromCivil(year, rule.month, daysInMonth(year, rule.month))
    const shift = (weekdayOfEpochDay(last) - rule.weekday + 7) % 7
    return last - shift
  }
  const first = daysFromCivil(year, rule.month, 1)
  const shift = (rule.weekday - weekdayOfEpochDay(first) + 7) % 7
  return first + shift + (rule.nth - 1) * 7
}

function observe(
  epochDay: number,
  rule: ObservedRule,
  weekend: readonly Weekday[],
  taken: ReadonlySet<number>,
): number | undefined {
  // A substitute day steps over days another holiday already took, so it is
  // resolved even when the holiday itself falls on a weekday.
  if (rule === 'next-weekday') {
    let candidate = epochDay
    while (weekend.includes(weekdayOfEpochDay(candidate)) || taken.has(candidate)) candidate += 1
    return candidate
  }
  const weekday = weekdayOfEpochDay(epochDay)
  if (!weekend.includes(weekday)) return epochDay
  switch (rule) {
    case 'none':
      return epochDay
    case 'nearest-weekday':
      return weekday === 6 ? epochDay - 1 : epochDay + 1
    case 'sunday-to-monday':
      return weekday === 7 ? epochDay + 1 : undefined
    default:
      return assertNever(rule)
  }
}

function buildYear(calendar: RuleCalendar, year: number): ReadonlyMap<number, string> {
  const found = new Map<number, string>()
  const taken = new Set<number>()
  // Neighbouring years are evaluated too: an observed day can spill across a
  // year boundary (1 January on a Saturday is observed on 31 December).
  for (const y of [year - 1, year, year + 1]) {
    for (const rule of calendar.rules) {
      if (!inYearRange(rule, y)) continue
      let base: number
      switch (rule.kind) {
        case 'fixed':
          // A 29 February rule simply does not occur in a common year. Clamping
          // it onto the 28th would invent a holiday the rule never described.
          if (rule.day > daysInMonth(y, rule.month)) continue
          base = daysFromCivil(y, rule.month, rule.day)
          break
        case 'nth-weekday':
          base = nthWeekdayEpochDay(rule, y)
          break
        case 'easter':
          base = easterSunday(y) + rule.offset
          if (rule.unless === 'in-first-week-of-month' && civilFromDays(base).day <= 7) continue
          break
        case 'one-off':
          base = epochDayOf(rule.date)
          // Evaluated once, in the year it actually falls in.
          if (base < daysFromCivil(y, 1, 1) || base > daysFromCivil(y, 12, 31)) continue
          break
      }
      const observedRule = rule.kind === 'fixed' ? (rule.observed ?? 'none') : 'none'
      const day = observe(base, observedRule, calendar.weekend, taken)
      if (day === undefined) continue
      taken.add(day)
      if (day >= daysFromCivil(year, 1, 1) && day <= daysFromCivil(year, 12, 31))
        found.set(day, rule.name)
    }
  }
  return found
}

function assertYearSupported(calendar: Calendar, year: number): void {
  if (calendar.kind === 'joint') {
    for (const member of calendar.members) assertYearSupported(member, year)
    return
  }
  if (year < calendar.validFrom || year > calendar.validThrough)
    throw new CalendarRangeError(calendar.id, year, calendar.validFrom, calendar.validThrough)
}

function holidayMap(calendar: RuleCalendar, year: number): ReadonlyMap<number, string> {
  let byYear = yearCache.get(calendar)
  if (byYear === undefined) {
    byYear = new Map()
    yearCache.set(calendar, byYear)
  }
  const cached = byYear.get(year)
  if (cached !== undefined) return cached
  const built = buildYear(calendar, year)
  byYear.set(year, built)
  return built
}

/** Internal: is this epoch day a holiday (ignoring weekends) on this calendar? */
function isHolidayEpochDay(epochDay: number, calendar: Calendar): boolean {
  const year = Math.floor(civilYearOf(epochDay))
  assertYearSupported(calendar, year)
  if (calendar.kind === 'joint')
    return calendar.members.some((member) => isHolidayEpochDay(epochDay, member))
  return holidayMap(calendar, year).has(epochDay)
}

/** Internal: is this epoch day a weekend on this calendar? */
function isWeekendEpochDay(epochDay: number, calendar: Calendar): boolean {
  const weekday = weekdayOfEpochDay(epochDay)
  return calendar.kind === 'joint'
    ? calendar.members.some((member) => isWeekendEpochDay(epochDay, member))
    : calendar.weekend.includes(weekday)
}

/** Internal: is this epoch day a business day on this calendar? */
export function isBusinessEpochDay(epochDay: number, calendar: Calendar): boolean {
  return !isWeekendEpochDay(epochDay, calendar) && !isHolidayEpochDay(epochDay, calendar)
}

function civilYearOf(epochDay: number): number {
  // Cheap year extraction: avoids a full civil conversion in the hot path.
  const approx = 1970 + Math.floor(epochDay / 365.2425)
  if (epochDay < daysFromCivil(approx, 1, 1)) return approx - 1
  if (epochDay >= daysFromCivil(approx + 1, 1, 1)) return approx + 1
  return approx
}

/** A holiday on a calendar, with the name of the rule that produced it. */
export type Holiday = {
  readonly date: IsoDate
  readonly name: string
}

/** Every holiday on `calendar` in `year`, in date order. Weekends are not holidays. */
export function holidays(calendar: Calendar, year: number): readonly Holiday[] {
  assertYearSupported(calendar, year)
  if (calendar.kind === 'joint') {
    const merged = new Map<number, string>()
    for (const member of calendar.members)
      for (const holiday of holidays(member, year))
        merged.set(epochDayOf(holiday.date), holiday.name)
    return [...merged]
      .sort(([a], [b]) => a - b)
      .map(([day, name]) => ({ date: dateFromEpochDay(day), name }))
  }
  return [...holidayMap(calendar, year)]
    .sort(([a], [b]) => a - b)
    .map(([day, name]) => ({ date: dateFromEpochDay(day), name }))
}

/** Returns `true` if `date` is a holiday on `calendar`. Weekends are not holidays — see {@link isWeekend}. */
export function isHoliday(date: DateInput, calendar: Calendar): boolean {
  return isHolidayEpochDay(epochDayOf(date), calendar)
}

/** Returns `true` if `date` falls on `calendar`'s weekend. */
export function isWeekend(date: DateInput, calendar: Calendar): boolean {
  return isWeekendEpochDay(epochDayOf(date), calendar)
}

/** The name of the holiday on `date`, or `undefined` if `date` is not a holiday. */
export function holidayName(date: DateInput, calendar: Calendar): string | undefined {
  const epochDay = epochDayOf(date)
  const year = civilYearOf(epochDay)
  assertYearSupported(calendar, year)
  if (calendar.kind === 'joint') {
    for (const member of calendar.members) {
      const name = holidayName(date, member)
      if (name !== undefined) return name
    }
    return undefined
  }
  return holidayMap(calendar, year).get(epochDay)
}

/** Longest a month can ever be, so a rule for 29 February is allowed but 31 February is not. */
const LONGEST_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

function validateRule(rule: HolidayRule, index: number): void {
  const where = `rules[${String(index)}]`
  switch (rule.kind) {
    case 'fixed': {
      if (!Number.isInteger(rule.month) || rule.month < 1 || rule.month > 12)
        throw new InvalidArgumentError(`${where}.month`, 'must be a whole number from 1 to 12')
      const longest = LONGEST_MONTH[rule.month - 1] ?? 31
      if (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > longest)
        throw new InvalidArgumentError(
          `${where}.day`,
          `must be a whole number from 1 to ${String(longest)} for month ${String(rule.month)}`,
        )
      return
    }
    case 'nth-weekday':
      if (!Number.isInteger(rule.month) || rule.month < 1 || rule.month > 12)
        throw new InvalidArgumentError(`${where}.month`, 'must be a whole number from 1 to 12')
      if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7)
        throw new InvalidArgumentError(
          `${where}.weekday`,
          'must be an ISO weekday from 1 (Monday) to 7 (Sunday)',
        )
      if (![1, 2, 3, 4, -1].includes(rule.nth))
        throw new InvalidArgumentError(`${where}.nth`, 'must be 1, 2, 3, 4 or -1 for the last')
      return
    case 'easter':
      if (!Number.isInteger(rule.offset) || Math.abs(rule.offset) > 366)
        throw new InvalidArgumentError(
          `${where}.offset`,
          'must be a whole number of days within a year of Easter Sunday',
        )
      return
    case 'one-off':
      // Throws DateParseError if the date is not a real calendar date.
      epochDayOf(rule.date)
      return
    default:
      return assertNever(rule)
  }
}

/**
 * Builds a calendar from your own rules — a company's closure days, a market
 * this package does not ship, or a national calendar with local additions.
 *
 * Rules are validated here: a rule for 31 February, an nth of 7, or a closure
 * date that is not a real date is refused rather than quietly shifted onto some
 * nearby day.
 */
export function customCalendar(definition: {
  readonly id: string
  readonly name?: string
  /** Defaults to Saturday and Sunday. */
  readonly weekend?: readonly Weekday[]
  /** Rules, or plain `YYYY-MM-DD` dates for one-off closures. */
  readonly rules?: readonly HolidayRule[]
  readonly dates?: readonly string[]
  readonly validFrom: number
  readonly validThrough: number
}): RuleCalendar {
  if (definition.validThrough < definition.validFrom)
    throw new InvalidArgumentError('validThrough', 'must not be earlier than validFrom')
  const dateRules: readonly HolidayRule[] = (definition.dates ?? []).map((date) => ({
    kind: 'one-off',
    name: date,
    date,
  }))
  const rules = [...(definition.rules ?? []), ...dateRules]
  rules.forEach(validateRule)
  return Object.freeze({
    kind: 'rules',
    id: definition.id,
    name: definition.name ?? definition.id,
    weekend: Object.freeze([...(definition.weekend ?? [6, 7])]),
    rules: Object.freeze(rules),
    validFrom: definition.validFrom,
    validThrough: definition.validThrough,
  })
}

/**
 * Combines calendars: the result is closed whenever any member is closed.
 *
 * This is what a cross-currency settlement date needs — a USD/EUR trade settles
 * only on a day both New York and TARGET2 are open.
 */
export function jointCalendar(...members: readonly Calendar[]): JointCalendar {
  if (members.length < 2)
    throw new InvalidArgumentError('members', 'a joint calendar needs at least two calendars')
  return Object.freeze({
    kind: 'joint',
    id: members.map((member) => member.id).join('+'),
    name: members.map((member) => member.name).join(' + '),
    members: Object.freeze([...members]),
  })
}
