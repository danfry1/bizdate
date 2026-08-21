import type { RuleCalendar } from '../calendar.js'
import { MAX_YEAR, MIN_YEAR } from '../civil.js'

/** Saturdays and Sundays only — no public holidays at all. */
export const weekendsOnly: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'weekends-only',
  name: 'Weekends only',
  weekend: Object.freeze([6, 7] as const),
  rules: Object.freeze([]),
  validFrom: MIN_YEAR,
  validThrough: MAX_YEAR,
})

/** Every day is a business day: no weekend, no holidays. */
export const everyDay: RuleCalendar = Object.freeze({
  kind: 'rules',
  id: 'every-day',
  name: 'Every day',
  weekend: Object.freeze([]),
  rules: Object.freeze([]),
  validFrom: MIN_YEAR,
  validThrough: MAX_YEAR,
})
