import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  dateFromEpochDay,
  daysBetween,
  dayOfWeek,
  epochDayOf,
  fromJsDate,
  isEndOfMonth,
  isIsoDate,
  isLeapYear,
  lastDayOfMonth,
  parseDate,
  parseDateOrThrow,
  toCivil,
  toIsoDate,
  toJsDate,
} from '../src/civil.js'
import { DateParseError, InvalidDateError } from '../src/errors.js'

describe('parseDate', () => {
  it.each([
    ['2026-01-31', { year: 2026, month: 1, day: 31 }],
    ['2024-02-29', { year: 2024, month: 2, day: 29 }],
    ['1600-01-01', { year: 1600, month: 1, day: 1 }],
    ['9999-12-31', { year: 9999, month: 12, day: 31 }],
  ])('accepts %s', (input, civil) => {
    const parsed = parseDate(input)
    expect(parsed.ok).toBe(true)
    expect(toCivil(input)).toStrictEqual(civil)
  })

  it.each([
    ['2026-02-30', 'day must be 01-28 for month 02 of 2026'],
    ['2023-02-29', 'day must be 01-28 for month 02 of 2023'],
    ['2026-06-31', 'day must be 01-30 for month 06 of 2026'],
    ['2026-13-01', 'month must be 01-12'],
    ['2026-00-10', 'month must be 01-12'],
    ['1599-12-31', 'year must be 1600-9999'],
  ])('rejects %s as out of range', (input, reason) => {
    const parsed = parseDate(input)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected a failure')
    expect(parsed.error).toBeInstanceOf(DateParseError)
    expect(parsed.error.code).toBe('DATE_PARSE')
    expect(parsed.error.reason).toBe(reason)
    expect(parsed.error.input).toBe(input)
  })

  it.each([
    '2026-2-01',
    '2026-02-1',
    '20260201',
    '2026-02-01T00:00:00Z',
    '2026-02-01 ',
    '2026/02/01',
    '+2026-02-01',
  ])('rejects %s as malformed', (input) => {
    const parsed = parseDate(input)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected a failure')
    expect(parsed.error.reason).toBe('expected exactly YYYY-MM-DD with zero-padded fields')
  })

  it('throws the same error from parseDateOrThrow', () => {
    expect(() => parseDateOrThrow('2026-02-30')).toThrow(DateParseError)
  })

  it('reports whether a value is a valid date string', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate(20260228)).toBe(false)
  })
})

describe('toIsoDate', () => {
  it('normalises civil fields', () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07')
  })

  it('rejects civil fields that are not a real date', () => {
    expect(() => toIsoDate({ year: 2026, month: 2, day: 30 })).toThrow(InvalidDateError)
    expect(() => toIsoDate({ year: 2026, month: 1, day: 1.5 })).toThrow(InvalidDateError)
  })
})

describe('date arithmetic', () => {
  it('clamps a month step to the end of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('keeps month ends together under the end-of-month rule', () => {
    expect(addMonths('2026-02-28', 1, { endOfMonth: true })).toBe('2026-03-31')
    expect(addMonths('2026-02-28', 1)).toBe('2026-03-28')
    expect(addMonths('2026-01-30', 1, { endOfMonth: true })).toBe('2026-02-28')
  })

  it('clamps 29 February when adding years', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28')
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29')
  })

  it('counts days between dates, signed', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1)
  })

  it('round-trips through epoch days', () => {
    expect(epochDayOf('1970-01-01')).toBe(0)
    expect(dateFromEpochDay(0)).toBe('1970-01-01')
    expect(dateFromEpochDay(epochDayOf('2026-08-21'))).toBe('2026-08-21')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('knows weekdays, month ends and leap years', () => {
    expect(dayOfWeek('2026-08-21')).toBe(5)
    expect(dayOfWeek('1970-01-01')).toBe(4)
    expect(lastDayOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(isEndOfMonth('2026-04-30')).toBe(true)
    expect(isEndOfMonth('2026-04-29')).toBe(false)
    expect([1900, 2000, 2023, 2024].map(isLeapYear)).toStrictEqual([false, true, false, true])
  })

  it('orders dates', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1)
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1)
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0)
  })
})

describe('JavaScript Date conversion', () => {
  it('reads the day in the zone you name', () => {
    const instant = new Date('2026-01-01T02:30:00Z')
    expect(fromJsDate(instant, { zone: 'utc' })).toBe('2026-01-01')
  })

  it('converts to midnight UTC', () => {
    expect(toJsDate('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('rejects an invalid Date', () => {
    expect(() => fromJsDate(new Date('nonsense'), { zone: 'utc' })).toThrow(InvalidDateError)
  })
})

describe('Temporal interoperability', () => {
  it('accepts anything shaped like a Temporal.PlainDate', () => {
    // Temporal.PlainDate exposes year, month and day, which is exactly the
    // CivilDate shape, so it is accepted with no adapter and no dependency.
    const plainDateLike = {
      year: 2026,
      month: 11,
      day: 26,
      calendarId: 'iso8601',
      dayOfWeek: 4,
      toString: () => '2026-11-26',
    }
    expect(toIsoDate(plainDateLike)).toBe('2026-11-26')
    expect(dayOfWeek(plainDateLike)).toBe(4)
    expect(daysBetween(plainDateLike, '2026-11-27')).toBe(1)
  })
})
