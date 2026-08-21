/**
 * A small end-to-end example: build a loan's payment schedule on real market
 * dates, then amortize it.
 *
 * Run with: bun examples/loan.ts
 */
import { amortize, generateSchedule, holidays, nyse } from '../src/index.js'

const schedule = generateSchedule({
  effective: '2026-01-31',
  termination: '2029-01-31',
  frequency: 'quarterly',
  calendar: nyse,
  convention: 'modified-following',
  endOfMonth: true,
  paymentLag: 2,
})

const loan = amortize({
  kind: 'dated',
  schedule,
  convention: 'ACT/365F',
  principal: 500_000_00n,
  annualRate: '6.25%',
})

const money = (minorUnits: bigint): string =>
  (Number(minorUnits) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })

console.log('period   accrues            pays         interest    principal      balance')
for (const period of loan.periods)
  console.log(
    String(period.index + 1).padStart(6),
    `${period.start ?? ''}..${period.end ?? ''}`,
    (period.paymentDate ?? '').padStart(12),
    money(period.interest).padStart(11),
    money(period.principal).padStart(12),
    money(period.balance).padStart(12),
  )

console.log('\ntotal interest', money(loan.totalInterest))
console.log('total paid    ', money(loan.totalPaid))
console.log('\nNYSE holidays in 2026:', holidays(nyse, 2026).length)
