import { describe, expect, it } from 'vitest'
import { assertNever } from '../src/assert.js'
import { isBusinessDay } from '../src/businessday.js'
import { nyse } from '../src/calendars/index.js'
import {
  addYears,
  dateFromEpochDay,
  daysInYear,
  isAfter,
  isBefore,
  isSameDate,
  toCivil,
  today,
} from '../src/civil.js'
import {
  CalendarRangeError,
  DateParseError,
  InvalidArgumentError,
  InvalidDateError,
  isBizDateError,
  ScheduleError,
} from '../src/errors.js'
import { frequencyStep, periodsPerYear } from '../src/frequency.js'
import { generateSchedule } from '../src/schedule.js'

describe('errors', () => {
  it('carries a stable code and structured context on a parse failure', () => {
    const error = new DateParseError('2026-02-30', 'day must be 01-28 for month 02 of 2026')
    expect(error.name).toBe('DateParseError')
    expect(error.code).toBe('DATE_PARSE')
    expect(error.message).toBe(
      'Cannot parse "2026-02-30" as a YYYY-MM-DD date: day must be 01-28 for month 02 of 2026',
    )
    expect(error.toJSON()).toStrictEqual({
      name: 'DateParseError',
      code: 'DATE_PARSE',
      message: error.message,
      input: '2026-02-30',
      reason: 'day must be 01-28 for month 02 of 2026',
    })
  })

  it('serialises every error class', () => {
    expect(new InvalidDateError('month', 13, 'must be 1-12').toJSON()).toMatchObject({
      code: 'INVALID_DATE',
      field: 'month',
      value: 13,
    })
    expect(new InvalidArgumentError('notional', 'must be a bigint').toJSON()).toMatchObject({
      code: 'INVALID_ARGUMENT',
      argument: 'notional',
    })
    expect(new CalendarRangeError('nyse', 1960, 1971, 2100).toJSON()).toMatchObject({
      code: 'CALENDAR_RANGE',
      calendar: 'nyse',
      year: 1960,
      validFrom: 1971,
      validThrough: 2100,
    })
    expect(new ScheduleError('termination must be later than effective').toJSON()).toMatchObject({
      code: 'SCHEDULE',
      reason: 'termination must be later than effective',
    })
  })

  it('keeps the original error as the cause', () => {
    const cause = new Error('underlying')
    const error = new InvalidArgumentError('rate', 'unreadable', { cause })
    expect(error.cause).toBe(cause)
    expect(error.toJSON()).toMatchObject({ cause: 'underlying' })
  })

  it('narrows a caught value', () => {
    try {
      isBusinessDay('1960-01-04', nyse)
      throw new Error('expected a failure')
    } catch (error) {
      expect(isBizDateError(error)).toBe(true)
      if (!isBizDateError(error)) throw error
      expect(error.code).toBe('CALENDAR_RANGE')
    }
    expect(isBizDateError(new Error('plain'))).toBe(false)
    expect(isBizDateError('not an error')).toBe(false)
    expect(isBizDateError(Object.assign(new Error('faker'), { code: 'NOT_OURS' }))).toBe(false)
  })

  it('reports an unreachable variant if one ever arrives', () => {
    expect(() => assertNever('impossible' as never)).toThrow(TypeError)
  })
})

describe('remaining date helpers', () => {
  it('orders and compares', () => {
    expect(isBefore('2026-01-01', '2026-01-02')).toBe(true)
    expect(isAfter('2026-01-01', '2026-01-02')).toBe(false)
    expect(isSameDate('2026-01-01', '2026-01-01')).toBe(true)
    expect(addYears('2026-01-31', 1)).toBe('2027-01-31')
    expect(daysInYear(2024)).toBe(366)
    expect(daysInYear(2026)).toBe(365)
    expect(toCivil(dateFromEpochDay(0))).toStrictEqual({ year: 1970, month: 1, day: 1 })
  })

  it('reads today in the zone you name', () => {
    expect(today({ zone: 'utc' })).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(today({ zone: 'local' })).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('frequencies', () => {
  it('describes the step for each frequency', () => {
    expect(frequencyStep('quarterly')).toStrictEqual({ unit: 'months', count: 3 })
    expect(frequencyStep('weekly')).toStrictEqual({ unit: 'days', count: 7 })
    expect(frequencyStep('term')).toStrictEqual({ unit: 'term' })
    expect(periodsPerYear('semi-annual')).toBe(2)
  })

  it('refuses a frequency it does not know', () => {
    // @ts-expect-error an unknown frequency is a compile error as well as a runtime one
    expect(() => frequencyStep('biennial')).toThrow(InvalidArgumentError)
    expect(() => periodsPerYear('term')).toThrow(/has no periods per year/)
    expect(() =>
      generateSchedule({
        effective: '2026-01-01',
        termination: '2027-01-01',
        // @ts-expect-error same, through the schedule entry point
        frequency: 'biennial',
      }),
    ).toThrow(InvalidArgumentError)
  })
})
