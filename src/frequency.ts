import { InvalidArgumentError } from './errors.js'

/** How often a payment or coupon falls due. */
export type Frequency =
  | 'annual'
  | 'semi-annual'
  | 'quarterly'
  | 'bi-monthly'
  | 'monthly'
  | 'four-weekly'
  | 'fortnightly'
  | 'weekly'
  | 'daily'
  | 'term'

/** Number of periods per year for each frequency. `term` is a single period, so it has none. */
export const PERIODS_PER_YEAR = {
  annual: 1,
  'semi-annual': 2,
  quarterly: 4,
  'bi-monthly': 6,
  monthly: 12,
  'four-weekly': 13,
  fortnightly: 26,
  weekly: 52,
  daily: 365,
  term: 0,
} as const satisfies Record<Frequency, number>

/** The step between periods: whole months, or whole days for the sub-monthly frequencies. */
export type FrequencyStep =
  | { readonly unit: 'months'; readonly count: number }
  | { readonly unit: 'days'; readonly count: number }
  | { readonly unit: 'term' }

const STEPS = {
  annual: { unit: 'months', count: 12 },
  'semi-annual': { unit: 'months', count: 6 },
  quarterly: { unit: 'months', count: 3 },
  'bi-monthly': { unit: 'months', count: 2 },
  monthly: { unit: 'months', count: 1 },
  'four-weekly': { unit: 'days', count: 28 },
  fortnightly: { unit: 'days', count: 14 },
  weekly: { unit: 'days', count: 7 },
  daily: { unit: 'days', count: 1 },
  term: { unit: 'term' },
} as const satisfies Record<Frequency, FrequencyStep>

/** The date step for a frequency. */
export function frequencyStep(frequency: Frequency): FrequencyStep {
  const step = STEPS[frequency]
  if (step === undefined)
    throw new InvalidArgumentError('frequency', `unknown frequency ${JSON.stringify(frequency)}`)
  return step
}

/** Periods per year, rejecting `term`, which has no fixed length. */
export function periodsPerYear(frequency: Frequency): number {
  const periods = PERIODS_PER_YEAR[frequency]
  if (periods === 0)
    throw new InvalidArgumentError(
      'frequency',
      '"term" has no periods per year; name a real frequency',
    )
  return periods
}
