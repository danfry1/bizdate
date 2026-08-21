// Dates
export {
  addDays,
  addMonths,
  addYears,
  type CivilDate,
  compareDates,
  type DateInput,
  dateFromEpochDay,
  daysBetween,
  daysInMonth,
  daysInYear,
  dayOfWeek,
  epochDayOf,
  fromJsDate,
  isAfter,
  isBefore,
  isEndOfMonth,
  isIsoDate,
  isLeapYear,
  isSameDate,
  type IsoDate,
  lastDayOfMonth,
  MAX_YEAR,
  MIN_YEAR,
  parseDate,
  parseDateOrThrow,
  toCivil,
  toIsoDate,
  toJsDate,
  today,
  WEEKDAY,
  type Weekday,
} from './civil.js'

// Calendars
export {
  type Calendar,
  customCalendar,
  type EasterHolidayRule,
  type FixedHolidayRule,
  type Holiday,
  holidayName,
  holidays,
  type HolidayRule,
  isHoliday,
  isWeekend,
  type JointCalendar,
  jointCalendar,
  type NthWeekdayHolidayRule,
  type ObservedRule,
  type OneOffHolidayRule,
  type RuleCalendar,
} from './calendar.js'
export {
  calendars,
  everyDay,
  fedwire,
  lse,
  nyse,
  sifma,
  target,
  unitedKingdom,
  unitedStates,
  weekendsOnly,
} from './calendars/index.js'

// Business days
export {
  addBusinessDays,
  adjust,
  type BusinessDayConvention,
  businessDaysBetween,
  isBusinessDay,
  nextBusinessDay,
  nonBusinessDaysBetween,
  previousBusinessDay,
  settlementDate,
} from './businessday.js'

// Day count conventions
export {
  DAY_COUNT_CONVENTIONS,
  type DayCountConvention,
  dayCountDays,
  dayCountFraction,
  type DayCountOptions,
  exactDayCountFraction,
  normalizeConvention,
} from './daycount.js'

// Frequencies and schedules
export {
  type Frequency,
  type FrequencyStep,
  frequencyStep,
  PERIODS_PER_YEAR,
  periodsPerYear,
} from './frequency.js'
export {
  generateSchedule,
  type RollDirection,
  type Schedule,
  scheduleDates,
  type SchedulePeriod,
  type ScheduleOptions,
} from './schedule.js'

// Money
export { allocate, type Rounding, roundFraction } from './money.js'
export {
  type AccrualOptions,
  accrue,
  accrueExact,
  type Amortization,
  type AmortizationMethod,
  type AmortizationOptions,
  type AmortizationPeriod,
  amortize,
  exactLevelPayment,
} from './accrual.js'

// Exact arithmetic
export {
  addFractions,
  compareFractions,
  divideFractions,
  fraction,
  type Fraction,
  fractionFromDecimal,
  fractionFromInteger,
  fractionFromNumber,
  isZeroFraction,
  multiplyFractions,
  negateFraction,
  ONE,
  raiseFraction,
  type RateInput,
  subtractFractions,
  toFraction,
  fractionToString,
  fractionToNumber,
  ZERO,
} from './rational.js'

// Errors and results
export {
  type BizDateError,
  type BizDateErrorCode,
  CalendarRangeError,
  DateParseError,
  InvalidArgumentError,
  InvalidDateError,
  isBizDateError,
  ScheduleError,
} from './errors.js'
export type { Err, Ok, Result } from './result.js'
export type { Brand, StringWithHints } from './types.js'
