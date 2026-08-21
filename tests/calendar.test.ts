import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  adjust,
  businessDaysBetween,
  isBusinessDay,
  nextBusinessDay,
  nonBusinessDaysBetween,
  previousBusinessDay,
  settlementDate,
} from '../src/businessday.js'
import {
  customCalendar,
  holidayName,
  holidays,
  isHoliday,
  isWeekend,
  jointCalendar,
} from '../src/calendar.js'
import { calendars, lse, nyse, target, unitedStates } from '../src/calendars/index.js'
import { CalendarRangeError, InvalidArgumentError } from '../src/errors.js'

describe('shipped calendars', () => {
  it('knows when the NYSE is shut', () => {
    expect(isBusinessDay('2026-11-26', nyse)).toBe(false) // Thanksgiving
    expect(isBusinessDay('2026-11-27', nyse)).toBe(true) // the Friday after is a trading day
    expect(holidayName('2026-11-26', nyse)).toBe('Thanksgiving Day')
    expect(isHoliday('2026-11-28', nyse)).toBe(false)
    expect(isWeekend('2026-11-28', nyse)).toBe(true)
  })

  it('does not observe a Saturday New Year on the NYSE, but does for settlement', () => {
    // 1 January 2028 is a Saturday.
    expect(isBusinessDay('2027-12-31', nyse)).toBe(true)
    expect(isBusinessDay('2027-12-31', unitedStates)).toBe(false)
  })

  it('closes TARGET2 for Easter but never moves a weekend holiday', () => {
    expect(isBusinessDay('2026-04-03', target)).toBe(false) // Good Friday
    expect(isBusinessDay('2026-04-06', target)).toBe(false) // Easter Monday
    // 26 December 2026 is a Saturday; no weekday is taken in its place.
    expect(isBusinessDay('2026-12-28', target)).toBe(true)
  })

  it('takes a substitute weekday in London', () => {
    // Boxing Day 2026 falls on a Saturday, so the Monday is a bank holiday.
    expect(isBusinessDay('2026-12-28', lse)).toBe(false)
  })

  it('lists a year of holidays with names', () => {
    const listed = holidays(target, 2026)
    expect(listed.map((holiday) => holiday.date)).toStrictEqual([
      '2026-01-01',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-12-25',
      '2026-12-26',
    ])
    expect(listed[1]?.name).toBe('Good Friday')
  })

  it('refuses to answer for years its rules were not checked over', () => {
    expect(() => isBusinessDay('1960-01-04', nyse)).toThrow(CalendarRangeError)
    expect(() => isBusinessDay('2101-01-04', nyse)).toThrow(CalendarRangeError)
    try {
      isBusinessDay('1960-01-04', nyse)
    } catch (error) {
      if (!(error instanceof CalendarRangeError)) throw error
      expect(error.code).toBe('CALENDAR_RANGE')
      expect(error.calendar).toBe('nyse')
      expect(error.year).toBe(1960)
      expect(error.validFrom).toBe(1971)
    }
  })

  it('exposes every calendar by id', () => {
    expect(Object.keys(calendars)).toStrictEqual([
      'nyse',
      'sifma',
      'fedwire',
      'unitedStates',
      'target',
      'lse',
      'unitedKingdom',
      'weekendsOnly',
      'everyDay',
    ])
  })
})

describe('custom and joint calendars', () => {
  it('takes a list of closure dates', () => {
    const office = customCalendar({
      id: 'acme',
      dates: ['2026-07-06', '2026-12-24'],
      validFrom: 2020,
      validThrough: 2030,
    })
    expect(isBusinessDay('2026-07-06', office)).toBe(false)
    expect(isBusinessDay('2026-07-07', office)).toBe(true)
    expect(holidays(office, 2026).map((holiday) => holiday.date)).toStrictEqual([
      '2026-07-06',
      '2026-12-24',
    ])
  })

  it('takes its own rules and weekend', () => {
    const gulf = customCalendar({
      id: 'gulf',
      weekend: [5, 6],
      rules: [{ kind: 'fixed', name: 'National Day', month: 12, day: 2 }],
      validFrom: 2020,
      validThrough: 2030,
    })
    expect(isWeekend('2026-01-02', gulf)).toBe(true) // Friday
    expect(isWeekend('2026-01-04', gulf)).toBe(false) // Sunday
    expect(isBusinessDay('2026-12-02', gulf)).toBe(false)
  })

  it('is shut when any member of a joint calendar is shut', () => {
    const both = jointCalendar(nyse, lse)
    expect(isBusinessDay('2026-11-26', both)).toBe(false) // US Thanksgiving
    expect(isBusinessDay('2026-08-31', both)).toBe(false) // UK Summer Bank Holiday
    expect(isBusinessDay('2026-09-01', both)).toBe(true)
    expect(both.id).toBe('nyse+lse')
  })

  it('needs at least two calendars to join', () => {
    expect(() => jointCalendar(nyse)).toThrow(InvalidArgumentError)
  })

  it.each([
    [
      { kind: 'fixed', name: 'Impossible', month: 2, day: 31 } as const,
      /must be a whole number from 1 to 29/,
    ],
    [{ kind: 'fixed', name: 'Bad month', month: 13, day: 1 } as const, /month.*1 to 12/],
    [
      { kind: 'nth-weekday', name: 'Bad nth', month: 5, weekday: 1, nth: 7 } as const,
      /must be 1, 2, 3, 4 or -1/,
    ],
    [
      { kind: 'nth-weekday', name: 'Bad weekday', month: 5, weekday: 8, nth: 1 } as const,
      /ISO weekday/,
    ],
    [{ kind: 'easter', name: 'Far off', offset: 400 } as const, /within a year of Easter/],
    [{ kind: 'one-off', name: 'Bad date', date: '2026-02-30' } as const, /Cannot parse/],
  ])('refuses a rule that describes no real day (%#)', (rule, message) => {
    expect(() =>
      // @ts-expect-error the invalid members are rejected at compile time too
      customCalendar({ id: 'x', rules: [rule], validFrom: 2020, validThrough: 2030 }),
    ).toThrow(message)
  })

  it('does not invent a leap day in a common year', () => {
    const leapDay = customCalendar({
      id: 'leap',
      rules: [{ kind: 'fixed', name: 'Leap Day', month: 2, day: 29 }],
      validFrom: 2020,
      validThrough: 2030,
    })
    expect(holidays(leapDay, 2024)).toStrictEqual([{ date: '2024-02-29', name: 'Leap Day' }])
    expect(holidays(leapDay, 2026)).toStrictEqual([])
  })

  it('rejects a custom calendar with an impossible validity window', () => {
    expect(() => customCalendar({ id: 'x', validFrom: 2030, validThrough: 2020 })).toThrow(
      InvalidArgumentError,
    )
  })
})

describe('business day arithmetic', () => {
  it('steps to the next and previous open day', () => {
    expect(nextBusinessDay('2026-11-25', nyse)).toBe('2026-11-27')
    expect(previousBusinessDay('2026-11-27', nyse)).toBe('2026-11-25')
    // From a closed day, the step still lands on the next open one.
    expect(nextBusinessDay('2026-11-26', nyse)).toBe('2026-11-27')
  })

  it('adds and subtracts business days', () => {
    expect(addBusinessDays('2026-11-24', 3, nyse)).toBe('2026-11-30')
    expect(addBusinessDays('2026-11-30', -3, nyse)).toBe('2026-11-24')
    expect(addBusinessDays('2026-11-26', 0, nyse)).toBe('2026-11-26')
  })

  it('settles T+1 and T+2 over a holiday', () => {
    expect(settlementDate('2026-11-25', { days: 1, calendar: nyse })).toBe('2026-11-27')
    expect(settlementDate('2026-11-25', { days: 2, calendar: nyse })).toBe('2026-11-30')
    // A trade booked on a closed day settles from the next open day.
    expect(settlementDate('2026-11-26', { days: 1, calendar: nyse })).toBe('2026-11-30')
    expect(() => settlementDate('2026-11-25', { days: -1, calendar: nyse })).toThrow(
      InvalidArgumentError,
    )
  })

  it('applies every adjustment convention', () => {
    // 31 January 2026 is a Saturday.
    expect(adjust('2026-01-31', 'unadjusted', nyse)).toBe('2026-01-31')
    expect(adjust('2026-01-31', 'following', nyse)).toBe('2026-02-02')
    expect(adjust('2026-01-31', 'modified-following', nyse)).toBe('2026-01-30')
    expect(adjust('2026-01-31', 'preceding', nyse)).toBe('2026-01-30')
    expect(adjust('2026-02-01', 'modified-preceding', nyse)).toBe('2026-02-02')
    expect(adjust('2026-01-31', 'nearest', nyse)).toBe('2026-01-30')
    expect(adjust('2026-01-11', 'nearest', nyse)).toBe('2026-01-12')
  })

  it('counts business days between dates', () => {
    expect(businessDaysBetween('2026-11-23', '2026-11-27', nyse)).toBe(3)
    expect(businessDaysBetween('2026-11-27', '2026-11-23', nyse)).toBe(-3)
    expect(businessDaysBetween('2026-11-23', '2026-11-27', nyse, { includeTo: true })).toBe(4)
    expect(businessDaysBetween('2026-11-23', '2026-11-23', nyse, { includeTo: true })).toBe(1)
  })

  it('lists the days a market is shut', () => {
    expect(nonBusinessDaysBetween('2026-11-25', '2026-11-30', nyse)).toStrictEqual([
      '2026-11-26',
      '2026-11-28',
      '2026-11-29',
    ])
    expect(() => nonBusinessDaysBetween('2026-11-30', '2026-11-25', nyse)).toThrow(
      InvalidArgumentError,
    )
  })
})
