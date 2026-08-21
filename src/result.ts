/**
 * Successful outcome carrying a value.
 *
 * `Result` has a deliberately small footprint in this package: it is returned
 * only by {@link parseDate}, where a malformed input is an ordinary, expected
 * outcome (a CSV row, a form field, an API body). Every other function treats
 * bad input as a programmer error and throws a typed error instead, so the
 * common path — `isBusinessDay(date, calendar)` — stays free of ceremony.
 */
export type Ok<T> = { readonly ok: true; readonly value: T }
/** Failed outcome carrying a typed error. */
export type Err<E> = { readonly ok: false; readonly error: E }
/** The outcome of parsing untrusted input: either a value or a typed error. */
export type Result<T, E> = Ok<T> | Err<E>

/** Wraps a value in an `Ok`. Internal — callers branch on `.ok`, they do not construct results. */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
/** Wraps an error in an `Err`. Internal — callers branch on `.ok`, they do not construct results. */
export const err = <E>(error: E): Err<E> => ({ ok: false, error })
