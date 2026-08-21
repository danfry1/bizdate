import type { HolidayRule, RuleCalendar } from '../calendar.js'

const newYear: HolidayRule = { kind: 'fixed', name: "New Year's Day", month: 1, day: 1 }
const goodFriday: HolidayRule = { kind: 'easter', name: 'Good Friday', offset: -2 }
const easterMonday: HolidayRule = { kind: 'easter', name: 'Easter Monday', offset: 1 }
const labourDay: HolidayRule = { kind: 'fixed', name: 'Labour Day', month: 5, day: 1 }
const christmas: HolidayRule = { kind: 'fixed', name: 'Christmas Day', month: 12, day: 25 }
const christmasHoliday: HolidayRule = {
  kind: 'fixed',
  name: 'Christmas Holiday',
  month: 12,
  day: 26,
}

/** Transitional TARGET closures from the euro's first years. */
const transitionalClosures: readonly HolidayRule[] = [
  { kind: 'one-off', name: 'End of year', date: '1998-12-31' },
  { kind: 'one-off', name: 'End of year', date: '1999-12-31' },
  { kind: 'one-off', name: 'End of year', date: '2001-12-31' },
]

/**
 * TARGET2 / T2 euro payment system calendar.
 *
 * Holidays are never moved when they fall on a weekend: the system is simply
 * closed for the weekend and no substitute weekday is taken. Only New Year's Day
 * and Christmas Day applied in 1999, the system's first year; Good Friday,
 * Easter Monday, Labour Day and 26 December have applied since 2000. The
 * transitional year-end closures of 1998-2001 are pinned dates.
 */
export const target: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'target',
  name: 'TARGET2 (euro payments)',
  weekend: Object.freeze([6, 7] as const),
  validFrom: 1999,
  validThrough: 2100,
  rules: Object.freeze([
    newYear,
    { ...goodFriday, from: 2000 },
    { ...easterMonday, from: 2000 },
    { ...labourDay, from: 2000 },
    christmas,
    { ...christmasHoliday, from: 2000 },
    ...transitionalClosures,
  ]),
})
