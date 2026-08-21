import { daysFromCivil } from './civil.js'

const cache = new Map<number, number>()

/**
 * The epoch day of Easter Sunday in the Gregorian calendar, by the anonymous
 * Gregorian computus (Meeus/Jones/Butcher). Good Friday is two days earlier and
 * Easter Monday one day later, which is how most European market calendars
 * define their moveable holidays.
 */
export function easterSunday(year: number): number {
  const cached = cache.get(year)
  if (cached !== undefined) return cached
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  const epochDay = daysFromCivil(year, month, day)
  cache.set(year, epochDay)
  return epochDay
}
