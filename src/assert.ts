/**
 * Proves a switch covered every variant of a union.
 *
 * If a new member is added to the union, the call stops compiling — the missing
 * case is a type error rather than a value slipping silently through at runtime.
 */
export function assertNever(value: never): never {
  throw new TypeError(`Unhandled variant: ${JSON.stringify(value)}`)
}
