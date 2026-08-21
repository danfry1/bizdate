import type { HolidayRule, RuleCalendar } from '../calendar.js'

const VALID_FROM = 1971
const VALID_THROUGH = 2100

const newYear = (observed: 'nearest-weekday' | 'sunday-to-monday'): HolidayRule => ({
  kind: 'fixed',
  name: "New Year's Day",
  month: 1,
  day: 1,
  observed,
})

const martinLutherKing = (from: number): HolidayRule => ({
  kind: 'nth-weekday',
  name: 'Martin Luther King Jr. Day',
  month: 1,
  weekday: 1,
  nth: 3,
  from,
})

const washingtonsBirthday: HolidayRule = {
  kind: 'nth-weekday',
  name: "Washington's Birthday",
  month: 2,
  weekday: 1,
  nth: 3,
}

const memorialDay: HolidayRule = {
  kind: 'nth-weekday',
  name: 'Memorial Day',
  month: 5,
  weekday: 1,
  nth: -1,
}

const juneteenth = (
  from: number,
  observed: 'nearest-weekday' | 'sunday-to-monday',
): HolidayRule => ({
  kind: 'fixed',
  name: 'Juneteenth National Independence Day',
  month: 6,
  day: 19,
  observed,
  from,
})

const independenceDay = (observed: 'nearest-weekday' | 'sunday-to-monday'): HolidayRule => ({
  kind: 'fixed',
  name: 'Independence Day',
  month: 7,
  day: 4,
  observed,
})

const laborDay: HolidayRule = {
  kind: 'nth-weekday',
  name: 'Labor Day',
  month: 9,
  weekday: 1,
  nth: 1,
}

const columbusDay: HolidayRule = {
  kind: 'nth-weekday',
  name: 'Columbus Day',
  month: 10,
  weekday: 1,
  nth: 2,
}

/**
 * Veterans Day. The Uniform Monday Holiday Act moved it to the fourth Monday in
 * October for 1971-1977, after which it returned to 11 November.
 */
const veteransDay = (observed: 'nearest-weekday' | 'sunday-to-monday'): readonly HolidayRule[] => [
  { kind: 'nth-weekday', name: 'Veterans Day', month: 10, weekday: 1, nth: 4, through: 1977 },
  { kind: 'fixed', name: 'Veterans Day', month: 11, day: 11, observed, from: 1978 },
]

const thanksgiving: HolidayRule = {
  kind: 'nth-weekday',
  name: 'Thanksgiving Day',
  month: 11,
  weekday: 4,
  nth: 4,
}

const christmas = (observed: 'nearest-weekday' | 'sunday-to-monday'): HolidayRule => ({
  kind: 'fixed',
  name: 'Christmas Day',
  month: 12,
  day: 25,
  observed,
})

const goodFriday: HolidayRule = { kind: 'easter', name: 'Good Friday', offset: -2 }

/**
 * Good Friday as the US bond market observes it: a full close, except that since
 * 1996 the market opens when Good Friday coincides with the employment report,
 * released on the first Friday of the month.
 */
const bondMarketGoodFriday: readonly HolidayRule[] = [
  { kind: 'easter', name: 'Good Friday', offset: -2, through: 1995 },
  { kind: 'easter', name: 'Good Friday', offset: -2, from: 1996, unless: 'in-first-week-of-month' },
]

/**
 * Martin Luther King Jr. Day became a federal holiday under Public Law 98-144,
 * signed in November 1983 and first observed in January 1986. The NYSE did not
 * close for it until 1998.
 */

/**
 * Unscheduled New York Stock Exchange closures since 1971: presidential
 * funerals, the 1977 blackout, Hurricanes Gloria and Sandy, and the four days
 * after the September 11 attacks. Pinned facts, updated in a patch release when
 * a new closure is announced.
 */
const nyseClosures: readonly HolidayRule[] = [
  { kind: 'one-off', name: 'Funeral of Harry S. Truman', date: '1972-12-28' },
  { kind: 'one-off', name: 'Funeral of Lyndon B. Johnson', date: '1973-01-25' },
  { kind: 'one-off', name: 'New York City blackout', date: '1977-07-14' },
  { kind: 'one-off', name: 'Hurricane Gloria', date: '1985-09-27' },
  { kind: 'one-off', name: 'Funeral of Richard Nixon', date: '1994-04-27' },
  { kind: 'one-off', name: 'September 11 attacks', date: '2001-09-11' },
  { kind: 'one-off', name: 'September 11 attacks', date: '2001-09-12' },
  { kind: 'one-off', name: 'September 11 attacks', date: '2001-09-13' },
  { kind: 'one-off', name: 'September 11 attacks', date: '2001-09-14' },
  { kind: 'one-off', name: 'Funeral of Ronald Reagan', date: '2004-06-11' },
  { kind: 'one-off', name: 'Funeral of Gerald Ford', date: '2007-01-02' },
  { kind: 'one-off', name: 'Hurricane Sandy', date: '2012-10-29' },
  { kind: 'one-off', name: 'Hurricane Sandy', date: '2012-10-30' },
  { kind: 'one-off', name: 'Funeral of George H. W. Bush', date: '2018-12-05' },
  { kind: 'one-off', name: 'Funeral of Jimmy Carter', date: '2025-01-09' },
]

/**
 * Presidential election days, on which the exchange closed through 1980.
 */
const nyseElectionDays: readonly HolidayRule[] = [1972, 1976, 1980].map((year) => ({
  kind: 'nth-weekday',
  name: 'Presidential election day',
  month: 11,
  weekday: 2,
  nth: 1,
  from: year,
  through: year,
}))

/**
 * Unscheduled US bond market closures recommended by SIFMA.
 */
const bondMarketClosures: readonly HolidayRule[] = [
  { kind: 'one-off', name: 'Funeral of Ronald Reagan', date: '2004-06-11' },
  { kind: 'one-off', name: 'Hurricane Sandy', date: '2012-10-30' },
  { kind: 'one-off', name: 'Funeral of George H. W. Bush', date: '2018-12-05' },
  { kind: 'one-off', name: 'Funeral of Jimmy Carter', date: '2025-01-09' },
]

/**
 * New York Stock Exchange trading calendar.
 *
 * New Year's Day on a Saturday is not observed — the exchange trades the Friday
 * before. Martin Luther King Jr. Day has been observed since 1998 and
 * Juneteenth since 2022, both later than the federal holidays.
 */
export const nyse: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'nyse',
  name: 'New York Stock Exchange',
  weekend: Object.freeze([6, 7] as const),
  validFrom: VALID_FROM,
  validThrough: VALID_THROUGH,
  rules: Object.freeze([
    newYear('sunday-to-monday'),
    martinLutherKing(1998),
    washingtonsBirthday,
    goodFriday,
    memorialDay,
    juneteenth(2022, 'nearest-weekday'),
    independenceDay('nearest-weekday'),
    laborDay,
    thanksgiving,
    christmas('nearest-weekday'),
    ...nyseElectionDays,
    ...nyseClosures,
  ]),
})

/**
 * US federal holidays, as observed for settlement.
 *
 * Saturday holidays are observed on the preceding Friday and Sunday holidays on
 * the following Monday.
 */
export const unitedStates: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'united-states',
  name: 'United States (settlement)',
  weekend: Object.freeze([6, 7] as const),
  validFrom: VALID_FROM,
  validThrough: VALID_THROUGH,
  rules: Object.freeze([
    newYear('nearest-weekday'),
    martinLutherKing(1986),
    washingtonsBirthday,
    memorialDay,
    juneteenth(2022, 'nearest-weekday'),
    independenceDay('nearest-weekday'),
    laborDay,
    columbusDay,
    ...veteransDay('nearest-weekday'),
    thanksgiving,
    christmas('nearest-weekday'),
  ]),
})

/**
 * SIFMA US bond market calendar: the federal holidays plus Good Friday.
 *
 * Recommended early closes are not modelled — this calendar answers whether the
 * market is open, not what time it shuts.
 */
export const sifma: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'sifma',
  name: 'SIFMA US bond market',
  weekend: Object.freeze([6, 7] as const),
  validFrom: VALID_FROM,
  validThrough: VALID_THROUGH,
  rules: Object.freeze([
    // The bond market opens on the Friday before a Saturday New Year's Day
    // (SIFMA recommends an early close, not a full one).
    newYear('sunday-to-monday'),
    martinLutherKing(1986),
    washingtonsBirthday,
    ...bondMarketGoodFriday,
    memorialDay,
    juneteenth(2022, 'nearest-weekday'),
    independenceDay('nearest-weekday'),
    laborDay,
    columbusDay,
    ...veteransDay('sunday-to-monday'),
    thanksgiving,
    christmas('nearest-weekday'),
    ...bondMarketClosures,
  ]),
})

/**
 * Fedwire funds transfer calendar.
 *
 * Fedwire stays open on the Friday before a Saturday holiday, so only Sunday
 * holidays are observed on the following Monday.
 */
export const fedwire: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'fedwire',
  name: 'Fedwire (US Federal Reserve)',
  weekend: Object.freeze([6, 7] as const),
  validFrom: VALID_FROM,
  validThrough: VALID_THROUGH,
  rules: Object.freeze([
    newYear('sunday-to-monday'),
    martinLutherKing(1986),
    washingtonsBirthday,
    memorialDay,
    juneteenth(2022, 'sunday-to-monday'),
    independenceDay('sunday-to-monday'),
    laborDay,
    columbusDay,
    ...veteransDay('sunday-to-monday'),
    thanksgiving,
    christmas('sunday-to-monday'),
  ]),
})
