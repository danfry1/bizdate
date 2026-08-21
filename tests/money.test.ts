import { describe, expect, it } from 'vitest'
import { InvalidArgumentError } from '../src/errors.js'
import { allocate, type Rounding, roundFraction } from '../src/money.js'
import { fraction } from '../src/rational.js'

describe('roundFraction', () => {
  const half = fraction(5n, 2n) // 2.5
  const negativeHalf = fraction(-5n, 2n)
  const threeHalves = fraction(3n, 2n) // 1.5

  it.each<[Rounding, bigint, bigint, bigint]>([
    ['half-even', 2n, 2n, -2n],
    ['half-up', 3n, 2n, -3n],
    ['half-down', 2n, 1n, -2n],
    ['up', 3n, 2n, -3n],
    ['down', 2n, 1n, -2n],
    ['ceiling', 3n, 2n, -2n],
    ['floor', 2n, 1n, -3n],
  ])('%s rounds 2.5, 1.5 and -2.5', (mode, atTwoAndAHalf, atOneAndAHalf, atMinusTwoAndAHalf) => {
    expect(roundFraction(half, mode)).toBe(atTwoAndAHalf)
    expect(roundFraction(threeHalves, mode)).toBe(atOneAndAHalf)
    expect(roundFraction(negativeHalf, mode)).toBe(atMinusTwoAndAHalf)
  })

  it('defaults to half-even', () => {
    expect(roundFraction(fraction(5n, 2n))).toBe(2n)
    expect(roundFraction(fraction(7n, 2n))).toBe(4n)
  })

  it('returns whole values untouched under every mode', () => {
    expect(roundFraction(fraction(-7n, 1n), 'ceiling')).toBe(-7n)
    expect(roundFraction(fraction(7n, 1n), 'exact')).toBe(7n)
  })

  it('refuses to round when the mode is exact', () => {
    expect(() => roundFraction(fraction(1n, 3n), 'exact')).toThrow(InvalidArgumentError)
  })
})

describe('allocate', () => {
  it('splits a total that does not divide evenly, losing nothing', () => {
    expect(allocate(100n, [1, 1, 1])).toStrictEqual([34n, 33n, 33n])
  })

  it('gives the remainder to the largest fractional shares first', () => {
    expect(allocate(10_00n, [3, 5, 2])).toStrictEqual([300n, 500n, 200n])
    expect(allocate(101n, [50, 50])).toStrictEqual([51n, 50n])
    expect(allocate(5n, [1, 1, 1, 1])).toStrictEqual([2n, 1n, 1n, 1n])
  })

  it('handles negative totals', () => {
    expect(allocate(-100n, [1, 1, 1])).toStrictEqual([-34n, -33n, -33n])
  })

  it('accepts bigint weights and zero weights', () => {
    expect(allocate(100n, [1n, 0n, 1n])).toStrictEqual([50n, 0n, 50n])
  })

  it('rejects impossible weightings', () => {
    expect(() => allocate(100n, [])).toThrow(InvalidArgumentError)
    expect(() => allocate(100n, [0, 0])).toThrow(InvalidArgumentError)
    expect(() => allocate(100n, [1, -1])).toThrow(InvalidArgumentError)
  })
})
