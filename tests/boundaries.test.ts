import { describe, expect, it } from 'vitest'
import {
  accrue,
  accruedInterest,
  amortize,
  exactLevelPayment,
  periodContaining,
} from '../src/accrual.js'
import {
  addBusinessDays,
  businessDaysBetween,
  nonBusinessDaysBetween,
  settlementDate,
} from '../src/businessday.js'
import { customCalendar, holidays, isWeekend, jointCalendar } from '../src/calendar.js'
import { nyse, target } from '../src/calendars/index.js'
import { addYears, dateFromEpochDay, isAfter, isBefore, isSameDate } from '../src/civil.js'
import { dayCountDays, dayCountFraction, exactDayCountFraction } from '../src/daycount.js'
import { InvalidArgumentError, InvalidDateError, isBizDateError } from '../src/errors.js'
import { allocate, roundFraction } from '../src/money.js'
import {
  compareFractions,
  fraction,
  fractionFromDecimal,
  fractionToNumber,
  fractionToString,
  isZeroFraction,
  toFraction,
} from '../src/rational.js'
import { generateSchedule, scheduleDates } from '../src/schedule.js'

/**
 * Boundaries and guard clauses, written after a mutation-testing run showed
 * which behaviours the suite asserted only from one side.
 *
 * Every case here is one where changing a comparison, a guard or a direction
 * would previously have left the tests green.
 */

describe('ordering is exact at the boundary', () => {
  it.each([
    ['2026-01-01', '2026-01-02', true, false, false],
    ['2026-01-02', '2026-01-01', false, true, false],
    ['2026-01-01', '2026-01-01', false, false, true],
  ])('compares %s to %s', (a, b, before, after, same) => {
    expect(isBefore(a, b)).toBe(before)
    expect(isAfter(a, b)).toBe(after)
    expect(isSameDate(a, b)).toBe(same)
  })

  it('rejects fractional steps rather than truncating them', () => {
    expect(() => addYears('2026-01-01', 1.5)).toThrow(InvalidDateError)
    expect(() => addBusinessDays('2026-01-01', 1.5, nyse)).toThrow(InvalidArgumentError)
    expect(() => settlementDate('2026-01-01', { days: 1.5, calendar: nyse })).toThrow(
      InvalidArgumentError,
    )
  })
})

describe('business day counting in both directions', () => {
  it('is symmetric around a reversed range', () => {
    expect(businessDaysBetween('2026-11-23', '2026-11-27', nyse)).toBe(3)
    expect(businessDaysBetween('2026-11-27', '2026-11-23', nyse)).toBe(-3)
  })

  it('handles a range of one day under every inclusion setting', () => {
    // A business day.
    expect(businessDaysBetween('2026-11-23', '2026-11-23', nyse)).toBe(0)
    expect(businessDaysBetween('2026-11-23', '2026-11-23', nyse, { includeTo: true })).toBe(1)
    expect(
      businessDaysBetween('2026-11-23', '2026-11-23', nyse, {
        includeFrom: false,
        includeTo: true,
      }),
    ).toBe(0)
    // A holiday: including both ends still counts nothing.
    expect(businessDaysBetween('2026-11-26', '2026-11-26', nyse, { includeTo: true })).toBe(0)
  })

  it('excludes each end on request', () => {
    expect(businessDaysBetween('2026-11-23', '2026-11-27', nyse, { includeFrom: false })).toBe(2)
    expect(
      businessDaysBetween('2026-11-23', '2026-11-27', nyse, {
        includeFrom: false,
        includeTo: true,
      }),
    ).toBe(3)
  })

  it('lists nothing when a range holds no closed days', () => {
    expect(nonBusinessDaysBetween('2026-11-23', '2026-11-25', nyse)).toStrictEqual([])
    expect(nonBusinessDaysBetween('2026-11-26', '2026-11-26', nyse)).toStrictEqual(['2026-11-26'])
  })
})

describe('joint calendars combine both kinds of closure', () => {
  const gulf = customCalendar({ id: 'gulf', weekend: [5, 6], validFrom: 2020, validThrough: 2030 })
  const both = jointCalendar(nyse, gulf)

  it('is closed when either member has a weekend', () => {
    expect(isWeekend('2026-01-02', both)).toBe(true) // Friday: gulf weekend
    expect(isWeekend('2026-01-03', both)).toBe(true) // Saturday: both
    expect(isWeekend('2026-01-04', both)).toBe(true) // Sunday: NYSE weekend
    expect(isWeekend('2026-01-05', both)).toBe(false) // Monday: neither
  })

  it('merges holidays from every member', () => {
    const withHoliday = jointCalendar(
      nyse,
      customCalendar({ id: 'extra', dates: ['2026-03-17'], validFrom: 2020, validThrough: 2030 }),
    )
    const merged = holidays(withHoliday, 2026).map((holiday) => holiday.date)
    expect(merged).toContain('2026-03-17')
    expect(merged).toContain('2026-11-26')
  })
})

describe('day count edges', () => {
  it('is zero for an empty period and negative when reversed', () => {
    const options = {
      frequency: 'semi-annual',
      referenceStart: '2026-01-01',
      referenceEnd: '2026-07-01',
    } as const
    expect(dayCountFraction('2026-03-01', '2026-03-01', 'ACT/ACT ICMA', options)).toBe(0)
    expect(dayCountFraction('2026-04-01', '2026-03-01', 'ACT/ACT ICMA', options)).toBeLessThan(0)
    expect(dayCountFraction('2026-03-01', '2026-03-01', 'ACT/ACT ISDA')).toBe(0)
    expect(dayCountDays('2026-03-01', '2026-03-01', '30/360')).toBe(0)
    expect(dayCountDays('2026-04-01', '2026-03-01', '30/360')).toBe(-30)
    expect(dayCountDays('2026-03-01', '2026-03-01', '1/1')).toBe(0)
  })

  it('applies ACT/ACT ISDA within a year and across one', () => {
    expect(
      fractionToString(exactDayCountFraction('2026-01-01', '2026-07-01', 'ACT/ACT ISDA')),
    ).toBe('181/365')
    expect(
      fractionToString(exactDayCountFraction('2024-01-01', '2024-07-01', 'ACT/ACT ISDA')),
    ).toBe('91/183')
    // A whole year plus 31 days of 2026 over 365 and 31 of 2028 over 366.
    expect(
      fractionToString(exactDayCountFraction('2026-12-01', '2028-02-01', 'ACT/ACT ISDA')),
    ).toBe('156251/133590')
  })

  it('only suppresses the 30E/360 ISDA February rule at the termination date itself', () => {
    const end = '2026-02-28'
    expect(dayCountDays('2026-01-15', end, '30E/360 ISDA', { terminationDate: end })).toBe(43)
    // Same day and month, different year: not the termination date.
    expect(dayCountDays('2026-01-15', end, '30E/360 ISDA', { terminationDate: '2027-02-28' })).toBe(
      45,
    )
    // Same year and day, different month.
    expect(dayCountDays('2026-01-15', end, '30E/360 ISDA', { terminationDate: '2026-03-28' })).toBe(
      45,
    )
    // Same year and month, different day.
    expect(dayCountDays('2026-01-15', end, '30E/360 ISDA', { terminationDate: '2026-02-27' })).toBe(
      45,
    )
  })
})

describe('schedule boundaries', () => {
  it('has no stub when the effective date lands on the grid', () => {
    const onGrid = generateSchedule({
      effective: '2026-01-15',
      termination: '2027-01-15',
      frequency: 'quarterly',
    })
    expect(onGrid.periods.map((period) => period.isStub)).toStrictEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it('has no stub when a forward roll lands exactly on termination', () => {
    const forward = generateSchedule({
      effective: '2026-01-15',
      termination: '2027-01-15',
      frequency: 'quarterly',
      roll: 'forward',
    })
    expect(forward.periods.map((period) => period.isStub)).toStrictEqual([
      false,
      false,
      false,
      false,
    ])
    expect(scheduleDates(forward).at(-1)).toBe('2027-01-15')
  })

  it('marks both ends when both are irregular', () => {
    const both = generateSchedule({
      effective: '2026-01-05',
      termination: '2027-02-20',
      frequency: 'semi-annual',
      firstRegularDate: '2026-07-15',
      lastRegularDate: '2027-01-15',
    })
    expect(both.periods.map((period) => period.isStub)).toStrictEqual([true, false, true])
  })

  it('treats a single-period schedule as regular', () => {
    const term = generateSchedule({
      effective: '2026-01-15',
      termination: '2031-01-15',
      frequency: 'term',
    })
    expect(term.periods.map((period) => period.isStub)).toStrictEqual([false])
  })
})

describe('exact arithmetic edges', () => {
  it('orders fractions including equality', () => {
    expect(compareFractions(fraction(1n, 3n), fraction(2n, 6n))).toBe(0)
    expect(compareFractions(fraction(1n, 3n), fraction(1n, 2n))).toBe(-1)
    expect(compareFractions(fraction(1n, 2n), fraction(1n, 3n))).toBe(1)
    expect(compareFractions(fraction(-1n, 3n), fraction(1n, 3n))).toBe(-1)
  })

  it('parses decimals with surrounding space, signs and exponents', () => {
    expect(fractionToString(fractionFromDecimal('  0.5  '))).toBe('1/2')
    expect(fractionToString(fractionFromDecimal('  2.5%  '))).toBe('1/40')
    expect(fractionToString(fractionFromDecimal('+0.25'))).toBe('1/4')
    expect(fractionToString(fractionFromDecimal('2e-2'))).toBe('1/50')
    expect(fractionToString(fractionFromDecimal('2e2'))).toBe('200')
  })

  it('splits by weights whose denominators do not share a factor', () => {
    // Needs a real lowest common multiple: thirds and sevenths.
    expect(allocate(100n, [1 / 3, 1 / 7])).toStrictEqual([70n, 30n])
    expect(allocate(21n, [1 / 3, 2 / 3])).toStrictEqual([7n, 14n])
  })
})

describe('accrual lookups', () => {
  const bond = generateSchedule({
    effective: '2026-01-15',
    termination: '2027-01-15',
    frequency: 'quarterly',
    calendar: target,
    convention: 'following',
  })

  it('defaults a period lookup to the adjusted dates', () => {
    // 2026-04-15 is a business day on TARGET, so both readings agree here.
    expect(periodContaining(bond, '2026-04-15')?.index).toBe(1)
    expect(periodContaining(bond, '2026-04-15', { dates: 'unadjusted' })?.index).toBe(1)
    expect(periodContaining(bond, '2026-01-14')).toBeUndefined()
  })

  it('accrues on the adjusted dates when asked', () => {
    const accrued = accruedInterest({
      schedule: bond,
      settlement: '2026-02-15',
      notional: 1_000_000_00n,
      rate: '4%',
      convention: 'ACT/365F',
      dates: 'adjusted',
    })
    expect(accrued.from).toBe('2026-01-15')
    expect(accrued.days).toBe(31)
    expect(accrued.amount).toBe(339_726n)
  })
})

describe('error narrowing', () => {
  it('does not accept a plain object wearing one of our codes', () => {
    expect(isBizDateError({ code: 'DATE_PARSE', message: 'faked' })).toBe(false)
    expect(isBizDateError(new Error('plain'))).toBe(false)
    expect(isBizDateError(null)).toBe(false)
  })
})

describe('custom calendar validation boundaries', () => {
  it.each([
    [{ kind: 'fixed', name: 'x', month: 0, day: 1 } as const],
    [{ kind: 'fixed', name: 'x', month: 13, day: 1 } as const],
    [{ kind: 'fixed', name: 'x', month: 1, day: 0 } as const],
    [{ kind: 'fixed', name: 'x', month: 1, day: 32 } as const],
    [{ kind: 'fixed', name: 'x', month: 1, day: 1.5 } as const],
    [{ kind: 'nth-weekday', name: 'x', month: 1, weekday: 0, nth: 1 } as const],
    [{ kind: 'nth-weekday', name: 'x', month: 1, weekday: 1, nth: 5 } as const],
    [{ kind: 'nth-weekday', name: 'x', month: 1, weekday: 1, nth: -2 } as const],
    [{ kind: 'easter', name: 'x', offset: 367 } as const],
    [{ kind: 'easter', name: 'x', offset: -367 } as const],
    [{ kind: 'easter', name: 'x', offset: 1.5 } as const],
  ])('refuses %o', (rule) => {
    expect(() =>
      // @ts-expect-error every one of these is a compile error as well
      customCalendar({ id: 'x', rules: [rule], validFrom: 2020, validThrough: 2030 }),
    ).toThrow(InvalidArgumentError)
  })

  it.each([
    [{ kind: 'fixed', name: 'ok', month: 12, day: 31 } as const],
    [{ kind: 'fixed', name: 'ok', month: 2, day: 29 } as const],
    [{ kind: 'nth-weekday', name: 'ok', month: 1, weekday: 7, nth: 4 } as const],
    [{ kind: 'nth-weekday', name: 'ok', month: 1, weekday: 1, nth: -1 } as const],
    [{ kind: 'easter', name: 'ok', offset: 366 } as const],
  ])('accepts %o', (rule) => {
    expect(() =>
      customCalendar({ id: 'x', rules: [rule], validFrom: 2020, validThrough: 2030 }),
    ).not.toThrow()
  })
})

describe('accrual guards and options', () => {
  const bond = generateSchedule({
    effective: '2026-01-15',
    termination: '2027-01-15',
    frequency: 'quarterly',
    calendar: target,
    convention: 'following',
  })

  it('refuses a schedule with nothing in it', () => {
    expect(() =>
      accruedInterest({
        schedule: { ...bond, periods: [] },
        settlement: '2026-02-15',
        notional: 1_000_00n,
        rate: '4%',
        convention: 'ACT/365F',
        dates: 'adjusted',
      }),
    ).toThrow(/has no periods/)
  })

  it('applies the rounding policy you name', () => {
    const base = {
      schedule: bond,
      settlement: '2026-02-15',
      notional: 1_000_000_00n,
      rate: '4%',
      convention: 'ACT/365F',
      dates: 'adjusted',
    } as const
    expect(accruedInterest(base).amount).toBe(339_726n)
    expect(accruedInterest({ ...base, rounding: 'floor' }).amount).toBe(339_726n)
    expect(accruedInterest({ ...base, rounding: 'ceiling' }).amount).toBe(339_727n)
    expect(() => accruedInterest({ ...base, rounding: 'exact' })).toThrow(InvalidArgumentError)
  })

  it('reads the period on the dates you chose, not the other ones', () => {
    // 15 April 2026 is Good Friday's neighbourhood on TARGET: the unadjusted
    // coupon boundary and the adjusted one fall on different days.
    const straddling = generateSchedule({
      effective: '2026-01-03',
      termination: '2027-01-03',
      frequency: 'quarterly',
      calendar: target,
      convention: 'following',
    })
    expect(periodContaining(straddling, '2026-04-04', { dates: 'unadjusted' })?.index).toBe(1)
    expect(periodContaining(straddling, '2026-04-04', { dates: 'adjusted' })?.index).toBe(0)
    expect(periodContaining(straddling, '2026-04-04')?.index).toBe(0)
  })

  it('measures a short final coupon against its notional period', () => {
    const finalStub = generateSchedule({
      effective: '2026-01-15',
      termination: '2027-02-20',
      frequency: 'semi-annual',
      lastRegularDate: '2027-01-15',
    })
    const stub = finalStub.periods[finalStub.periods.length - 1]
    expect(stub?.isStub).toBe(true)
    const accrued = accruedInterest({
      schedule: finalStub,
      settlement: '2027-02-01',
      notional: 100_00n,
      rate: '4%',
      convention: 'ACT/ACT ICMA',
      dates: 'unadjusted',
    })
    // 17 days measured over the notional 2027-01-15..2027-07-15 period (181
    // days), not over the 36-day stub.
    expect(accrued.days).toBe(17)
    expect(accrued.fraction).toBeCloseTo(17 / (2 * 181), 15)
  })

  it('leaves a day-based frequency to its own dates', () => {
    const weekly = generateSchedule({
      effective: '2026-01-05',
      termination: '2026-02-04',
      frequency: 'weekly',
    })
    const accrued = accruedInterest({
      schedule: weekly,
      settlement: '2026-01-08',
      notional: 100_00n,
      rate: '4%',
      convention: 'ACT/365F',
      dates: 'unadjusted',
    })
    // Rolling back weekly from 4 February puts the boundary on 7 January.
    expect(accrued.from).toBe('2026-01-07')
    expect(accrued.days).toBe(1)
  })
})

describe('amortization argument guards', () => {
  const base = {
    kind: 'periodic',
    principal: 100_000n,
    annualRate: '5%',
    periodsPerYear: 12,
    periods: 12,
  } as const

  it.each([0, -1, 1.5, Number.NaN])('refuses %s periods', (periods) => {
    expect(() => amortize({ ...base, periods })).toThrow(/periods/)
  })

  it.each([0, -1, 2.5])('refuses %s periods per year', (periodsPerYear) => {
    expect(() => amortize({ ...base, periodsPerYear })).toThrow(/periodsPerYear/)
  })

  it.each([0n, -1n])('refuses a principal of %s', (principal) => {
    expect(() => amortize({ ...base, principal })).toThrow(/principal/)
  })

  it('refuses a notional that is not a bigint', () => {
    expect(() =>
      accrue({
        // @ts-expect-error a number notional is the mistake this rejects
        notional: 1000,
        rate: '5%',
        start: '2026-01-01',
        end: '2026-02-01',
        convention: 'ACT/360',
      }),
    ).toThrow(/minor units/)
  })
})

describe('rounding and allocation edges', () => {
  it.each([
    ['half-up', 1n, 3n, -1n, -3n],
    ['half-down', 0n, 2n, 0n, -2n],
    ['half-even', 0n, 2n, 0n, -2n],
  ] as const)(
    '%s rounds 0.5, 2.5, -0.5 and -2.5',
    (mode, half, fiveHalves, minusHalf, minusFive) => {
      expect(roundFraction(fraction(1n, 2n), mode)).toBe(half)
      expect(roundFraction(fraction(5n, 2n), mode)).toBe(fiveHalves)
      expect(roundFraction(fraction(-1n, 2n), mode)).toBe(minusHalf)
      expect(roundFraction(fraction(-5n, 2n), mode)).toBe(minusFive)
    },
  )

  it('rounds values that are not ties the same way under every mode', () => {
    for (const mode of ['half-up', 'half-down', 'half-even'] as const) {
      expect(roundFraction(fraction(24n, 10n), mode)).toBe(2n)
      expect(roundFraction(fraction(26n, 10n), mode)).toBe(3n)
    }
  })

  it('breaks an allocation tie by position', () => {
    expect(allocate(4n, [1, 1, 1])).toStrictEqual([2n, 1n, 1n])
    expect(allocate(5n, [1, 1, 1])).toStrictEqual([2n, 2n, 1n])
    expect(allocate(1n, [1, 1, 1, 1])).toStrictEqual([1n, 0n, 0n, 0n])
  })
})

describe('fraction parsing and predicates', () => {
  it('knows zero from everything else', () => {
    expect(isZeroFraction(fraction(0n, 5n))).toBe(true)
    expect(isZeroFraction(fraction(1n, 5n))).toBe(false)
    expect(isZeroFraction(fraction(-1n, 5n))).toBe(false)
  })

  it('has no signed zero, unlike a float', () => {
    expect(fractionToString(fractionFromDecimal('-0'))).toBe('0')
    expect(Object.is(fractionToNumber(fractionFromDecimal('-0')), 0)).toBe(true)
  })

  it.each(['5', '0', '1e+3', '1E3', '12.500'])('parses %s', (decimal) => {
    expect(fractionToNumber(fractionFromDecimal(decimal))).toBe(Number(decimal))
  })

  it.each(['1.', '.5', '1..2', '1e', 'e3', '1e2.5', '', '%', '1 000'])('rejects %s', (decimal) => {
    expect(() => fractionFromDecimal(decimal)).toThrow(InvalidArgumentError)
  })
})

describe('range and type guards', () => {
  it('refuses epoch days outside the supported calendar', () => {
    expect(dateFromEpochDay(-135_140)).toBe('1600-01-01')
    expect(dateFromEpochDay(2_932_896)).toBe('9999-12-31')
    expect(() => dateFromEpochDay(-135_141)).toThrow(InvalidDateError)
    expect(() => dateFromEpochDay(2_932_897)).toThrow(InvalidDateError)
    expect(() => dateFromEpochDay(1.5)).toThrow(InvalidDateError)
  })

  it('refuses a fractional month, weekday or nth in a rule', () => {
    for (const rule of [
      { kind: 'fixed', name: 'x', month: 1.5, day: 1 },
      { kind: 'nth-weekday', name: 'x', month: 1.5, weekday: 1, nth: 1 },
      { kind: 'nth-weekday', name: 'x', month: 1, weekday: 1.5, nth: 1 },
    ] as const)
      expect(() =>
        // @ts-expect-error fractional fields are a compile error as well
        customCalendar({ id: 'x', rules: [rule], validFrom: 2020, validThrough: 2030 }),
      ).toThrow(InvalidArgumentError)
  })

  it('keeps a one-off closure inside its own year', () => {
    const once = customCalendar({
      id: 'once',
      dates: ['2026-03-17'],
      validFrom: 2024,
      validThrough: 2030,
    })
    expect(holidays(once, 2025)).toStrictEqual([])
    expect(holidays(once, 2026)).toStrictEqual([{ date: '2026-03-17', name: '2026-03-17' }])
    expect(holidays(once, 2027)).toStrictEqual([])
  })

  it('prices a level payment on its own, with its own guards', () => {
    expect(fractionToNumber(exactLevelPayment(100_000n, '0.01', 12))).toBeCloseTo(8_884.88, 2)
    expect(fractionToString(exactLevelPayment(120_000n, 0, 12))).toBe('10000')
    expect(() => exactLevelPayment(100_000n, '0.01', 0)).toThrow(InvalidArgumentError)
    expect(() => exactLevelPayment(100_000n, '0.01', -1)).toThrow(InvalidArgumentError)
    expect(() => exactLevelPayment(100_000n, '0.01', 1.5)).toThrow(InvalidArgumentError)
  })

  it('accepts a rate as a fraction, and nothing shapeless', () => {
    expect(fractionToString(toFraction(fraction(1n, 8n)))).toBe('1/8')
    expect(fractionToString(toFraction('12.5%'))).toBe('1/8')
    expect(fractionToString(toFraction(0.125))).toBe('1/8')
    // Including `null`, which reaches the object branch and must not escape as
    // a bare TypeError from reading a property of nothing.
    for (const bad of [
      {},
      { numerator: 1n },
      { numerator: 1, denominator: 8 },
      [],
      null,
      undefined,
    ])
      // @ts-expect-error none of these are a rate
      expect(() => toFraction(bad)).toThrow(InvalidArgumentError)
  })

  it('treats a single-period schedule as regular however it was reached', () => {
    const shortOne = generateSchedule({
      effective: '2026-01-05',
      termination: '2026-03-15',
      frequency: 'quarterly',
    })
    expect(shortOne.periods).toHaveLength(1)
    expect(shortOne.periods[0]?.isStub).toBe(false)
  })
})
