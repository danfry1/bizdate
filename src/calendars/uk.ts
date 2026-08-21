import type { HolidayRule, RuleCalendar } from '../calendar.js'

const VALID_THROUGH = 2100

const newYear: HolidayRule = {
  kind: 'fixed',
  name: "New Year's Day",
  month: 1,
  day: 1,
  observed: 'next-weekday',
}
const goodFriday: HolidayRule = { kind: 'easter', name: 'Good Friday', offset: -2 }
const easterMonday: HolidayRule = { kind: 'easter', name: 'Easter Monday', offset: 1 }
const earlyMay: HolidayRule = {
  kind: 'nth-weekday',
  name: 'Early May Bank Holiday',
  month: 5,
  weekday: 1,
  nth: 1,
}
const springBank: HolidayRule = {
  kind: 'nth-weekday',
  name: 'Spring Bank Holiday',
  month: 5,
  weekday: 1,
  nth: -1,
}
const summerBank: HolidayRule = {
  kind: 'nth-weekday',
  name: 'Summer Bank Holiday',
  month: 8,
  weekday: 1,
  nth: -1,
}
const christmas: HolidayRule = {
  kind: 'fixed',
  name: 'Christmas Day',
  month: 12,
  day: 25,
  observed: 'next-weekday',
}
const boxingDay: HolidayRule = {
  kind: 'fixed',
  name: 'Boxing Day',
  month: 12,
  day: 26,
  observed: 'next-weekday',
}

/**
 * Bank holidays that replaced or supplemented the usual rules: royal occasions,
 * the millennium, and the 2020 move of the Early May holiday to VE Day.
 *
 * Where a one-off replaced a regular holiday, the regular rule carries a
 * matching `through`/`from` year so the day is not counted twice.
 */
const oneOffs: readonly HolidayRule[] = [
  { kind: 'one-off', name: 'Early May Bank Holiday (VE Day)', date: '1995-05-08' },
  { kind: 'one-off', name: 'Millennium Eve', date: '1999-12-31' },
  { kind: 'one-off', name: 'Golden Jubilee', date: '2002-06-03' },
  { kind: 'one-off', name: 'Golden Jubilee', date: '2002-06-04' },
  { kind: 'one-off', name: 'Royal Wedding', date: '2011-04-29' },
  { kind: 'one-off', name: 'Diamond Jubilee', date: '2012-06-04' },
  { kind: 'one-off', name: 'Diamond Jubilee', date: '2012-06-05' },
  { kind: 'one-off', name: 'Early May Bank Holiday (VE Day)', date: '2020-05-08' },
  { kind: 'one-off', name: 'Platinum Jubilee', date: '2022-06-02' },
  { kind: 'one-off', name: 'Platinum Jubilee', date: '2022-06-03' },
  { kind: 'one-off', name: 'State Funeral of Queen Elizabeth II', date: '2022-09-19' },
  { kind: 'one-off', name: 'Coronation of King Charles III', date: '2023-05-08' },
]

const regularRules: readonly HolidayRule[] = [
  newYear,
  goodFriday,
  easterMonday,
  { ...earlyMay, through: 1994 },
  { ...earlyMay, from: 1996, through: 2019 },
  { ...earlyMay, from: 2021 },
  { ...springBank, through: 2001 },
  { ...springBank, from: 2003, through: 2011 },
  { ...springBank, from: 2013, through: 2021 },
  { ...springBank, from: 2023 },
  summerBank,
  christmas,
  boxingDay,
]

/** England and Wales bank holidays, as used for settlement. */
export const unitedKingdom: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'united-kingdom',
  name: 'United Kingdom (settlement)',
  weekend: Object.freeze([6, 7] as const),
  validFrom: 1971,
  validThrough: VALID_THROUGH,
  rules: Object.freeze([...regularRules, ...oneOffs]),
})

/**
 * London Stock Exchange trading calendar.
 *
 * The same bank holidays as the settlement calendar; the exchange has no extra
 * scheduled closures.
 */
export const lse: RuleCalendar = Object.freeze({
  ...unitedKingdom,
  id: 'lse',
  name: 'London Stock Exchange',
})
