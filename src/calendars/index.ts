import type { RuleCalendar } from '../calendar.js'
import { everyDay, weekendsOnly } from './basic.js'
import { target } from './europe.js'
import { lse, unitedKingdom } from './uk.js'
import { fedwire, nyse, sifma, unitedStates } from './us.js'

export { everyDay, weekendsOnly } from './basic.js'
export { target } from './europe.js'
export { lse, unitedKingdom } from './uk.js'
export { fedwire, nyse, sifma, unitedStates } from './us.js'

/** Every calendar this package ships, by id. */
export const calendars = Object.freeze({
  nyse,
  sifma,
  fedwire,
  unitedStates,
  target,
  lse,
  unitedKingdom,
  weekendsOnly,
  everyDay,
}) satisfies Record<string, RuleCalendar>
