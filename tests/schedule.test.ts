import { describe, expect, it } from 'vitest'
import { nyse, target } from '../src/calendars/index.js'
import { ScheduleError } from '../src/errors.js'
import { generateSchedule, scheduleDates } from '../src/schedule.js'

describe('generateSchedule', () => {
  it('rolls backward from maturity by default', () => {
    const schedule = generateSchedule({
      effective: '2026-01-15',
      termination: '2028-01-15',
      frequency: 'semi-annual',
    })
    expect(scheduleDates(schedule)).toStrictEqual([
      '2026-01-15',
      '2026-07-15',
      '2027-01-15',
      '2027-07-15',
      '2028-01-15',
    ])
    expect(schedule.periods.every((period) => !period.isStub)).toBe(true)
  })

  it('puts a short first period at the front when rolling backward', () => {
    const schedule = generateSchedule({
      effective: '2026-03-01',
      termination: '2028-01-15',
      frequency: 'semi-annual',
    })
    expect(scheduleDates(schedule)).toStrictEqual([
      '2026-03-01',
      '2026-07-15',
      '2027-01-15',
      '2027-07-15',
      '2028-01-15',
    ])
    expect(schedule.periods.map((period) => period.isStub)).toStrictEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('puts the odd period at the end when rolling forward', () => {
    const schedule = generateSchedule({
      effective: '2026-01-15',
      termination: '2027-11-01',
      frequency: 'semi-annual',
      roll: 'forward',
    })
    expect(scheduleDates(schedule)).toStrictEqual([
      '2026-01-15',
      '2026-07-15',
      '2027-01-15',
      '2027-07-15',
      '2027-11-01',
    ])
    expect(schedule.periods[3]?.isStub).toBe(true)
  })

  it('honours an explicit stub boundary', () => {
    const schedule = generateSchedule({
      effective: '2026-01-05',
      termination: '2027-07-15',
      frequency: 'semi-annual',
      firstRegularDate: '2026-07-15',
    })
    expect(scheduleDates(schedule)).toStrictEqual([
      '2026-01-05',
      '2026-07-15',
      '2027-01-15',
      '2027-07-15',
    ])
  })

  it('keeps every date on a month end when the roll date is one', () => {
    const schedule = generateSchedule({
      effective: '2026-02-28',
      termination: '2027-02-28',
      frequency: 'quarterly',
      endOfMonth: true,
    })
    expect(scheduleDates(schedule)).toStrictEqual([
      '2026-02-28',
      '2026-05-31',
      '2026-08-31',
      '2026-11-30',
      '2027-02-28',
    ])
  })

  it('keeps unadjusted and adjusted dates side by side', () => {
    const schedule = generateSchedule({
      effective: '2026-01-31',
      termination: '2026-07-31',
      frequency: 'quarterly',
      calendar: nyse,
      convention: 'following',
    })
    expect(schedule.periods[0]).toMatchObject({
      unadjustedStart: '2026-01-31',
      unadjustedEnd: '2026-04-30',
      start: '2026-02-02',
      end: '2026-04-30',
    })
  })

  it('pays a lag of business days after each period', () => {
    const schedule = generateSchedule({
      effective: '2026-01-15',
      termination: '2026-07-15',
      frequency: 'quarterly',
      calendar: target,
      paymentLag: 2,
    })
    expect(schedule.periods.map((period) => period.paymentDate)).toStrictEqual([
      '2026-04-17',
      '2026-07-17',
    ])
  })

  it('treats "term" as a single period', () => {
    const schedule = generateSchedule({
      effective: '2026-01-15',
      termination: '2031-01-15',
      frequency: 'term',
    })
    expect(schedule.periods).toHaveLength(1)
    expect(scheduleDates(schedule)).toStrictEqual(['2026-01-15', '2031-01-15'])
  })

  it.each([
    [{ effective: '2026-01-15', termination: '2026-01-15' }, 'termination must be later'],
    [{ effective: '2026-06-15', termination: '2026-01-15' }, 'termination must be later'],
    [
      { effective: '2026-01-15', termination: '2027-01-15', firstRegularDate: '2026-01-01' },
      'firstRegularDate must be later than effective',
    ],
    [
      { effective: '2026-01-15', termination: '2027-01-15', lastRegularDate: '2027-06-01' },
      'lastRegularDate must be earlier than termination',
    ],
  ])('refuses a self-contradictory schedule (%#)', (options, message) => {
    expect(() => generateSchedule({ ...options, frequency: 'quarterly' })).toThrow(ScheduleError)
    expect(() => generateSchedule({ ...options, frequency: 'quarterly' })).toThrow(message)
  })
})
