import { describe, expect, it } from 'vitest'
import { holidayName, holidays } from '../src/calendar.js'
import { calendars } from '../src/calendars/index.js'

/**
 * The name each calendar gives every holiday, pinned for one year.
 *
 * Dates are checked against QuantLib elsewhere; QuantLib has no names, so these
 * are pinned here instead. A rule renamed, reordered or accidentally shadowed by
 * another shows up as a changed name even when the date it produces is the same.
 */
const NAMED_HOLIDAYS_2026 = {
  nyse: [
    ['2026-01-01', "New Year's Day"],
    ['2026-01-19', 'Martin Luther King Jr. Day'],
    ['2026-02-16', "Washington's Birthday"],
    ['2026-04-03', 'Good Friday'],
    ['2026-05-25', 'Memorial Day'],
    ['2026-06-19', 'Juneteenth National Independence Day'],
    ['2026-07-03', 'Independence Day'],
    ['2026-09-07', 'Labor Day'],
    ['2026-11-26', 'Thanksgiving Day'],
    ['2026-12-25', 'Christmas Day'],
  ],
  sifma: [
    ['2026-01-01', "New Year's Day"],
    ['2026-01-19', 'Martin Luther King Jr. Day'],
    ['2026-02-16', "Washington's Birthday"],
    ['2026-05-25', 'Memorial Day'],
    ['2026-06-19', 'Juneteenth National Independence Day'],
    ['2026-07-03', 'Independence Day'],
    ['2026-09-07', 'Labor Day'],
    ['2026-10-12', 'Columbus Day'],
    ['2026-11-11', 'Veterans Day'],
    ['2026-11-26', 'Thanksgiving Day'],
    ['2026-12-25', 'Christmas Day'],
  ],
  fedwire: [
    ['2026-01-01', "New Year's Day"],
    ['2026-01-19', 'Martin Luther King Jr. Day'],
    ['2026-02-16', "Washington's Birthday"],
    ['2026-05-25', 'Memorial Day'],
    ['2026-06-19', 'Juneteenth National Independence Day'],
    ['2026-09-07', 'Labor Day'],
    ['2026-10-12', 'Columbus Day'],
    ['2026-11-11', 'Veterans Day'],
    ['2026-11-26', 'Thanksgiving Day'],
    ['2026-12-25', 'Christmas Day'],
  ],
  unitedStates: [
    ['2026-01-01', "New Year's Day"],
    ['2026-01-19', 'Martin Luther King Jr. Day'],
    ['2026-02-16', "Washington's Birthday"],
    ['2026-05-25', 'Memorial Day'],
    ['2026-06-19', 'Juneteenth National Independence Day'],
    ['2026-07-03', 'Independence Day'],
    ['2026-09-07', 'Labor Day'],
    ['2026-10-12', 'Columbus Day'],
    ['2026-11-11', 'Veterans Day'],
    ['2026-11-26', 'Thanksgiving Day'],
    ['2026-12-25', 'Christmas Day'],
  ],
  target: [
    ['2026-01-01', "New Year's Day"],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-06', 'Easter Monday'],
    ['2026-05-01', 'Labour Day'],
    ['2026-12-25', 'Christmas Day'],
    ['2026-12-26', 'Christmas Holiday'],
  ],
  lse: [
    ['2026-01-01', "New Year's Day"],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-06', 'Easter Monday'],
    ['2026-05-04', 'Early May Bank Holiday'],
    ['2026-05-25', 'Spring Bank Holiday'],
    ['2026-08-31', 'Summer Bank Holiday'],
    ['2026-12-25', 'Christmas Day'],
    ['2026-12-28', 'Boxing Day'],
  ],
  unitedKingdom: [
    ['2026-01-01', "New Year's Day"],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-06', 'Easter Monday'],
    ['2026-05-04', 'Early May Bank Holiday'],
    ['2026-05-25', 'Spring Bank Holiday'],
    ['2026-08-31', 'Summer Bank Holiday'],
    ['2026-12-25', 'Christmas Day'],
    ['2026-12-28', 'Boxing Day'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>

describe('holiday names', () => {
  for (const [id, expected] of Object.entries(NAMED_HOLIDAYS_2026)) {
    const calendar = calendars[id as keyof typeof calendars]

    it(`${id} names every 2026 holiday`, () => {
      expect(holidays(calendar, 2026).map((holiday) => [holiday.date, holiday.name])).toStrictEqual(
        expected.map((entry) => [...entry]),
      )
    })

    it(`${id} answers holidayName for each of them`, () => {
      for (const [date, name] of expected) expect(holidayName(date, calendar)).toBe(name)
    })
  }

  it('has no name for an ordinary day', () => {
    expect(holidayName('2026-11-27', calendars.nyse)).toBeUndefined()
    expect(holidayName('2026-11-28', calendars.nyse)).toBeUndefined()
  })

  it('reports the first matching member of a joint calendar', () => {
    expect(holidayName('2026-11-26', calendars.nyse)).toBe('Thanksgiving Day')
    expect(holidayName('2026-08-31', calendars.lse)).toBe('Summer Bank Holiday')
  })
})
