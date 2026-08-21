import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  adjust,
  type BusinessDayConvention,
  businessDaysBetween,
  isBusinessDay,
} from '../src/businessday.js'
import { calendars } from '../src/calendars/index.js'
import { addDays } from '../src/civil.js'
import fixture from './fixtures/quantlib-adjust.json' with { type: 'json' }

type Fixture = {
  readonly quantlib: string
  readonly cases: readonly {
    readonly calendar: string
    readonly date: string
    readonly isBusinessDay: boolean
    readonly adjusted: Record<string, string>
    readonly advance: Record<string, string>
    readonly businessDaysToPlus30: number
  }[]
}

const golden = fixture as Fixture

describe('business day handling against QuantLib', () => {
  it('compares against the pinned reference version', () => {
    expect(golden.quantlib).toBe('1.43')
  })

  const byCalendar = new Map<string, Fixture['cases'][number][]>()
  for (const testCase of golden.cases) {
    const existing = byCalendar.get(testCase.calendar)
    if (existing === undefined) byCalendar.set(testCase.calendar, [testCase])
    else existing.push(testCase)
  }

  for (const [id, cases] of byCalendar) {
    const calendar = calendars[id as keyof typeof calendars]

    it(`${id}: open or shut on ${String(cases.length)} dates`, () => {
      const mismatches = cases
        .filter((testCase) => isBusinessDay(testCase.date, calendar) !== testCase.isBusinessDay)
        .map((testCase) => testCase.date)
      expect(mismatches).toStrictEqual([])
    })

    it(`${id}: every adjustment convention`, () => {
      const mismatches: string[] = []
      for (const testCase of cases)
        for (const [convention, expected] of Object.entries(testCase.adjusted)) {
          const ours = adjust(testCase.date, convention as BusinessDayConvention, calendar)
          if (ours !== expected)
            mismatches.push(`${testCase.date} ${convention}: ${ours} vs ${expected}`)
        }
      expect(mismatches.slice(0, 5)).toStrictEqual([])
    })

    it(`${id}: advancing by business days`, () => {
      const mismatches: string[] = []
      for (const testCase of cases)
        for (const [offset, expected] of Object.entries(testCase.advance)) {
          // QuantLib treats an advance of zero as "adjust following"; this
          // package leaves the date alone, so the zero case is checked against
          // `adjust` instead of `addBusinessDays`.
          const ours =
            offset === '0'
              ? adjust(testCase.date, 'following', calendar)
              : addBusinessDays(testCase.date, Number(offset), calendar)
          if (ours !== expected)
            mismatches.push(`${testCase.date} +${offset}: ${ours} vs ${expected}`)
        }
      expect(mismatches.slice(0, 5)).toStrictEqual([])
    })

    it(`${id}: counting business days over the next 30 days`, () => {
      const mismatches: string[] = []
      for (const testCase of cases) {
        const ours = businessDaysBetween(testCase.date, addDays(testCase.date, 30), calendar)
        if (ours !== testCase.businessDaysToPlus30)
          mismatches.push(
            `${testCase.date}: ${String(ours)} vs ${String(testCase.businessDaysToPlus30)}`,
          )
      }
      expect(mismatches.slice(0, 5)).toStrictEqual([])
    })
  }
})
