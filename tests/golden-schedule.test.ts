import { describe, expect, it } from 'vitest'
import type { BusinessDayConvention } from '../src/businessday.js'
import { calendars } from '../src/calendars/index.js'
import type { Frequency } from '../src/frequency.js'
import { generateSchedule, type RollDirection, scheduleDates } from '../src/schedule.js'
import fixture from './fixtures/quantlib-schedule.json' with { type: 'json' }

type Fixture = {
  readonly cases: readonly {
    readonly effective: string
    readonly termination: string
    readonly frequency: string
    readonly roll: string
    readonly endOfMonth: boolean
    readonly convention: string
    readonly calendar: string
    readonly firstRegularDate?: string | null
    readonly lastRegularDate?: string | null
    readonly dates: readonly string[]
  }[]
}

const golden = fixture as Fixture

describe('schedule generation against QuantLib', () => {
  it(`reproduces ${String(golden.cases.length)} schedules date for date`, () => {
    const mismatches: string[] = []
    for (const testCase of golden.cases) {
      const schedule = generateSchedule({
        effective: testCase.effective,
        termination: testCase.termination,
        frequency: testCase.frequency as Frequency,
        roll: testCase.roll as RollDirection,
        endOfMonth: testCase.endOfMonth,
        convention: testCase.convention as BusinessDayConvention,
        calendar: calendars[testCase.calendar as keyof typeof calendars],
        ...(testCase.firstRegularDate == null
          ? {}
          : { firstRegularDate: testCase.firstRegularDate }),
        ...(testCase.lastRegularDate == null ? {} : { lastRegularDate: testCase.lastRegularDate }),
      })
      const ours = scheduleDates(schedule)
      if (ours.join(' ') !== testCase.dates.join(' '))
        mismatches.push(
          [
            `${testCase.effective}..${testCase.termination} ${testCase.frequency} ${testCase.roll}`,
            `eom=${String(testCase.endOfMonth)} ${testCase.convention} ${testCase.calendar}`,
            `\n  ours:   ${ours.join(' ')}`,
            `\n  quantlib: ${testCase.dates.join(' ')}`,
          ].join(' '),
        )
    }
    expect(mismatches.slice(0, 3)).toStrictEqual([])
  })
})
