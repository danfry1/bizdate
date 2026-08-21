/** Discriminant shared by every error this package throws. */
export type BizDateErrorCode =
  | 'DATE_PARSE'
  | 'INVALID_DATE'
  | 'INVALID_ARGUMENT'
  | 'CALENDAR_RANGE'
  | 'SCHEDULE'

abstract class BizDateBaseError extends Error {
  abstract override readonly name: string
  abstract readonly code: BizDateErrorCode

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    Object.setPrototypeOf(this, new.target.prototype)
  }

  protected baseJson(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      name: this.name,
      code: this.code,
      message: this.message,
    }
    if (this.cause !== undefined)
      json['cause'] = this.cause instanceof Error ? this.cause.message : this.cause
    return json
  }
}

/** The input text was not a well-formed `YYYY-MM-DD` calendar date. */
export class DateParseError extends BizDateBaseError {
  override readonly name = 'DateParseError' as const
  override readonly code = 'DATE_PARSE' as const

  constructor(
    readonly input: string,
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Cannot parse ${JSON.stringify(input)} as a YYYY-MM-DD date: ${reason}`, options)
  }

  toJSON(): Record<string, unknown> {
    return { ...this.baseJson(), input: this.input, reason: this.reason }
  }
}

/** A date was well-formed but outside the range this package supports, or otherwise not a real date. */
export class InvalidDateError extends BizDateBaseError {
  override readonly name = 'InvalidDateError' as const
  override readonly code = 'INVALID_DATE' as const

  constructor(
    readonly field: string,
    readonly value: number,
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Invalid ${field} ${String(value)}: ${reason}`, options)
  }

  toJSON(): Record<string, unknown> {
    return { ...this.baseJson(), field: this.field, value: this.value, reason: this.reason }
  }
}

/** An argument was structurally valid but semantically unusable (a negative notional, an unknown convention). */
export class InvalidArgumentError extends BizDateBaseError {
  override readonly name = 'InvalidArgumentError' as const
  override readonly code = 'INVALID_ARGUMENT' as const

  constructor(
    readonly argument: string,
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Invalid ${argument}: ${reason}`, options)
  }

  toJSON(): Record<string, unknown> {
    return { ...this.baseJson(), argument: this.argument, reason: this.reason }
  }
}

/**
 * A calendar was queried outside the years its rules are validated for. Holiday
 * rules change over time; answering outside the validated window would be a
 * guess, so it is refused instead.
 */
export class CalendarRangeError extends BizDateBaseError {
  override readonly name = 'CalendarRangeError' as const
  override readonly code = 'CALENDAR_RANGE' as const

  constructor(
    readonly calendar: string,
    readonly year: number,
    readonly validFrom: number,
    readonly validThrough: number,
    options?: { cause?: unknown },
  ) {
    super(
      `Calendar "${calendar}" is validated for ${String(validFrom)}-${String(validThrough)}; year ${String(year)} is outside that range`,
      options,
    )
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.baseJson(),
      calendar: this.calendar,
      year: this.year,
      validFrom: this.validFrom,
      validThrough: this.validThrough,
    }
  }
}

/** A schedule request was self-contradictory (termination before effective, an impossible stub). */
export class ScheduleError extends BizDateBaseError {
  override readonly name = 'ScheduleError' as const
  override readonly code = 'SCHEDULE' as const

  constructor(
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Cannot build schedule: ${reason}`, options)
  }

  toJSON(): Record<string, unknown> {
    return { ...this.baseJson(), reason: this.reason }
  }
}

/** Every error this package throws. */
export type BizDateError =
  | DateParseError
  | InvalidDateError
  | InvalidArgumentError
  | CalendarRangeError
  | ScheduleError

const CODES: readonly BizDateErrorCode[] = [
  'DATE_PARSE',
  'INVALID_DATE',
  'INVALID_ARGUMENT',
  'CALENDAR_RANGE',
  'SCHEDULE',
]

/** Narrows an unknown caught value to a bizdate error. */
export function isBizDateError(value: unknown): value is BizDateError {
  return (
    value instanceof Error &&
    'code' in value &&
    CODES.includes((value as { code: BizDateErrorCode }).code)
  )
}
