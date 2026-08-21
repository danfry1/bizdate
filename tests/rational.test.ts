import { describe, expect, it } from 'vitest'
import { InvalidArgumentError } from '../src/errors.js'
import {
  addFractions,
  compareFractions,
  divideFractions,
  fraction,
  fractionFromDecimal,
  fractionFromNumber,
  multiplyFractions,
  raiseFraction,
  subtractFractions,
  toFraction,
  fractionToString,
  fractionToNumber,
} from '../src/rational.js'

describe('fractions', () => {
  it('reduces and normalises the sign', () => {
    expect(fractionToString(fraction(6n, 8n))).toBe('3/4')
    expect(fractionToString(fraction(3n, -4n))).toBe('-3/4')
    expect(fractionToString(fraction(0n, -4n))).toBe('0')
  })

  it('adds without the errors a float would accumulate', () => {
    const tenth = fractionFromDecimal('0.1')
    const fifth = fractionFromDecimal('0.2')
    expect(fractionToString(addFractions(tenth, fifth))).toBe('3/10')
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(fractionToNumber(addFractions(tenth, fifth))).toBe(0.3)
  })

  it('does the four operations exactly', () => {
    const third = fraction(1n, 3n)
    expect(fractionToString(subtractFractions(third, fraction(1n, 6n)))).toBe('1/6')
    expect(fractionToString(multiplyFractions(third, fraction(3n, 5n)))).toBe('1/5')
    expect(fractionToString(divideFractions(third, fraction(2n, 3n)))).toBe('1/2')
    expect(compareFractions(third, fraction(1n, 2n))).toBe(-1)
  })

  it('raises to an integer power, including negative ones', () => {
    expect(fractionToString(raiseFraction(fraction(2n, 3n), 3))).toBe('8/27')
    expect(fractionToString(raiseFraction(fraction(2n, 3n), -2))).toBe('9/4')
    expect(fractionToString(raiseFraction(fraction(7n, 3n), 0))).toBe('1')
  })

  it('reads a number as the decimal you wrote, not the binary it stored', () => {
    expect(fractionToString(fractionFromNumber(0.05))).toBe('1/20')
    expect(fractionToString(fractionFromNumber(1e-4))).toBe('1/10000')
    expect(fractionToString(fractionFromDecimal('5.25%'))).toBe('21/400')
    expect(fractionToString(fractionFromDecimal('-1.5'))).toBe('-3/2')
    expect(fractionToString(fractionFromDecimal('1e3'))).toBe('1000')
  })

  it('converts to a number accurately even when the parts are enormous', () => {
    const huge = raiseFraction(fraction(10n, 3n), 400)
    // The numerator overflows a double, so dividing the parts as numbers loses
    // the answer entirely.
    expect(Number(huge.numerator)).toBe(Number.POSITIVE_INFINITY)
    expect(10 ** 400 / 3 ** 400).toBe(Number.POSITIVE_INFINITY)
    // The fixed-point conversion still lands within one ulp of the true value.
    expect(Math.abs(fractionToNumber(huge) / 1.4174185499538581e209 - 1)).toBeLessThan(1e-15)
    expect(fractionToNumber(divideFractions(huge, huge))).toBe(1)
  })

  it.each(['1e-15', '1e-18', '1e-20', '1e-300', '1e-320', '1e300', '0.1', '-2.5'])(
    'converts %s to the double that decimal names',
    (decimal) => {
      expect(fractionToNumber(fractionFromDecimal(decimal))).toBe(Number(decimal))
    },
  )

  it('keeps its precision for values far below one', () => {
    // A fixed scaling factor quantises small fractions to zero; the scale has to
    // follow the size of the value.
    expect(fractionToNumber(fraction(1n, 10n ** 40n))).toBe(1e-40)
    expect(fractionToNumber(fraction(3n, 7n * 10n ** 30n))).toBeCloseTo(3 / (7 * 1e30), 45)
    expect(fractionToNumber(fraction(-1n, 10n ** 25n))).toBe(-1e-25)
  })

  it('rejects nonsense', () => {
    expect(() => fraction(1n, 0n)).toThrow(InvalidArgumentError)
    expect(() => divideFractions(fraction(1n, 2n), fraction(0n, 1n))).toThrow(InvalidArgumentError)
    expect(() => fractionFromDecimal('one half')).toThrow(InvalidArgumentError)
    expect(() => fractionFromNumber(Number.NaN)).toThrow(InvalidArgumentError)
    expect(() => raiseFraction(fraction(1n, 2n), 1.5)).toThrow(InvalidArgumentError)
    // @ts-expect-error a boolean is not a rate
    expect(() => toFraction(true)).toThrow(InvalidArgumentError)
  })
})
