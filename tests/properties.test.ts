import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { accrueExact, amortize } from '../src/accrual.js'
import { addBusinessDays, businessDaysBetween, isBusinessDay } from '../src/businessday.js'
import { lse, nyse, target } from '../src/calendars/index.js'
import { addDays, dateFromEpochDay, daysBetween, epochDayOf } from '../src/civil.js'
import { DAY_COUNT_CONVENTIONS, exactDayCountFraction } from '../src/daycount.js'
import { allocate, type Rounding, roundFraction } from '../src/money.js'
import {
  compareFractions,
  fraction,
  multiplyFractions,
  subtractFractions,
  fractionToNumber,
} from '../src/rational.js'

const CALENDARS = [nyse, target, lse] as const
/** 2000-01-01 to 2060-12-31, inside every shipped calendar's validated range. */
const epochDay = fc.integer({ min: 10_957, max: 33_237 })
const date = epochDay.map(dateFromEpochDay)
const calendar = fc.constantFrom(...CALENDARS)
const conventions = DAY_COUNT_CONVENTIONS.filter(
  (name) => name !== 'BUS/252' && name !== 'ACT/ACT ICMA' && name !== '1/1',
)

describe('day count properties', () => {
  it('is antisymmetric for every convention', () => {
    fc.assert(
      fc.property(date, date, fc.constantFrom(...conventions), (start, end, convention) => {
        const forward = exactDayCountFraction(start, end, convention)
        const backward = exactDayCountFraction(end, start, convention)
        expect(backward.numerator).toBe(-forward.numerator)
      }),
    )
  })

  it('never moves backwards in time for a later end date', () => {
    fc.assert(
      fc.property(
        date,
        fc.integer({ min: 0, max: 4000 }),
        fc.constantFrom(...conventions),
        (start, offset, convention) => {
          const end = addDays(start, offset)
          expect(
            compareFractions(exactDayCountFraction(start, end, convention), fraction(0n, 1n)),
          ).not.toBe(-1)
        },
      ),
    )
  })

  it('agrees with its own float form', () => {
    fc.assert(
      fc.property(date, date, fc.constantFrom(...conventions), (start, end, convention) => {
        const exact = exactDayCountFraction(start, end, convention)
        expect(fractionToNumber(exact)).toBeCloseTo(
          Number(exact.numerator) / Number(exact.denominator),
          10,
        )
      }),
    )
  })
})

describe('business day properties', () => {
  it('lands on an open day and comes back to where it started', () => {
    fc.assert(
      fc.property(date, fc.integer({ min: 1, max: 40 }), calendar, (start, days, market) => {
        const forward = addBusinessDays(start, days, market)
        expect(isBusinessDay(forward, market)).toBe(true)
        const back = addBusinessDays(forward, -days, market)
        // Round-tripping returns the original day whenever it was itself open.
        if (isBusinessDay(start, market)) expect(back).toBe(start)
        else expect(epochDayOf(back)).toBeLessThanOrEqual(epochDayOf(start))
      }),
    )
  })

  it('counts no more business days than calendar days', () => {
    fc.assert(
      fc.property(date, fc.integer({ min: 0, max: 500 }), calendar, (start, days, market) => {
        const end = addDays(start, days)
        const counted = businessDaysBetween(start, end, market)
        expect(counted).toBeGreaterThanOrEqual(0)
        expect(counted).toBeLessThanOrEqual(daysBetween(start, end))
      }),
    )
  })
})

describe('money properties', () => {
  const rounding: readonly Rounding[] = [
    'half-even',
    'half-up',
    'half-down',
    'up',
    'down',
    'ceiling',
    'floor',
  ]

  it('rounds to within one minor unit of the true value', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        fc.constantFrom(...rounding),
        (numerator, denominator, mode) => {
          const value = fraction(numerator, denominator)
          const rounded = roundFraction(value, mode)
          const difference = subtractFractions(value, fraction(rounded, 1n))
          expect(Math.abs(fractionToNumber(difference))).toBeLessThan(1)
        },
      ),
    )
  })

  it('splits a total without creating or destroying a unit', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 9n), max: 10n ** 9n }),
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }),
        (amount, weights) => {
          fc.pre(weights.some((weight) => weight > 0))
          const shares = allocate(amount, weights)
          expect(shares.reduce((sum, share) => sum + share, 0n)).toBe(amount)
          expect(shares).toHaveLength(weights.length)
        },
      ),
    )
  })
})

describe('amortization properties', () => {
  it('always repays exactly the principal and ends at zero', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1_00n, max: 10n ** 10n }),
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 1, max: 240 }),
        fc.constantFrom(12, 4, 2, 1),
        (principal, rateBasisPoints, periods, periodsPerYear) => {
          const loan = amortize({
            kind: 'periodic',
            principal,
            annualRate: fraction(BigInt(rateBasisPoints), 10_000n),
            periods,
            periodsPerYear,
          })
          expect(loan.periods.length).toBeGreaterThan(0)
          // A schedule can end early when a rounded-up instalment repays the
          // balance before the last period, but never runs longer than asked.
          expect(loan.periods.length).toBeLessThanOrEqual(periods)
          expect(loan.periods[loan.periods.length - 1]?.balance).toBe(0n)
          expect(loan.periods.reduce((sum, period) => sum + period.principal, 0n)).toBe(principal)
          expect(loan.totalPaid).toBe(principal + loan.totalInterest)
          expect(loan.periods.every((period) => period.balance >= 0n)).toBe(true)
          // Every payment but the last is exactly the quoted instalment; only
          // the final row carries the difference that rounding left behind.
          const regular = loan.periods.slice(0, -1).map((period) => period.payment)
          expect(new Set(regular).size).toBeLessThanOrEqual(1)
          if (regular.length > 0) expect(regular[0]).toBe(loan.payment)
          expect(loan.periods[loan.periods.length - 1]?.payment).toBeGreaterThan(0n)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('charges interest that matches accruing the balance directly', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 10_000n, max: 10n ** 9n }),
        fc.integer({ min: 1, max: 2000 }),
        (principal, rateBasisPoints) => {
          const rate = fraction(BigInt(rateBasisPoints), 10_000n)
          const loan = amortize({
            kind: 'periodic',
            principal,
            annualRate: rate,
            periods: 12,
            periodsPerYear: 12,
          })
          const first = loan.periods[0]
          if (first === undefined) throw new Error('expected a first period')
          expect(first.interest).toBe(
            roundFraction(
              multiplyFractions(
                fraction(principal, 1n),
                fraction(rate.numerator, rate.denominator * 12n),
              ),
            ),
          )
        },
      ),
    )
  })
})

describe('accrual properties', () => {
  it('scales linearly with the notional', () => {
    fc.assert(
      fc.property(
        date,
        fc.integer({ min: 1, max: 900 }),
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        (start, days, notional) => {
          const period = {
            start,
            end: addDays(start, days),
            convention: 'ACT/365F',
            rate: '5%',
          } as const
          const single = accrueExact({ ...period, notional })
          const double = accrueExact({ ...period, notional: notional * 2n })
          expect(compareFractions(multiplyFractions(single, fraction(2n, 1n)), double)).toBe(0)
        },
      ),
    )
  })
})
