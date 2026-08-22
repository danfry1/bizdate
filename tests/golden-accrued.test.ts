import { describe, expect, it } from 'vitest'
import { accruedInterest } from '../src/accrual.js'
import type { BusinessDayConvention } from '../src/businessday.js'
import { calendars } from '../src/calendars/index.js'
import { fractionToNumber } from '../src/rational.js'
import { generateSchedule } from '../src/schedule.js'
import type { Frequency } from '../src/frequency.js'
import fixture from './fixtures/quantlib-accrued.json' with { type: 'json' }

type Fixture = {
  readonly quantlib: string
  readonly cases: readonly {
    readonly effective: string
    readonly termination: string
    readonly frequency: string
    readonly convention: string
    readonly calendar: string
    readonly rate: number
    readonly dayCount: string
    readonly settlement: string
    readonly periodStart: string
    readonly periodEnd: string
    /** Accrued interest per 100 of face, as QuantLib quotes it. */
    readonly accrued: number
  }[]
}

const golden = fixture as Fixture

/**
 * QuantLib's coupon accrual is the end-to-end check on this package: a schedule
 * feeds a coupon lookup, which feeds a day count convention, which feeds the
 * money layer. Getting the same number means every stage agrees, and the period
 * boundaries are compared too — picking the wrong coupon is the mistake this
 * function exists to prevent.
 *
 * The notional is 100 of face in whole minor units, and the comparison is made
 * before rounding, since QuantLib works in doubles and does not round to cents.
 */
describe('accrued interest against QuantLib bonds', () => {
  it('compares against the pinned reference version', () => {
    expect(golden.quantlib).toBe('1.43')
  })

  it(`reproduces ${String(golden.cases.length)} bond accruals`, () => {
    const mismatches: string[] = []
    for (const testCase of golden.cases) {
      const schedule = generateSchedule({
        effective: testCase.effective,
        termination: testCase.termination,
        frequency: testCase.frequency as Frequency,
        calendar: calendars[testCase.calendar as keyof typeof calendars],
        convention: testCase.convention as BusinessDayConvention,
      })
      const accrued = accruedInterest({
        schedule,
        settlement: testCase.settlement,
        notional: 100_00n,
        rate: testCase.rate,
        convention: testCase.dayCount,
        // QuantLib's coupons accrue on the dates its schedule produced, which
        // are already adjusted by the schedule's convention.
        dates: 'adjusted',
      })
      const ours = fractionToNumber(accrued.exact) / 100
      const label = `${testCase.effective}..${testCase.termination} ${testCase.frequency} ${testCase.convention} ${testCase.dayCount} @ ${testCase.settlement}`
      if (
        accrued.period.start !== testCase.periodStart ||
        accrued.period.end !== testCase.periodEnd
      )
        mismatches.push(
          `${label}: period ${accrued.period.start}..${accrued.period.end} vs ${testCase.periodStart}..${testCase.periodEnd}`,
        )
      else if (Math.abs(ours - testCase.accrued) > 1e-12)
        mismatches.push(`${label}: ${String(ours)} vs ${String(testCase.accrued)}`)
    }
    expect(mismatches.slice(0, 5)).toStrictEqual([])
  })
})
