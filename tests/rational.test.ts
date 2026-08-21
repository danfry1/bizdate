import { describe, expect, it } from 'vitest'
import { InvalidArgumentError } from '../src/errors.js'
import {
  add,
  compare,
  divide,
  fraction,
  fromDecimal,
  fromNumber,
  multiply,
  power,
  subtract,
  toFraction,
  toFractionString,
  toNumber,
} from '../src/rational.js'

describe('fractions', () => {
  it('reduces and normalises the sign', () => {
    expect(toFractionString(fraction(6n, 8n))).toBe('3/4')
    expect(toFractionString(fraction(3n, -4n))).toBe('-3/4')
    expect(toFractionString(fraction(0n, -4n))).toBe('0')
  })

  it('adds without the errors a float would accumulate', () => {
    const tenth = fromDecimal('0.1')
    const fifth = fromDecimal('0.2')
    expect(toFractionString(add(tenth, fifth))).toBe('3/10')
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(toNumber(add(tenth, fifth))).toBe(0.3)
  })

  it('does the four operations exactly', () => {
    const third = fraction(1n, 3n)
    expect(toFractionString(subtract(third, fraction(1n, 6n)))).toBe('1/6')
    expect(toFractionString(multiply(third, fraction(3n, 5n)))).toBe('1/5')
    expect(toFractionString(divide(third, fraction(2n, 3n)))).toBe('1/2')
    expect(compare(third, fraction(1n, 2n))).toBe(-1)
  })

  it('raises to an integer power, including negative ones', () => {
    expect(toFractionString(power(fraction(2n, 3n), 3))).toBe('8/27')
    expect(toFractionString(power(fraction(2n, 3n), -2))).toBe('9/4')
    expect(toFractionString(power(fraction(7n, 3n), 0))).toBe('1')
  })

  it('reads a number as the decimal you wrote, not the binary it stored', () => {
    expect(toFractionString(fromNumber(0.05))).toBe('1/20')
    expect(toFractionString(fromNumber(1e-4))).toBe('1/10000')
    expect(toFractionString(fromDecimal('5.25%'))).toBe('21/400')
    expect(toFractionString(fromDecimal('-1.5'))).toBe('-3/2')
    expect(toFractionString(fromDecimal('1e3'))).toBe('1000')
  })

  it('converts to a number accurately even when the parts are enormous', () => {
    const huge = power(fraction(10n, 3n), 400)
    // The numerator overflows a double, so dividing the parts as numbers loses
    // the answer entirely.
    expect(Number(huge.numerator)).toBe(Number.POSITIVE_INFINITY)
    expect(10 ** 400 / 3 ** 400).toBe(Number.POSITIVE_INFINITY)
    // The fixed-point conversion still lands within one ulp of the true value.
    expect(Math.abs(toNumber(huge) / 1.4174185499538581e209 - 1)).toBeLessThan(1e-15)
    expect(toNumber(divide(huge, huge))).toBe(1)
  })

  it('rejects nonsense', () => {
    expect(() => fraction(1n, 0n)).toThrow(InvalidArgumentError)
    expect(() => divide(fraction(1n, 2n), fraction(0n, 1n))).toThrow(InvalidArgumentError)
    expect(() => fromDecimal('one half')).toThrow(InvalidArgumentError)
    expect(() => fromNumber(Number.NaN)).toThrow(InvalidArgumentError)
    expect(() => power(fraction(1n, 2n), 1.5)).toThrow(InvalidArgumentError)
    // @ts-expect-error a boolean is not a rate
    expect(() => toFraction(true)).toThrow(InvalidArgumentError)
  })
})
