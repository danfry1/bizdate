import { describe, expect, it } from 'vitest'
import { holidays } from '../src/calendar.js'
import { calendars } from '../src/calendars/index.js'
import { dayOfWeek } from '../src/civil.js'
import fixture from './fixtures/quantlib-holidays.json' with { type: 'json' }

type Fixture = {
  readonly quantlib: string
  readonly calendars: Record<string, readonly string[]>
}

const golden = fixture as Fixture
const LAST_YEAR = 2100

/**
 * Places where this package deliberately disagrees with QuantLib, each because
 * QuantLib does not match the published record. Anything not listed here must
 * match exactly, so an unintended divergence still fails the test.
 */
const KNOWN_DIVERGENCES: Record<
  string,
  {
    readonly weLack: readonly string[]
    readonly weAdd: readonly string[]
    readonly because: string
  }
> = {
  sifma: {
    // Public Law 98-144 created the holiday in November 1983 but set its first
    // observance for January 1986; QuantLib starts it in 1983.
    weLack: ['1983-01-17', '1984-01-16', '1985-01-21'],
    // SIFMA recommended a full close for the national day of mourning.
    weAdd: ['2025-01-09'],
    because: 'MLK Day was first observed in 1986; SIFMA closed for the Carter funeral',
  },
  fedwire: {
    weLack: ['1983-01-17', '1984-01-16', '1985-01-21'],
    weAdd: [],
    because: 'MLK Day was first observed in 1986',
  },
  unitedStates: {
    weLack: ['1983-01-17', '1984-01-16', '1985-01-21'],
    weAdd: [],
    because: 'MLK Day was first observed in 1986',
  },
}

describe('holiday calendars against QuantLib', () => {
  for (const [id, expected] of Object.entries(golden.calendars)) {
    it(`${id}: every holiday through ${String(LAST_YEAR)}`, () => {
      const calendar = calendars[id as keyof typeof calendars]
      const ours: string[] = []
      for (let year = calendar.validFrom; year <= LAST_YEAR; year += 1)
        for (const holiday of holidays(calendar, year))
          // QuantLib's holiday list omits holidays that fall on a weekend; this
          // package reports them, so they are filtered out for the comparison.
          if (dayOfWeek(holiday.date) < 6) ours.push(holiday.date)

      const divergence = KNOWN_DIVERGENCES[id]
      const theirs = expected
        .filter((date) => Number(date.slice(0, 4)) >= calendar.validFrom)
        .filter((date) => !(divergence?.weLack ?? []).includes(date))
        .concat(divergence?.weAdd ?? [])
        .sort()
      expect(ours).toStrictEqual(theirs)
    })
  }
})
