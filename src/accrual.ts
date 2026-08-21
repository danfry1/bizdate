import type { DateInput } from './civil.js'
import {
  type DayCountConventionInput,
  type DayCountOptions,
  exactDayCountFraction,
} from './daycount.js'
import { InvalidArgumentError } from './errors.js'
import { type Rounding, roundFraction, roundRatio } from './money.js'
import {
  add,
  divide,
  type Fraction,
  fromInteger,
  multiply,
  ONE,
  power,
  type RateInput,
  subtract,
  toFraction,
  ZERO,
} from './rational.js'
import type { Schedule } from './schedule.js'

/** What to accrue: a notional, a rate, a period, and the convention that measures it. */
export type AccrualOptions = {
  /** The principal, in whole minor units: cents, pence, satoshi. */
  readonly notional: bigint
  /** The annual rate as a decimal fraction of 1: `0.0525`, `"0.0525"` or `"5.25%"`. */
  readonly rate: RateInput
  readonly start: DateInput
  readonly end: DateInput
  readonly convention: DayCountConventionInput
  /** Defaults to `half-even`. */
  readonly rounding?: Rounding
  /** Extra inputs for conventions that need them (ICMA reference period, BUS/252 calendar). */
  readonly dayCount?: DayCountOptions
}

/**
 * Interest accrued over a period, exactly: notional x rate x day count fraction,
 * with nothing rounded.
 *
 * Use this when the result feeds into more arithmetic. {@link accrue} is the
 * same calculation rounded to money.
 */
export function accrueExact(options: AccrualOptions): Fraction {
  if (typeof options.notional !== 'bigint')
    throw new InvalidArgumentError('notional', 'must be a bigint of minor units, e.g. 1_000_00n')
  const rate = toFraction(options.rate)
  const fraction = exactDayCountFraction(
    options.start,
    options.end,
    options.convention,
    options.dayCount ?? {},
  )
  return multiply(multiply(fromInteger(options.notional), rate), fraction)
}

/**
 * Interest accrued over a period, in whole minor units.
 *
 * The notional, the rate and the day count fraction are multiplied exactly; the
 * single rounding happens at the end, under the policy you chose. Nothing
 * accumulates float error along the way.
 */
export function accrue(options: AccrualOptions): bigint {
  return roundFraction(accrueExact(options), options.rounding ?? 'half-even')
}

/** How principal is repaid across the schedule. */
export type AmortizationMethod =
  /** Equal total payments; the interest share shrinks as the balance falls. A mortgage. */
  | 'level-payment'
  /** Equal principal each period; the payment shrinks over time. */
  | 'level-principal'
  /** Interest only, with the whole principal repaid at maturity. */
  | 'interest-only'

/** One row of an amortization schedule, in whole minor units. */
export type AmortizationPeriod = {
  readonly index: number
  /** Total paid this period: interest plus principal. */
  readonly payment: bigint
  readonly interest: bigint
  readonly principal: bigint
  /** Principal still outstanding after this payment. Zero on the last row. */
  readonly balance: bigint
  /** Set for a dated schedule: the period this row covers. */
  readonly start?: string
  readonly end?: string
  readonly paymentDate?: string
}

/** A complete amortization, guaranteed to repay the principal exactly. */
export type Amortization = {
  readonly periods: readonly AmortizationPeriod[]
  /** The level payment, for `level-payment` schedules. */
  readonly payment: bigint
  readonly totalInterest: bigint
  readonly totalPaid: bigint
}

type CommonAmortizationOptions = {
  /** Amount borrowed, in whole minor units. */
  readonly principal: bigint
  /** Annual nominal rate as a decimal fraction of 1. */
  readonly annualRate: RateInput
  readonly method?: AmortizationMethod
  /** Rounding for each period's interest. Defaults to `half-even`. */
  readonly rounding?: Rounding
  /**
   * Rounding for the computed level payment. Defaults to `ceiling`, which is
   * what lenders do: rounding the instalment up guarantees the balance falls
   * every period, and the final payment absorbs the difference.
   */
  readonly paymentRounding?: Rounding
  /** Overrides the computed level payment — for a lender who quotes a rounded instalment. */
  readonly payment?: bigint
}

/** How to amortize: either by counting periods, or by walking a real schedule of dates. */
export type AmortizationOptions = CommonAmortizationOptions &
  (
    | {
        /** Equal periods: the classic instalment loan, where each period charges rate / periodsPerYear. */
        readonly kind: 'periodic'
        readonly periodsPerYear: number
        readonly periods: number
      }
    | {
        /** Real dates: interest for each period comes from its day count fraction. */
        readonly kind: 'dated'
        readonly schedule: Schedule
        readonly convention: DayCountConventionInput
        readonly dayCount?: DayCountOptions
      }
  )

function periodRates(options: AmortizationOptions): readonly Fraction[] {
  const annual = toFraction(options.annualRate, 'annualRate')
  if (options.kind === 'periodic') {
    if (!Number.isInteger(options.periods) || options.periods < 1)
      throw new InvalidArgumentError('periods', 'must be a positive integer')
    if (!Number.isInteger(options.periodsPerYear) || options.periodsPerYear < 1)
      throw new InvalidArgumentError('periodsPerYear', 'must be a positive integer')
    const rate = divide(annual, fromInteger(options.periodsPerYear))
    return Array.from({ length: options.periods }, () => rate)
  }
  if (options.schedule.periods.length === 0)
    throw new InvalidArgumentError('schedule', 'must have at least one period')
  return options.schedule.periods.map((period) =>
    multiply(
      annual,
      exactDayCountFraction(period.start, period.end, options.convention, options.dayCount ?? {}),
    ),
  )
}

/**
 * The level payment as an unreduced ratio, for callers that are about to round
 * it. `P x i x g / (g - 1)` with `g = (1 + i)^n` expands to
 * `P x a x gn / (b x (gn - gd))` for a rate `a / b`, which needs no
 * greatest-common-divisor search at all.
 */
function levelPaymentRatio(
  principal: bigint,
  rate: Fraction,
  periods: number,
): { readonly numerator: bigint; readonly denominator: bigint } {
  if (rate.numerator === 0n) return { numerator: principal, denominator: BigInt(periods) }
  const scale = BigInt(periods)
  const grown = (rate.denominator + rate.numerator) ** scale
  const base = rate.denominator ** scale
  return {
    numerator: principal * rate.numerator * grown,
    denominator: rate.denominator * (grown - base),
  }
}

/**
 * The exact level payment for a loan: `P x i x (1+i)^n / ((1+i)^n - 1)`.
 *
 * Computed in exact rational arithmetic — `(1+i)^n` for a 360-month mortgage is
 * a ratio of thousand-digit integers, and it is carried exactly rather than
 * accumulated through 360 floating-point multiplications.
 */
export function exactLevelPayment(
  principal: bigint,
  periodRate: RateInput,
  periods: number,
): Fraction {
  if (!Number.isInteger(periods) || periods < 1)
    throw new InvalidArgumentError('periods', 'must be a positive integer')
  const rate = toFraction(periodRate, 'periodRate')
  const balance = fromInteger(principal)
  if (rate.numerator === 0n) return divide(balance, fromInteger(periods))
  const growth = power(add(ONE, rate), periods)
  return divide(multiply(multiply(balance, rate), growth), subtract(growth, ONE))
}

/**
 * Builds an amortization schedule that repays the principal exactly.
 *
 * Interest for each period is computed from the outstanding balance in exact
 * arithmetic and rounded once; principal is the remainder of the payment. The
 * final period absorbs whatever rounding left behind, so the balance reaches
 * exactly zero and the rows sum exactly to what was borrowed — the property
 * that makes a schedule auditable.
 *
 * A computed instalment is raised to the smallest amount that repays the loan
 * if rounding would otherwise leave it unable to cover the interest, which can
 * happen for a very small loan over very many periods. An instalment you supply
 * yourself is never adjusted: if it cannot repay the loan, that is an error.
 */
export function amortize(options: AmortizationOptions): Amortization {
  if (typeof options.principal !== 'bigint')
    throw new InvalidArgumentError('principal', 'must be a bigint of minor units, e.g. 250_000_00n')
  if (options.principal <= 0n) throw new InvalidArgumentError('principal', 'must be positive')
  const rounding = options.rounding ?? 'half-even'
  const method = options.method ?? 'level-payment'
  const rates = periodRates(options)
  const count = rates.length
  const dates = options.kind === 'dated' ? options.schedule.periods : undefined

  const computedPayment =
    method === 'level-payment'
      ? roundPaymentRatio(
          levelPaymentRatio(
            options.principal,
            options.kind === 'periodic'
              ? divide(
                  toFraction(options.annualRate, 'annualRate'),
                  fromInteger(options.periodsPerYear),
                )
              : averageRate(rates),
            count,
          ),
          options.paymentRounding ?? 'ceiling',
        )
      : 0n

  // The largest interest charge any period can produce, since the balance never
  // exceeds the principal. An instalment above it repays the loan whatever the
  // rounding did.
  const interestCeiling = rates.reduce((largest, rate) => {
    const interest = roundFraction(multiply(fromInteger(options.principal), rate), rounding)
    return interest > largest ? interest : largest
  }, 0n)

  const levelPayment =
    options.payment ??
    (method === 'level-payment' && computedPayment <= interestCeiling
      ? interestCeiling + 1n
      : computedPayment)

  const levelPrincipal = method === 'level-principal' ? options.principal / BigInt(count) : 0n

  const periods: AmortizationPeriod[] = []
  let balance = options.principal
  let totalInterest = 0n
  let totalPaid = 0n

  for (let index = 0; index < count; index += 1) {
    const rate = rates[index] ?? ZERO
    const interest = roundFraction(multiply(fromInteger(balance), rate), rounding)
    const isLast = index === count - 1
    let principalPart: bigint
    switch (method) {
      case 'level-payment':
        principalPart = isLast ? balance : levelPayment - interest
        break
      case 'level-principal':
        principalPart = isLast ? balance : levelPrincipal
        break
      case 'interest-only':
        principalPart = isLast ? balance : 0n
        break
    }
    if (principalPart <= 0n && !isLast && method !== 'interest-only')
      throw new InvalidArgumentError(
        'payment',
        `a payment of ${levelPayment.toString()} does not cover the interest of ${interest.toString()} in period ${String(index + 1)}, so the balance would never fall. The loan cannot amortize over ${String(count)} periods at this rate and rounding.`,
      )
    if (principalPart > balance) principalPart = balance
    balance -= principalPart
    const payment = principalPart + interest
    totalInterest += interest
    totalPaid += payment
    const dated = dates?.[index]
    periods.push({
      index,
      payment,
      interest,
      principal: principalPart,
      balance,
      ...(dated === undefined
        ? {}
        : { start: dated.start, end: dated.end, paymentDate: dated.paymentDate }),
    })
  }

  return Object.freeze({
    periods: Object.freeze(periods),
    payment: levelPayment,
    totalInterest,
    totalPaid,
  })
}

const roundPaymentRatio = (
  ratio: { readonly numerator: bigint; readonly denominator: bigint },
  mode: Rounding,
): bigint => roundRatio(ratio.numerator, ratio.denominator, mode)

/** Mean period rate across a dated schedule, used to size the level payment. */
function averageRate(rates: readonly Fraction[]): Fraction {
  const total = rates.reduce((sum, rate) => add(sum, rate), ZERO)
  return divide(total, fromInteger(rates.length))
}
