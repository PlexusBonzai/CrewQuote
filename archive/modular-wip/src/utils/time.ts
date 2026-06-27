/**
 * Parse a time string "HH:MM" into total minutes since midnight.
 */
export function parseTimeToMinutes(timeStr: string | undefined | null): number {
  if (!timeStr) return 0
  const parts = (timeStr + ':0').split(':')
  const hours = parseInt(parts[0], 10) || 0
  const mins  = parseInt(parts[1], 10) || 0
  return hours * 60 + mins
}

/**
 * Calculate duration between two time strings in hours.
 * Automatically handles overnight shoots: if end <= start, wraps to next day.
 *
 * Examples:
 *   durationHours('08:00', '18:00') → 10.0
 *   durationHours('22:00', '06:00') → 8.0  ← overnight, NOT negative
 */
export function durationHours(startTime: string, endTime: string): number {
  let start = parseTimeToMinutes(startTime)
  let end   = parseTimeToMinutes(endTime)

  // Overnight shoot: end is on the next day
  if (end <= start) {
    end += 24 * 60
  }

  return (end - start) / 60
}

/**
 * Calculate turnaround time in hours between wrap of one day and call of the next.
 * Always returns a positive number; handles overnight wraps.
 *
 * Example: wrap=22:00, nextCall=06:00 → 8.0 hours
 */
export function calculateTurnaround(
  wrapTime: string | undefined,
  nextCallTime: string | undefined
): number | null {
  if (!wrapTime || !nextCallTime) return null

  let wrap     = parseTimeToMinutes(wrapTime)
  let nextCall = parseTimeToMinutes(nextCallTime)

  // Next call is next day (typical overnight turnaround)
  if (nextCall <= wrap) {
    nextCall += 24 * 60
  }

  return (nextCall - wrap) / 60
}

/**
 * Convert decimal hours to a human-readable "Xh Ym" string.
 * e.g. 1.75 → '1h 45m', 10 → '10h'
 */
export function hoursToHM(hours: number): string {
  const h = Math.floor(Math.abs(hours))
  const m = Math.round((Math.abs(hours) - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
