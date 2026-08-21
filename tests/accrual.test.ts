import { describe, expect, it } from 'vitest'
import { accrue, accrueExact, amortize, exactLevelPayment } from '../src/accrual.js'
import { nyse } from '../src/calendars/index.js'
import { InvalidArgumentError } from '../src/errors.js'
import { fraction, toFractionString, toNumber } from '../src/rational.js'
import { generateSchedule } from '../src/schedule.js'

describe('accrue', () => {
  it('accrues six months on a million at 5.25%, ACT/365F', () => {
    const options = {
      notional: 1_000_000_00n,
      rate: '5.25%',
      start: '2026-01-31',
      end: '2026-07-31',
      convention: 'ACT/365F',
    } as const
    expect(toFractionString(accrueExact(options))).toBe('190050000/73')
    expect(accrue(options)).toBe(2_603_425n)
  })

  it('reads 0.0525, "0.0525" and "5.25%" as the same rate', () => {
    const base = {
      notional: 1_000_000_00n,
      start: '2026-01-31',
      end: '2026-07-31',
      convention: 'ACT/365F',
    } as const
    expect(accrue({ ...base, rate: 0.0525 })).toBe(accrue({ ...base, rate: '0.0525' }))
    expect(accrue({ ...base, rate: '5.25%' })).toBe(accrue({ ...base, rate: '0.0525' }))
  })

  it('applies the rounding policy at the single point of rounding', () => {
    const base = {
      notional: 1_000_000_00n,
      rate: '5.25%',
      start: '2026-01-31',
      end: '2026-07-31',
      convention: 'ACT/365F',
    } as const
    expect(accrue({ ...base, rounding: 'floor' })).toBe(2_603_424n)
    expect(accrue({ ...base, rounding: 'ceiling' })).toBe(2_603_425n)
    expect(() => accrue({ ...base, rounding: 'exact' })).toThrow(InvalidArgumentError)
  })

  it('gives a negative accrual for a backwards period', () => {
    expect(
      accrue({
        notional: 1_000_000_00n,
        rate: '5.25%',
        start: '2026-07-31',
        end: '2026-01-31',
        convention: 'ACT/365F',
      }),
    ).toBe(-2_603_425n)
  })

  it('rejects a notional that is not minor units', () => {
    expect(() =>
      accrue({
        // @ts-expect-error a float notional is exactly the mistake this rejects
        notional: 1000.5,
        rate: 0.05,
        start: '2026-01-01',
        end: '2026-02-01',
        convention: 'ACT/360',
      }),
    ).toThrow(InvalidArgumentError)
  })
})

describe('amortize', () => {
  const mortgage = {
    kind: 'periodic',
    principal: 250_000_00n,
    annualRate: '4.99%',
    periodsPerYear: 12,
    periods: 360,
  } as const

  it('prices a 30-year mortgage and repays it to the penny', () => {
    const schedule = amortize(mortgage)
    expect(schedule.payment).toBe(134_053n)
    expect(schedule.periods).toHaveLength(360)
    expect(schedule.periods[0]?.interest).toBe(103_958n)
    expect(schedule.periods[359]?.balance).toBe(0n)
    expect(schedule.periods[359]?.payment).toBe(133_756n)
    expect(schedule.totalInterest).toBe(232_587_83n)
    expect(schedule.periods.reduce((sum, period) => sum + period.principal, 0n)).toBe(250_000_00n)
    expect(schedule.totalPaid).toBe(250_000_00n + schedule.totalInterest)
  })

  it('computes the level payment exactly before rounding it', () => {
    // (1 + i)^360 is a ratio of four-figure-digit integers; the exact payment
    // is carried as that ratio and only converted at the very end.
    const exact = exactLevelPayment(250_000_00n, fraction(499n, 120_000n), 360)
    expect(exact.denominator.toString()).toHaveLength(1827)
    expect(Number(exact.numerator)).toBe(Number.POSITIVE_INFINITY)
    expect(toNumber(exact)).toBeCloseTo(134_052.657_959_465_26, 6)
  })

  it('repays equal principal each period when asked', () => {
    const schedule = amortize({ ...mortgage, method: 'level-principal', periods: 4 })
    expect(schedule.periods.map((period) => period.principal)).toStrictEqual([
      62_500_00n,
      62_500_00n,
      62_500_00n,
      62_500_00n,
    ])
    expect(schedule.periods[0]?.payment).toBeGreaterThan(schedule.periods[3]?.payment ?? 0n)
  })

  it('pays interest only until maturity', () => {
    const schedule = amortize({ ...mortgage, method: 'interest-only', periods: 3 })
    expect(schedule.periods.map((period) => period.principal)).toStrictEqual([0n, 0n, 250_000_00n])
    expect(schedule.periods[0]?.interest).toBe(103_958n)
    expect(schedule.periods[2]?.balance).toBe(0n)
  })

  it('refuses a payment that would never repay the loan', () => {
    expect(() => amortize({ ...mortgage, payment: 1_000n })).toThrow(InvalidArgumentError)
  })

  it('handles a zero rate', () => {
    const schedule = amortize({ ...mortgage, annualRate: 0, periods: 4 })
    expect(schedule.payment).toBe(62_500_00n)
    expect(schedule.totalInterest).toBe(0n)
    expect(schedule.periods[3]?.balance).toBe(0n)
  })

  it('charges interest by real dates when given a schedule', () => {
    const schedule = generateSchedule({
      effective: '2026-01-31',
      termination: '2027-01-31',
      frequency: 'quarterly',
      calendar: nyse,
      convention: 'modified-following',
    })
    const loan = amortize({
      kind: 'dated',
      schedule,
      convention: 'ACT/365F',
      principal: 100_000_00n,
      annualRate: '6%',
    })
    expect(loan.periods).toHaveLength(4)
    // 31 January 2026 is a Saturday, and moving forward would cross into
    // February, so the modified-following rule moves the accrual start back.
    expect(loan.periods[0]?.start).toBe('2026-01-30')
    expect(loan.periods[0]?.end).toBe('2026-04-30')
    // 90 days at 6% on 100,000.00 = 1,479.45
    expect(loan.periods[0]?.interest).toBe(1_479_45n)
    // The last period is shorter, so it charges less interest than the first.
    expect(loan.periods[3]?.interest).toBe(382_33n)
    // Real periods differ in length, so the instalment is the exact annuity for
    // these dates: every payment is the same and the last one differs only by
    // accumulated rounding.
    expect(new Set(loan.periods.slice(0, 3).map((period) => period.payment)).size).toBe(1)
    expect(
      Math.abs(Number((loan.periods[3]?.payment ?? 0n) - (loan.periods[0]?.payment ?? 0n))),
    ).toBeLessThan(10)
    expect(loan.periods[3]?.balance).toBe(0n)
    expect(loan.periods.reduce((sum, period) => sum + period.principal, 0n)).toBe(100_000_00n)
  })
})

describe('amortize rounding of the instalment', () => {
  it('rounds the payment up by default so the balance always falls', () => {
    const loan = amortize({
      kind: 'periodic',
      principal: 10_000n,
      annualRate: '3.71%',
      periodsPerYear: 2,
      periods: 40,
    })
    expect(
      loan.periods.every(
        (period, index) => index === 0 || period.balance < (loan.periods[index - 1]?.balance ?? 0n),
      ),
    ).toBe(true)
    expect(loan.periods[39]?.balance).toBe(0n)
  })

  it('lets you round the instalment another way', () => {
    const up = amortize({
      kind: 'periodic',
      principal: 250_000_00n,
      annualRate: '4.99%',
      periodsPerYear: 12,
      periods: 360,
    })
    const down = amortize({
      kind: 'periodic',
      principal: 250_000_00n,
      annualRate: '4.99%',
      periodsPerYear: 12,
      periods: 360,
      paymentRounding: 'floor',
    })
    expect(up.payment).toBe(134_053n)
    expect(down.payment).toBe(134_052n)
    expect(down.totalInterest).toBeGreaterThan(up.totalInterest)
  })

  it('refuses a quoted instalment that leaves a lump sum at maturity', () => {
    const quoted = {
      kind: 'periodic',
      principal: 100_000n,
      annualRate: '12%',
      periodsPerYear: 12,
      periods: 12,
      payment: 2_000n,
    } as const
    expect(() => amortize(quoted)).toThrow(/is not repaid by its instalments/)

    // Unless the balloon is the product, in which case the final row settles it.
    const balloon = amortize({ ...quoted, balloon: true })
    expect(balloon.periods[10]?.payment).toBe(2_000n)
    expect(balloon.periods[11]?.payment).toBe(89_316n)
    expect(balloon.periods[11]?.balance).toBe(0n)
  })

  it('raises an instalment that rounding left too small to repay the loan', () => {
    // 100.03 at 16.67% over 53 years: the exact instalment is barely above the
    // interest, and rounding alone would leave the balance standing.
    const loan = amortize({
      kind: 'periodic',
      principal: 10_003n,
      annualRate: '16.67%',
      periodsPerYear: 1,
      periods: 53,
    })
    expect(loan.payment).toBe(1_669n)
    expect(loan.periods[0]?.interest).toBe(1_668n)
    // Raised by a single minor unit above the interest, the instalment repays
    // the loan — and does it well before the 53rd period, so the schedule ends
    // where the balance does rather than trailing empty rows.
    expect(loan.periods.length).toBeLessThan(53)
    expect(loan.periods[loan.periods.length - 1]?.balance).toBe(0n)
    expect(loan.periods.reduce((sum, period) => sum + period.principal, 0n)).toBe(10_003n)
  })
})
