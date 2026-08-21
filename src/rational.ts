import { InvalidArgumentError } from './errors.js'

/**
 * An exact rational number: `numerator / denominator`, always fully reduced with
 * a positive denominator.
 *
 * Every quantity this package computes — day count fractions, interest, payment
 * amounts — is carried as a fraction until the moment you ask for a rounded
 * money amount or a `number`. Nothing is accumulated in binary floating point,
 * so the only rounding that happens is the rounding you asked for.
 */
export type Fraction = {
  readonly numerator: bigint
  readonly denominator: bigint
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** Builds a reduced {@link Fraction}. Throws on a zero denominator. */
export function fraction(numerator: bigint, denominator: bigint): Fraction {
  if (denominator === 0n) throw new InvalidArgumentError('fraction', 'denominator must not be zero')
  const sign = denominator < 0n ? -1n : 1n
  const n = numerator * sign
  const d = denominator * sign
  if (n === 0n) return { numerator: 0n, denominator: 1n }
  const g = gcd(n, d)
  return { numerator: n / g, denominator: d / g }
}

/** The fraction `value / 1`. */
export const fractionFromInteger = (value: bigint | number): Fraction =>
  fraction(typeof value === 'bigint' ? value : BigInt(exactInteger(value, 'value')), 1n)

function exactInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value))
    throw new InvalidArgumentError(name, 'must be a safe integer when given as a number')
  return value
}

/** The fraction 0. */
export const ZERO: Fraction = { numerator: 0n, denominator: 1n }
/** The fraction 1. */
export const ONE: Fraction = { numerator: 1n, denominator: 1n }

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/

/**
 * Parses an exact decimal string — `"0.0525"`, `"-1.5"`, `"1e-4"` — into a fraction.
 *
 * A trailing `%` is read as a percentage: `"5.25%"` is 21/400, exactly the same
 * value as `"0.0525"`.
 */
export function fractionFromDecimal(input: string): Fraction {
  const isPercent = input.endsWith('%')
  const body = isPercent ? input.slice(0, -1).trim() : input.trim()
  const match = DECIMAL_PATTERN.exec(body)
  if (match === null)
    throw new InvalidArgumentError(
      'decimal',
      `${JSON.stringify(input)} is not a decimal number (expected digits with an optional sign, point and exponent)`,
    )
  const [, sign, whole, decimals = '', exponent = '0'] = match
  const digits = `${whole ?? '0'}${decimals}`
  const scale = decimals.length - Number(exponent) + (isPercent ? 2 : 0)
  const magnitude = BigInt(digits)
  const numerator = sign === '-' ? -magnitude : magnitude
  return scale >= 0
    ? fraction(numerator, 10n ** BigInt(scale))
    : fraction(numerator * 10n ** BigInt(-scale), 1n)
}

/**
 * Converts a `number` to a fraction via its shortest decimal representation, so
 * `0.05` means exactly 5/100 — what you wrote — and not the binary double
 * 0.05000000000000000277… that JavaScript actually stored.
 */
export function fractionFromNumber(value: number): Fraction {
  if (!Number.isFinite(value))
    throw new InvalidArgumentError('number', 'must be finite (not NaN or Infinity)')
  return fractionFromDecimal(value.toString())
}

/** Adds two fractions exactly. */
export const addFractions = (a: Fraction, b: Fraction): Fraction =>
  fraction(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator)

/** Subtracts `b` from `a` exactly. */
export const subtractFractions = (a: Fraction, b: Fraction): Fraction =>
  fraction(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator)

/** Multiplies two fractions exactly. */
export const multiplyFractions = (a: Fraction, b: Fraction): Fraction =>
  fraction(a.numerator * b.numerator, a.denominator * b.denominator)

/** Divides `a` by `b` exactly. Throws if `b` is zero. */
export function divideFractions(a: Fraction, b: Fraction): Fraction {
  if (b.numerator === 0n) throw new InvalidArgumentError('divisor', 'must not be zero')
  return fraction(a.numerator * b.denominator, a.denominator * b.numerator)
}

/** Negates a fraction. */
export const negateFraction = (a: Fraction): Fraction => ({
  numerator: -a.numerator,
  denominator: a.denominator,
})

/** Orders two fractions: -1 if `a` is smaller, 0 if equal, 1 if larger. */
export function compareFractions(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const left = a.numerator * b.denominator
  const right = b.numerator * a.denominator
  return left < right ? -1 : left > right ? 1 : 0
}

/** Returns `true` if the fraction is exactly zero. */
export const isZeroFraction = (a: Fraction): boolean => a.numerator === 0n

/** Raises a fraction to an integer power, exactly. */
export function raiseFraction(base: Fraction, exponent: number): Fraction {
  if (!Number.isInteger(exponent)) throw new InvalidArgumentError('exponent', 'must be an integer')
  if (exponent === 0) return ONE
  if (exponent < 0) return divideFractions(ONE, raiseFraction(base, -exponent))
  let result = ONE
  let factor = base
  let remaining = exponent
  while (remaining > 0) {
    if (remaining % 2 === 1) result = multiplyFractions(result, factor)
    remaining = Math.floor(remaining / 2)
    if (remaining > 0) factor = multiplyFractions(factor, factor)
  }
  return result
}

/** Position of the highest set bit, without materialising a binary string. */
function bitLength(value: bigint): number {
  if (value === 0n) return 0
  const hex = value.toString(16)
  const leading = Number.parseInt(hex.charAt(0), 16)
  return (hex.length - 1) * 4 + (32 - Math.clz32(leading))
}

/** Multiplies by 2^-exponent in steps, so a huge exponent underflows gradually instead of at once. */
function scaleDown(value: number, exponent: number): number {
  let result = value
  let remaining = exponent
  while (remaining > 1000) {
    result *= 2 ** -1000
    remaining -= 1000
  }
  return result * 2 ** -remaining
}

/** Significant bits kept through the fixed-point division: comfortably more than a double's 53. */
const PRECISION_BITS = 64

/**
 * Converts a fraction to the nearest `number`.
 *
 * The division is done in fixed point, scaled so the quotient keeps 64
 * significant bits whatever the size of the parts. That holds for values far too
 * large for a double to represent — `(10/3)^400` — and equally for values far
 * too small, where a fixed scale would have quantised the answer to zero.
 */
export function fractionToNumber(value: Fraction): number {
  if (value.numerator === 0n) return 0
  const negative = value.numerator < 0n
  const magnitude = negative ? -value.numerator : value.numerator
  const shift = Math.max(0, bitLength(value.denominator) - bitLength(magnitude) + PRECISION_BITS)
  const scaled = (magnitude << BigInt(shift)) / value.denominator
  const result = scaleDown(Number(scaled), shift)
  return negative ? -result : result
}

/** Renders a fraction as `numerator/denominator`, or as a bare integer when the denominator is 1. */
export const fractionToString = (value: Fraction): string =>
  value.denominator === 1n
    ? value.numerator.toString()
    : `${value.numerator.toString()}/${value.denominator.toString()}`

/**
 * A rate, given as a decimal fraction of 1.
 *
 * `0.0525`, `"0.0525"` and `"5.25%"` are the same rate. A bare number or numeric
 * string is always a decimal fraction, never a percentage — 5 is 500%, not 5%.
 * Pass the `%` explicitly when you mean percent.
 */
export type RateInput = number | string | Fraction

/** Normalises any {@link RateInput} to an exact fraction. */
export function toFraction(value: RateInput, argument = 'rate'): Fraction {
  if (typeof value === 'number') return fractionFromNumber(value)
  if (typeof value === 'string') return fractionFromDecimal(value)
  if (
    typeof value === 'object' &&
    typeof value.numerator === 'bigint' &&
    typeof value.denominator === 'bigint'
  )
    return fraction(value.numerator, value.denominator)
  throw new InvalidArgumentError(argument, 'expected a number, decimal string or Fraction')
}
