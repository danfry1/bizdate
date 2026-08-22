import { describe, expect, it } from 'vitest'
import {
  accrue,
  accruedInterest,
  addBusinessDays,
  adjust,
  customCalendar,
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
  previousBusinessDay,
  settlementDate,
  target,
  fractionToString,
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
    expect(fractionToString(exactDayCountFraction('2026-01-31', '2026-07-31', 'ACT/365F'))).toBe(
      '181/365',
    )
    expect(
      fractionToString(exactDayCountFraction('2023-12-01', '2024-02-01', 'ACT/ACT ISDA')),
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

  it('accrued interest', () => {
    const bond = generateSchedule({
      effective: '2024-05-15',
      termination: '2029-05-15',
      frequency: 'semi-annual',
      calendar: target,
      convention: 'following',
    })
    const accrued = accruedInterest({
      schedule: bond,
      settlement: '2026-08-22',
      notional: 1_000_000_00n,
      rate: '3.5%',
      convention: 'ACT/ACT ICMA',
      dates: 'unadjusted',
    })
    expect(accrued.amount).toBe(941_576n)
    expect(accrued.days).toBe(99)
    expect(accrued.period.unadjustedEnd).toBe('2026-11-15')
  })

  it('parsing untrusted input', () => {
    const parsed = parseDate('2026-02-30')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected a failure')
    expect(parsed.error.reason).toBe('day must be 01-28 for month 02 of 2026')
  })
})

/** The migration guide's examples, minus the one needing `date-holidays` as a dependency. */
describe('MIGRATING', () => {
  it('turns your own holiday list and rules into a calendar', () => {
    const office = customCalendar({
      id: 'acme',
      dates: ['2026-07-06', '2026-12-24', '2026-12-31'],
      rules: [
        { kind: 'fixed', name: "Founders' Day", month: 9, day: 1, observed: 'nearest-weekday' },
        { kind: 'nth-weekday', name: 'Volunteering Day', month: 6, weekday: 5, nth: 1 },
      ],
      validFrom: 2024,
      validThrough: 2030,
    })
    expect(isBusinessDay('2026-07-06', office)).toBe(false)
    expect(holidays(office, 2026).map((holiday) => holiday.date)).toStrictEqual([
      '2026-06-05',
      '2026-07-06',
      '2026-09-01',
      '2026-12-24',
      '2026-12-31',
    ])
  })

  it('counts business days the way the guide says it does', () => {
    expect(addBusinessDays('2026-11-24', 3, nyse)).toBe('2026-11-30')
    expect(addBusinessDays('2026-11-30', -3, nyse)).toBe('2026-11-24')
    expect(addBusinessDays('2026-11-26', 0, nyse)).toBe('2026-11-26')
    expect(adjust('2026-11-26', 'following', nyse)).toBe('2026-11-27')
    expect(previousBusinessDay('2026-11-27', nyse)).toBe('2026-11-25')
  })

  it('produces the date-holidays bridge result for the UK', () => {
    // The same public holidays `date-holidays` reports for GB in 2026, fed in
    // as a list — the bridge in MIGRATING.md, without the dependency.
    const unitedKingdomPublic = customCalendar({
      id: 'gb-public',
      dates: [
        '2026-01-01',
        '2026-04-03',
        '2026-04-06',
        '2026-05-04',
        '2026-05-25',
        '2026-08-31',
        '2026-12-25',
        '2026-12-26',
        '2026-12-28',
      ],
      validFrom: 2026,
      validThrough: 2026,
    })
    expect(addBusinessDays('2026-12-24', 2, unitedKingdomPublic)).toBe('2026-12-30')
  })
})
