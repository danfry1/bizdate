import { InvalidArgumentError } from './errors.js'
import { type Fraction, fractionFromInteger, toFraction } from './rational.js'

const greatestCommonDivisor = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const remainder = x % y
    x = y
    y = remainder
  }
  return x
}

const lowestCommonMultiple = (a: bigint, b: bigint): bigint => (a / greatestCommonDivisor(a, b)) * b

/**
 * How an exact amount is turned into whole minor units.
 *
 * - `half-even` — ties go to the even unit. The default, and what accounting
 *   standards mean by "banker's rounding": it does not drift upwards over many
 *   roundings the way `half-up` does.
 * - `half-up` — ties go away from zero. What most people mean by "round".
 * - `half-down` — ties go towards zero.
 * - `up` / `down` — always away from / towards zero.
 * - `ceiling` / `floor` — always towards positive / negative infinity.
 * - `exact` — refuses to round: throws if the value is not already whole.
 */
export type Rounding =
  | 'half-even'
  | 'half-up'
  | 'half-down'
  | 'up'
  | 'down'
  | 'ceiling'
  | 'floor'
  | 'exact'

/**
 * Rounds an exact fraction to whole minor units — cents, pence, satoshi.
 *
 * The fraction is the only place the true value lives, so this is the single
 * point where precision is lost, deliberately and by a policy you chose.
 */
export function roundFraction(value: Fraction, mode: Rounding = 'half-even'): bigint {
  return roundRatio(value.numerator, value.denominator, mode)
}

/**
 * Rounds a ratio that has not been reduced to lowest terms.
 *
 * Reducing a fraction costs a greatest-common-divisor search, which is the
 * expensive part of arithmetic on the thousand-digit numbers an amortization
 * formula produces. Rounding needs only a division, so the internal callers
 * that are about to round anyway skip the reduction entirely.
 */
export function roundRatio(
  numerator: bigint,
  denominator: bigint,
  mode: Rounding = 'half-even',
): bigint {
  if (denominator === 0n) throw new InvalidArgumentError('denominator', 'must not be zero')
  const flip = denominator < 0n
  const value = {
    numerator: flip ? -numerator : numerator,
    denominator: flip ? -denominator : denominator,
  }
  const negative = value.numerator < 0n
  const magnitude = negative ? -value.numerator : value.numerator
  const whole = magnitude / value.denominator
  const remainder = magnitude % value.denominator
  if (remainder === 0n) return negative ? -whole : whole

  const twice = remainder * 2n
  let rounded: bigint
  switch (mode) {
    case 'exact':
      throw new InvalidArgumentError(
        'value',
        `${value.numerator.toString()}/${value.denominator.toString()} is not a whole number of minor units and rounding is "exact"`,
      )
    case 'down':
      rounded = whole
      break
    case 'up':
      rounded = whole + 1n
      break
    case 'floor':
      rounded = negative ? whole + 1n : whole
      break
    case 'ceiling':
      rounded = negative ? whole : whole + 1n
      break
    case 'half-up':
      rounded = twice >= value.denominator ? whole + 1n : whole
      break
    case 'half-down':
      rounded = twice > value.denominator ? whole + 1n : whole
      break
    case 'half-even':
      rounded =
        twice > value.denominator || (twice === value.denominator && whole % 2n === 1n)
          ? whole + 1n
          : whole
      break
  }
  return negative ? -rounded : rounded
}

/**
 * Splits an amount into whole minor units in the given proportions, with the
 * split guaranteed to add back up to the amount.
 *
 * Remainders go to the largest fractional parts first — the largest-remainder
 * method — so splitting 100 three ways gives 34, 33, 33 rather than losing a
 * penny. Use it for fee splits, tax apportionment, and any place a total must
 * survive being divided.
 */
export function allocate(amount: bigint, weights: readonly (number | bigint)[]): readonly bigint[] {
  if (weights.length === 0) throw new InvalidArgumentError('weights', 'must not be empty')
  // Fractional weights are taken exactly: a weight of 1e-9 earns no whole unit
  // but is not quantised away either, and 1/3 keeps every digit it was written
  // with.
  const exact = weights.map((weight, index) => {
    const value =
      typeof weight === 'bigint'
        ? fractionFromInteger(weight)
        : toFraction(weight, `weights[${String(index)}]`)
    if (value.numerator < 0n)
      throw new InvalidArgumentError(`weights[${String(index)}]`, 'must not be negative')
    return value
  })
  const commonDenominator = exact.reduce(
    (denominator, weight) => lowestCommonMultiple(denominator, weight.denominator),
    1n,
  )
  const asBigints = exact.map(
    (weight) => weight.numerator * (commonDenominator / weight.denominator),
  )
  const total = asBigints.reduce((sum, weight) => sum + weight, 0n)
  if (total === 0n) throw new InvalidArgumentError('weights', 'must not all be zero')

  const shares = asBigints.map((weight) => (amount * weight) / total)
  let allocated = shares.reduce((sum, share) => sum + share, 0n)
  const remainders = asBigints
    .map((weight, index) => ({ index, remainder: (amount * weight) % total }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1,
    )

  const step = amount < 0n ? -1n : 1n
  let cursor = 0
  while (allocated !== amount) {
    const target = remainders[cursor % remainders.length]
    if (target === undefined) break
    shares[target.index] = (shares[target.index] ?? 0n) + step
    allocated += step
    cursor += 1
  }
  return Object.freeze(shares)
}
