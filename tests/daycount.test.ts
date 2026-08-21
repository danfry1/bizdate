import { describe, expect, it } from 'vitest'
import { nyse, target } from '../src/calendars/index.js'
import {
  DAY_COUNT_CONVENTIONS,
  dayCountDays,
  dayCountFraction,
  exactDayCountFraction,
  normalizeConvention,
} from '../src/daycount.js'
import { InvalidArgumentError } from '../src/errors.js'
import { toFractionString } from '../src/rational.js'

describe('exact day count fractions', () => {
  it('is a ratio of integers, not a float', () => {
    expect(toFractionString(exactDayCountFraction('2026-01-01', '2026-07-01', 'ACT/365F'))).toBe(
      '181/365',
    )
    expect(toFractionString(exactDayCountFraction('2026-01-01', '2026-07-01', 'ACT/360'))).toBe(
      '181/360',
    )
    expect(toFractionString(exactDayCountFraction('2026-01-01', '2026-07-01', '30/360'))).toBe(
      '1/2',
    )
  })

  it('splits ACT/ACT ISDA at the year boundary and keeps both parts exact', () => {
    // 2023 is a common year, 2024 a leap year: 31/365 + 31/366, not a decimal.
    expect(
      toFractionString(exactDayCountFraction('2023-12-01', '2024-02-01', 'ACT/ACT ISDA')),
    ).toBe('22661/133590')
  })

  it('is antisymmetric', () => {
    const forward = exactDayCountFraction('2026-01-01', '2026-07-01', 'ACT/365F')
    const backward = exactDayCountFraction('2026-07-01', '2026-01-01', 'ACT/365F')
    expect(backward.numerator).toBe(-forward.numerator)
    expect(backward.denominator).toBe(forward.denominator)
  })

  it('counts the days each convention actually charges', () => {
    // 30/360 treats January as a 30-day month; the real gap is 28 days.
    expect(dayCountDays('2026-01-31', '2026-02-28', '30/360')).toBe(28)
    expect(dayCountDays('2026-01-31', '2026-02-28', 'ACT/365F')).toBe(28)
    expect(dayCountDays('2026-01-30', '2026-03-31', '30E/360')).toBe(60)
    // NL/365 never counts 29 February.
    expect(dayCountDays('2024-02-28', '2024-03-01', 'NL/365')).toBe(1)
    expect(dayCountDays('2024-02-28', '2024-03-01', 'ACT/365F')).toBe(2)
  })

  it('suppresses the February end-of-month rule at a 30E/360 ISDA termination', () => {
    const withoutTermination = dayCountDays('2026-01-15', '2026-02-28', '30E/360 ISDA')
    const atTermination = dayCountDays('2026-01-15', '2026-02-28', '30E/360 ISDA', {
      terminationDate: '2026-02-28',
    })
    // 28 February is a month end, so it counts as the 30th — unless it is the
    // termination date, when the rule is switched off.
    expect(withoutTermination).toBe(45)
    expect(atTermination).toBe(43)
  })

  it('counts business days for BUS/252', () => {
    expect(dayCountDays('2026-01-01', '2026-02-01', 'BUS/252', { calendar: nyse })).toBe(20)
    expect(dayCountFraction('2026-01-01', '2026-02-01', 'BUS/252', { calendar: nyse })).toBeCloseTo(
      20 / 252,
      15,
    )
  })

  it('treats 1/1 as one whole year, however long the period', () => {
    expect(dayCountFraction('2026-01-01', '2026-01-02', '1/1')).toBe(1)
    expect(dayCountFraction('2026-01-01', '2026-01-01', '1/1')).toBe(1)
  })
})

describe('convention names', () => {
  it.each([
    ['Actual/360', 'ACT/360'],
    ['act/360', 'ACT/360'],
    ['A/360', 'ACT/360'],
    ['ACT/365', 'ACT/365F'],
    ['Actual/365 Fixed', 'ACT/365F'],
    ['Bond Basis', '30/360'],
    ['Eurobond basis', '30E/360'],
    ['German', '30E/360 ISDA'],
    ['ACT/ACT', 'ACT/ACT ISDA'],
    ['ACT/ACT ISMA', 'ACT/ACT ICMA'],
    ['  30E/360   ISDA ', '30E/360 ISDA'],
  ])('resolves %s to %s', (input, expected) => {
    expect(normalizeConvention(input)).toBe(expected)
  })

  it('names every convention it implements', () => {
    expect([...DAY_COUNT_CONVENTIONS].map(normalizeConvention)).toStrictEqual([
      ...DAY_COUNT_CONVENTIONS,
    ])
  })

  it('rejects an unknown convention by name', () => {
    expect(() => normalizeConvention('30/365')).toThrow(InvalidArgumentError)
    expect(() => dayCountFraction('2026-01-01', '2026-02-01', '30/365')).toThrow(
      /unknown day count convention "30\/365"/,
    )
  })
})

describe('conventions that need extra inputs', () => {
  it('asks for a calendar for BUS/252', () => {
    expect(() => dayCountFraction('2026-01-01', '2026-02-01', 'BUS/252')).toThrow(
      /BUS\/252 needs a calendar/,
    )
  })

  it('asks for a frequency for ACT/ACT ICMA', () => {
    expect(() => dayCountFraction('2026-01-01', '2026-02-01', 'ACT/ACT ICMA')).toThrow(
      /ACT\/ACT ICMA needs the frequency/,
    )
  })

  it('accrues within a coupon period under ACT/ACT ICMA', () => {
    // Half of a semi-annual coupon period is exactly a quarter of a year.
    expect(
      toFractionString(
        exactDayCountFraction('2026-01-01', '2026-04-01', 'ACT/ACT ICMA', {
          frequency: 'semi-annual',
          referenceStart: '2026-01-01',
          referenceEnd: '2026-07-01',
        }),
      ),
    ).toBe('45/181')
    expect(
      dayCountFraction('2026-01-01', '2026-07-01', 'ACT/ACT ICMA', {
        frequency: 'semi-annual',
        referenceStart: '2026-01-01',
        referenceEnd: '2026-07-01',
      }),
    ).toBe(0.5)
  })

  it.each(['weekly', 'four-weekly', 'fortnightly', 'daily', 'term'] as const)(
    'refuses ACT/ACT ICMA for a %s coupon, which is not a whole number of months',
    (frequency) => {
      expect(() =>
        dayCountFraction('2026-01-01', '2026-01-08', 'ACT/ACT ICMA', {
          frequency,
          referenceStart: '2026-01-01',
          referenceEnd: '2026-01-08',
        }),
      ).toThrow(/defined for coupon periods of whole months/)
    },
  )

  it('works on a TARGET calendar as readily as a US one', () => {
    // Good Friday and Easter Monday close TARGET in that window.
    expect(dayCountDays('2026-04-01', '2026-04-10', 'BUS/252', { calendar: target })).toBe(5)
  })
})
