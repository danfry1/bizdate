import { describe, expect, it } from 'vitest'
import {
  accrue,
  addBusinessDays,
  adjust,
  allocate,
  amortize,
  businessDaysBetween,
  dayCountFraction,
  exactDayCountFraction,
  generateSchedule,
  holidays,
  isBusinessDay,
  jointCalendar,
  lse,
  nextBusinessDay,
  nyse,
  parseDate,
  settlementDate,
  target,
  toFractionString,
} from '../src/index.js'

/** Every claim the README makes, run as a test so the documentation cannot rot. */
describe('README', () => {
  it('the opening example', () => {
    expect(isBusinessDay('2026-11-26', nyse)).toBe(false)
    expect(settlementDate('2026-11-25', { days: 2, calendar: nyse })).toBe('2026-11-30')
  })

  it('the next open day', () => {
    expect(isBusinessDay('2026-12-25', nyse)).toBe(false)
    expect(nextBusinessDay('2026-11-25', nyse)).toBe('2026-11-27')
    expect(addBusinessDays('2026-11-24', 3, nyse)).toBe('2026-11-30')
    expect(businessDaysBetween('2026-11-23', '2026-11-27', nyse)).toBe(3)
    expect(adjust('2026-01-31', 'modified-following', nyse)).toBe('2026-01-30')
    expect(settlementDate('2026-04-01', { days: 2, calendar: jointCalendar(nyse, target) })).toBe(
      '2026-04-07',
    )
    const uk = holidays(lse, 2026)
    expect(uk[0]).toStrictEqual({ date: '2026-01-01', name: "New Year's Day" })
    expect(uk[uk.length - 1]).toStrictEqual({ date: '2026-12-28', name: 'Boxing Day' })
  })

  it('day count conventions', () => {
    expect(dayCountFraction('2026-01-31', '2026-07-31', 'ACT/365F')).toBe(0.4958904109589041)
    expect(dayCountFraction('2026-01-31', '2026-07-31', '30E/360')).toBe(0.5)
    expect(toFractionString(exactDayCountFraction('2026-01-31', '2026-07-31', 'ACT/365F'))).toBe(
      '181/365',
    )
    expect(
      toFractionString(exactDayCountFraction('2023-12-01', '2024-02-01', 'ACT/ACT ISDA')),
    ).toBe('22661/133590')
  })

  it('schedules', () => {
    const schedule = generateSchedule({
      effective: '2026-01-31',
      termination: '2031-01-31',
      frequency: 'semi-annual',
      calendar: nyse,
      convention: 'modified-following',
      endOfMonth: true,
      paymentLag: 2,
    })
    expect(schedule.periods[0]).toStrictEqual({
      index: 0,
      unadjustedStart: '2026-01-31',
      unadjustedEnd: '2026-07-31',
      start: '2026-01-30',
      end: '2026-07-31',
      paymentDate: '2026-08-04',
      isStub: false,
    })
  })

  it('interest and amortization', () => {
    expect(
      accrue({
        notional: 1_000_000_00n,
        rate: '5.25%',
        start: '2026-01-31',
        end: '2026-07-31',
        convention: 'ACT/365F',
      }),
    ).toBe(2_603_425n)

    const loan = amortize({
      kind: 'periodic',
      principal: 250_000_00n,
      annualRate: '4.99%',
      periodsPerYear: 12,
      periods: 360,
    })
    expect(loan.payment).toBe(134_053n)
    expect(loan.periods[0]?.interest).toBe(103_958n)
    expect(loan.periods[359]?.balance).toBe(0n)
    expect(loan.periods.reduce((sum, period) => sum + period.principal, 0n)).toBe(250_000_00n)
    expect(allocate(100n, [1, 1, 1])).toStrictEqual([34n, 33n, 33n])
  })

  it('parsing untrusted input', () => {
    const parsed = parseDate('2026-02-30')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected a failure')
    expect(parsed.error.reason).toBe('day must be 01-28 for month 02 of 2026')
  })
})
