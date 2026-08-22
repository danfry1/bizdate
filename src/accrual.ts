import { addMonths, type DateInput, epochDayOf, type IsoDate, toIsoDate } from './civil.js'
import {
  type DayCountConventionInput,
  dayCountDays,
  dayCountFraction,
  type DayCountOptions,
  exactDayCountFraction,
} from './daycount.js'
import { InvalidArgumentError } from './errors.js'
import { frequencyStep } from './frequency.js'
import { type Rounding, roundFraction, roundRatio } from './money.js'
import {
  addFractions,
  divideFractions,
  type Fraction,
  fractionFromInteger,
  multiplyFractions,
  ONE,
  raiseFraction,
  type RateInput,
  subtractFractions,
  toFraction,
  ZERO,
} from './rational.js'
import type { Schedule, SchedulePeriod } from './schedule.js'

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
  return multiplyFractions(multiplyFractions(fractionFromInteger(options.notional), rate), fraction)
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

/**
 * The period of a schedule that contains `date`, or `undefined` if it falls
 * outside.
 *
 * Periods are half-open: a date on a period's end belongs to the period that
 * starts there, which is what makes accrued interest zero on a coupon date.
 *
 * `dates` chooses which boundaries to compare against. Adjusted dates are when
 * the market is actually open; unadjusted dates are what the contract says. Bond
 * accrual is conventionally measured on the schedule as written, so a schedule
 * built `unadjusted` and a lookup on `'unadjusted'` agree with the term sheet.
 */
export function periodContaining(
  schedule: Schedule,
  date: DateInput,
  options?: { readonly dates?: 'adjusted' | 'unadjusted' },
): SchedulePeriod | undefined {
  const useUnadjusted = options?.dates === 'unadjusted'
  const day = epochDayOf(date)
  return schedule.periods.find((period) => {
    const start = epochDayOf(useUnadjusted ? period.unadjustedStart : period.start)
    const end = epochDayOf(useUnadjusted ? period.unadjustedEnd : period.end)
    return start <= day && day < end
  })
}

/** What to accrue on a schedule, and up to when. */
export type AccruedInterestOptions = {
  /** The instrument's coupon or payment schedule. */
  readonly schedule: Schedule
  /** The date interest is measured up to, usually a settlement date. */
  readonly settlement: DateInput
  /** The principal, in whole minor units. */
  readonly notional: bigint
  /** The annual rate as a decimal fraction of 1: `0.035`, `"0.035"` or `"3.5%"`. */
  readonly rate: RateInput
  readonly convention: DayCountConventionInput
  /**
   * Which dates interest accrues on — the choice that decides the number, so it
   * has to be made rather than defaulted.
   *
   * A bond's term sheet describes unadjusted coupon dates and moves only the
   * payment when a date is closed; a swap generally accrues on the adjusted
   * dates it actually pays on. Picking the wrong one shifts the accrual by a day
   * or two and still looks plausible.
   */
  readonly dates: 'adjusted' | 'unadjusted'
  /** Defaults to `half-even`. */
  readonly rounding?: Rounding
  /**
   * Extra day count inputs. The frequency and the reference period come from the
   * schedule, so `ACT/ACT ICMA` needs nothing here.
   */
  readonly dayCount?: Omit<DayCountOptions, 'frequency' | 'referenceStart' | 'referenceEnd'>
}

/** Interest accrued so far in a period, with the working shown. */
export type AccruedInterest = {
  /** Accrued interest in whole minor units. */
  readonly amount: bigint
  /** The same amount before rounding. */
  readonly exact: Fraction
  /** The period the settlement date falls in. */
  readonly period: SchedulePeriod
  /** Start of accrual: the period's start, on the dates you chose. */
  readonly from: string
  /** Days counted by the convention, which is not always calendar days. */
  readonly days: number
  /** The day count fraction of a year those days represent. */
  readonly fraction: number
}

/**
 * Interest accrued on an instrument up to a settlement date.
 *
 * This is the calculation behind a bond's dirty price, and the one place where
 * every part of this package meets: the schedule says which coupon period the
 * settlement falls in, the convention says how much of a year has passed, and
 * the money layer rounds it once. `ACT/ACT ICMA` gets its frequency and
 * reference period from the schedule, which is what it needs and what is easiest
 * to get wrong by hand.
 *
 * Accrued interest is zero on a coupon date — the coupon is paid, and the next
 * period starts — and zero at maturity.
 */
export function accruedInterest(options: AccruedInterestOptions): AccruedInterest {
  const periods = options.schedule.periods
  const last = periods[periods.length - 1]
  if (last === undefined)
    throw new InvalidArgumentError('schedule', 'has no periods to accrue over')
  const first = periods[0] ?? last
  const useUnadjusted = options.dates === 'unadjusted'
  const settlement = toIsoDate(options.settlement)
  const period = periodContaining(options.schedule, settlement, { dates: options.dates })

  if (period === undefined) {
    const maturity = useUnadjusted ? last.unadjustedEnd : last.end
    // Maturity is the one date outside every half-open period with a meaningful
    // answer: the final coupon has just been paid, so nothing accrues.
    if (epochDayOf(settlement) === epochDayOf(maturity))
      return Object.freeze({
        amount: 0n,
        exact: ZERO,
        period: last,
        from: maturity,
        days: 0,
        fraction: 0,
      })
    throw new InvalidArgumentError(
      'settlement',
      `${settlement} is outside the schedule, which runs from ${
        useUnadjusted ? first.unadjustedStart : first.start
      } to ${maturity}`,
    )
  }

  const from = useUnadjusted ? period.unadjustedStart : period.start
  const to = useUnadjusted ? period.unadjustedEnd : period.end
  const reference = referencePeriod(options.schedule, period, from, to)
  const dayCount: DayCountOptions = {
    ...options.dayCount,
    frequency: options.schedule.frequency,
    referenceStart: reference.start,
    referenceEnd: reference.end,
  }
  const exact = accrueExact({
    notional: options.notional,
    rate: options.rate,
    start: from,
    end: settlement,
    convention: options.convention,
    dayCount,
  })
  return Object.freeze({
    amount: roundFraction(exact, options.rounding ?? 'half-even'),
    exact,
    period,
    from,
    days: dayCountDays(from, settlement, options.convention, dayCount),
    fraction: dayCountFraction(from, settlement, options.convention, dayCount),
  })
}

/**
 * The reference period an `ACT/ACT ICMA` accrual is measured against.
 *
 * For a regular coupon it is the coupon itself. For a stub it is the *notional*
 * period the coupon would have covered had it been regular — ICMA rule 251 —
 * measured back from the end of a short first coupon or forward from the start
 * of a short last one. Using the stub's own dates instead inflates or deflates
 * the accrual by the ratio of the stub to a full period, which is the mistake
 * that makes a hand-written version of this function wrong.
 */
function referencePeriod(
  schedule: Schedule,
  period: SchedulePeriod,
  from: IsoDate,
  to: IsoDate,
): { readonly start: IsoDate; readonly end: IsoDate } {
  if (!period.isStub) return { start: from, end: to }
  const step = frequencyStep(schedule.frequency)
  if (step.unit !== 'months') return { start: from, end: to }
  const isFirst = period.index === 0
  return isFirst
    ? { start: addMonths(to, -step.count), end: to }
    : { start: from, end: addMonths(from, step.count) }
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
  /**
   * Allows the final payment to be larger than the regular one.
   *
   * A level-payment loan is supposed to be repaid by its instalments, so a
   * `payment` you supply that is too small to do that is refused. Set this when
   * the balloon is the product — a five-year loan amortised on a thirty-year
   * instalment, say — and the final row will settle whatever is left.
   */
  readonly balloon?: boolean
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
    const rate = divideFractions(annual, fractionFromInteger(options.periodsPerYear))
    return Array.from({ length: options.periods }, () => rate)
  }
  if (options.schedule.periods.length === 0)
    throw new InvalidArgumentError('schedule', 'must have at least one period')
  return options.schedule.periods.map((period) =>
    multiplyFractions(
      annual,
      exactDayCountFraction(period.start, period.end, options.convention, options.dayCount ?? {}),
    ),
  )
}

/**
 * The level payment for periods whose rates differ, as an unreduced ratio.
 *
 * When each period charges its own rate — which is what real dates produce, a
 * 92-day quarter costing more than an 89-day one — the constant-rate annuity
 * formula does not apply. The payment is the one that discounts to the
 * principal across the actual periods: `P = sum of pmt / prod(1 + i_j)`, solved
 * exactly. Writing each `1 + i_j` as `a_j / b_j` turns the sum into integer
 * arithmetic with a single common denominator.
 */
function variableLevelPaymentRatio(
  principal: bigint,
  rates: readonly Fraction[],
): { readonly numerator: bigint; readonly denominator: bigint } {
  const growthNumerators: bigint[] = []
  const growthDenominators: bigint[] = []
  let numeratorProduct = 1n
  let denominatorProduct = 1n
  for (const rate of rates) {
    numeratorProduct *= rate.denominator + rate.numerator
    denominatorProduct *= rate.denominator
    growthNumerators.push(numeratorProduct)
    growthDenominators.push(denominatorProduct)
  }
  const total = numeratorProduct
  let discountSum = 0n
  for (let index = 0; index < rates.length; index += 1) {
    const prefixNumerator = growthNumerators[index] ?? 1n
    const prefixDenominator = growthDenominators[index] ?? 1n
    // total / prefixNumerator is exact: the prefix divides the whole product.
    discountSum += prefixDenominator * (total / prefixNumerator)
  }
  if (discountSum === 0n)
    throw new InvalidArgumentError('annualRate', 'produces a payment that cannot be computed')
  return { numerator: principal * total, denominator: discountSum }
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
  const balance = fractionFromInteger(principal)
  if (rate.numerator === 0n) return divideFractions(balance, fractionFromInteger(periods))
  const growth = raiseFraction(addFractions(ONE, rate), periods)
  return divideFractions(
    multiplyFractions(multiplyFractions(balance, rate), growth),
    subtractFractions(growth, ONE),
  )
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
 * happen for a very small loan over very many periods.
 *
 * Every payment but the last is exactly the quoted instalment, and the schedule
 * ends when the balance does — a rounded-up instalment can repay a small loan
 * before its final period. The last row carries whatever rounding left behind, which is usually a few minor units;
 * where an instalment barely exceeds the interest — a long schedule at a high
 * rate — each period's rounding compounds into the next, and the last row can
 * differ from the rest by materially more. That is inherent to repaying a loan
 * in whole minor units, not a defect: the balance still reaches exactly zero and
 * the rows still sum exactly to the principal.
 *
 * An instalment you supply yourself is never adjusted, and is checked: if it
 * leaves more outstanding at maturity than a regular payment, that is an error
 * unless you asked for a balloon.
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

  const uniformRate = rates.every(
    (rate) =>
      rate.numerator === (rates[0]?.numerator ?? 0n) &&
      rate.denominator === (rates[0]?.denominator ?? 1n),
  )
  const computedPayment =
    method === 'level-payment'
      ? roundPaymentRatio(
          uniformRate
            ? levelPaymentRatio(options.principal, rates[0] ?? ZERO, count)
            : variableLevelPaymentRatio(options.principal, rates),
          options.paymentRounding ?? 'ceiling',
        )
      : 0n

  // The largest interest charge any period can produce, since the balance never
  // exceeds the principal. An instalment above it repays the loan whatever the
  // rounding did.
  const interestCeiling = rates.reduce((largest, rate) => {
    const interest = roundFraction(
      multiplyFractions(fractionFromInteger(options.principal), rate),
      rounding,
    )
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
    const interest = roundFraction(multiplyFractions(fractionFromInteger(balance), rate), rounding)
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
    // A loan repaid early has no further payments to make. Rounding an
    // instalment up can settle a small balance before the last period, and
    // empty rows would misdescribe the schedule.
    if (balance === 0n) break
  }

  const finalPayment = periods[periods.length - 1]?.payment ?? 0n
  // Only an instalment supplied by the caller is checked. A computed one is the
  // exact annuity for these periods, and its final row differs from the regular
  // payment only by the rounding that accumulated along the way.
  if (
    method === 'level-payment' &&
    options.payment !== undefined &&
    options.balloon !== true &&
    finalPayment > levelPayment
  )
    throw new InvalidArgumentError(
      'payment',
      `a payment of ${levelPayment.toString()} leaves ${finalPayment.toString()} outstanding at the end, so the loan is not repaid by its instalments. Raise the payment, add periods, or pass balloon: true if the final lump sum is intended.`,
    )

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
