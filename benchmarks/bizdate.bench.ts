import { bench, describe } from 'vitest'
import { accrue, amortize } from '../src/accrual.js'
import { addBusinessDays, adjust, isBusinessDay, settlementDate } from '../src/businessday.js'
import { nyse, target } from '../src/calendars/index.js'
import { addMonths, dateFromEpochDay, parseDate } from '../src/civil.js'
import { dayCountFraction, exactDayCountFraction } from '../src/daycount.js'
import { generateSchedule } from '../src/schedule.js'

const dates = Array.from({ length: 1000 }, (_, index) => dateFromEpochDay(20_000 + index * 7))
let cursor = 0
const next = (): string => dates[(cursor += 1) % dates.length] ?? '2026-01-01'

describe('dates', () => {
  bench('parseDate', () => void parseDate(next()))
  bench('addMonths', () => void addMonths(next(), 3))
})

describe('calendars', () => {
  bench('isBusinessDay (NYSE)', () => void isBusinessDay(next(), nyse))
  bench('adjust modified-following (NYSE)', () => void adjust(next(), 'modified-following', nyse))
  bench('addBusinessDays +10 (NYSE)', () => void addBusinessDays(next(), 10, nyse))
  bench('settlementDate T+2 (TARGET)', () =>
    void settlementDate(next(), { days: 2, calendar: target }))
})

describe('day count', () => {
  bench('dayCountFraction ACT/365F', () => void dayCountFraction(next(), '2030-01-01', 'ACT/365F'))
  bench('dayCountFraction ACT/ACT ISDA', () =>
    void dayCountFraction(next(), '2030-01-01', 'ACT/ACT ISDA'))
  bench('exactDayCountFraction 30E/360', () =>
    void exactDayCountFraction(next(), '2030-01-01', '30E/360'))
})

describe('schedules and money', () => {
  bench('generateSchedule 10y quarterly', () =>
    void generateSchedule({
      effective: '2026-01-15',
      termination: '2036-01-15',
      frequency: 'quarterly',
      calendar: nyse,
      convention: 'modified-following',
    }))
  bench('accrue', () =>
    void accrue({
      notional: 1_000_000_00n,
      rate: '5.25%',
      start: '2026-01-31',
      end: '2026-07-31',
      convention: 'ACT/365F',
    }))
  bench('amortize 360-month mortgage', () =>
    void amortize({
      kind: 'periodic',
      principal: 250_000_00n,
      annualRate: '4.99%',
      periodsPerYear: 12,
      periods: 360,
    }))
})
