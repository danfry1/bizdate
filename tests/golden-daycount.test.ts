import { describe, expect, it } from 'vitest'
import { calendars } from '../src/calendars/index.js'
import { type DayCountConvention, dayCountDays, dayCountFraction } from '../src/daycount.js'
import type { Frequency } from '../src/frequency.js'
import bus252Fixture from './fixtures/quantlib-bus252.json' with { type: 'json' }
import dayCountFixture from './fixtures/quantlib-daycount.json' with { type: 'json' }
import icmaFixture from './fixtures/quantlib-icma.json' with { type: 'json' }

type DayCountFixture = {
  readonly cases: readonly {
    readonly start: string
    readonly end: string
    readonly results: Record<string, { readonly days: number; readonly fraction: number }>
  }[]
}

type IcmaFixture = {
  readonly cases: readonly {
    readonly start: string
    readonly end: string
    readonly referenceStart: string
    readonly referenceEnd: string
    readonly frequency: string
    readonly fraction: number
  }[]
}

const dayCounts = dayCountFixture as DayCountFixture
const bus252 = bus252Fixture as DayCountFixture
const icma = icmaFixture as IcmaFixture

/** QuantLib accumulates in binary doubles; agreement to a part in 1e-13 is agreement. */
const RELATIVE_TOLERANCE = 1e-13

const closeEnough = (ours: number, theirs: number): boolean =>
  ours === theirs || Math.abs(ours - theirs) <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(theirs))

describe('day count conventions against QuantLib', () => {
  const conventions = Object.keys(dayCounts.cases[0]?.results ?? {}) as DayCountConvention[]

  for (const convention of conventions) {
    it(`${convention}: ${String(dayCounts.cases.length)} date pairs`, () => {
      const dayMismatches: string[] = []
      const fractionMismatches: string[] = []
      for (const testCase of dayCounts.cases) {
        const expected = testCase.results[convention]
        if (expected === undefined) continue
        const days = dayCountDays(testCase.start, testCase.end, convention)
        if (days !== expected.days)
          dayMismatches.push(
            `${testCase.start}..${testCase.end}: ${String(days)} vs ${String(expected.days)}`,
          )
        const fraction = dayCountFraction(testCase.start, testCase.end, convention)
        if (!closeEnough(fraction, expected.fraction))
          fractionMismatches.push(
            `${testCase.start}..${testCase.end}: ${String(fraction)} vs ${String(expected.fraction)}`,
          )
      }
      expect(dayMismatches.slice(0, 5)).toStrictEqual([])
      expect(fractionMismatches.slice(0, 5)).toStrictEqual([])
    })
  }
})

describe('BUS/252 against QuantLib', () => {
  it('counts business days on the NYSE and TARGET calendars', () => {
    const mismatches: string[] = []
    for (const testCase of bus252.cases)
      for (const [id, expected] of Object.entries(testCase.results)) {
        const calendar = calendars[id as keyof typeof calendars]
        const options = { calendar }
        const days = dayCountDays(testCase.start, testCase.end, 'BUS/252', options)
        const fraction = dayCountFraction(testCase.start, testCase.end, 'BUS/252', options)
        if (days !== expected.days || !closeEnough(fraction, expected.fraction))
          mismatches.push(
            `${id} ${testCase.start}..${testCase.end}: ${String(days)}/${String(fraction)} vs ${String(expected.days)}/${String(expected.fraction)}`,
          )
      }
    expect(mismatches.slice(0, 5)).toStrictEqual([])
  })
})

describe('ACT/ACT ICMA against QuantLib', () => {
  it.each(icma.cases)(
    'accrues $start..$end in the $frequency period $referenceStart..$referenceEnd',
    (testCase) => {
      const fraction = dayCountFraction(testCase.start, testCase.end, 'ACT/ACT ICMA', {
        frequency: testCase.frequency as Frequency,
        referenceStart: testCase.referenceStart,
        referenceEnd: testCase.referenceEnd,
      })
      expect(closeEnough(fraction, testCase.fraction)).toBe(true)
    },
  )
})
