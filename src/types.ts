/** A `string` that keeps literal-union members visible in editor completions. */
export type StringWithHints<Literals extends string> = Literals | (string & Record<never, never>)

declare const brand: unique symbol
/** Attaches a compile-time-only tag to a primitive so validated values are not interchangeable with raw ones. */
export type Brand<T, B extends string> = T & { readonly [brand]: B }
