export type RecurringSchedule = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number // >= 1
  startAt: Date // anchor; the first occurrence
  endAt?: Date | null
}

const MAX_ITERATIONS = 1000
const DAY_MS = 24 * 60 * 60 * 1000

function daysInMonth(year: number, monthIndex0: number): number {
  // monthIndex0 may be outside 0-11; Date.UTC normalizes it, and passing day 0
  // of the *next* month yields the last day of the target month.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate()
}

/** Computes the n-th occurrence (0-indexed) directly from the anchor `startAt`. */
function occurrenceAt(s: RecurringSchedule, n: number): Date {
  const start = s.startAt
  const h = start.getUTCHours()
  const min = start.getUTCMinutes()
  const sec = start.getUTCSeconds()
  const ms = start.getUTCMilliseconds()

  switch (s.freq) {
    case 'daily':
      return new Date(start.getTime() + n * s.interval * 24 * 60 * 60 * 1000)
    case 'weekly':
      return new Date(start.getTime() + n * s.interval * 7 * 24 * 60 * 60 * 1000)
    case 'monthly': {
      const startYear = start.getUTCFullYear()
      const startMonth = start.getUTCMonth()
      const startDay = start.getUTCDate()
      const targetMonthAbs = startMonth + n * s.interval
      const targetYear = startYear + Math.floor(targetMonthAbs / 12)
      const targetMonth = ((targetMonthAbs % 12) + 12) % 12
      const day = Math.min(startDay, daysInMonth(targetYear, targetMonth))
      return new Date(Date.UTC(targetYear, targetMonth, day, h, min, sec, ms))
    }
    case 'yearly': {
      const startYear = start.getUTCFullYear()
      const startMonth = start.getUTCMonth()
      const startDay = start.getUTCDate()
      const targetYear = startYear + n * s.interval
      const day = Math.min(startDay, daysInMonth(targetYear, startMonth))
      return new Date(Date.UTC(targetYear, startMonth, day, h, min, sec, ms))
    }
  }
}

/** Conservative lower bound on the occurrence index n whose date could exceed `after` —
 *  jump-starts the search so a far-future `after` doesn't exhaust the iteration cap.
 *  Backs off by 2 to stay safely below the true index despite day-of-month clamping. */
function lowerBoundIndex(s: RecurringSchedule, after: Date): number {
  const delta = after.getTime() - s.startAt.getTime()
  if (delta <= 0) return 0

  let n0: number
  switch (s.freq) {
    case 'daily':
      n0 = Math.floor(delta / (s.interval * DAY_MS))
      break
    case 'weekly':
      n0 = Math.floor(delta / (s.interval * 7 * DAY_MS))
      break
    case 'monthly': {
      const monthDelta =
        (after.getUTCFullYear() - s.startAt.getUTCFullYear()) * 12 +
        (after.getUTCMonth() - s.startAt.getUTCMonth())
      n0 = Math.floor(monthDelta / s.interval)
      break
    }
    case 'yearly':
      n0 = Math.floor((after.getUTCFullYear() - s.startAt.getUTCFullYear()) / s.interval)
      break
  }
  return Math.max(0, n0 - 2)
}

/** Occurrences strictly after `after`, in order, up to `count`. Monthly/yearly preserve
 *  startAt's day-of-month clamped to the target month (Jan 31 -> Feb 28). */
export function nextOccurrences(s: RecurringSchedule, after: Date, count: number): Date[] {
  if (s.interval < 1 || count <= 0) return []

  const results: Date[] = []
  const start = lowerBoundIndex(s, after)
  for (let n = start; n < start + MAX_ITERATIONS + 2 && results.length < count; n++) {
    const occurrence = occurrenceAt(s, n)
    if (s.endAt && occurrence.getTime() > s.endAt.getTime()) break
    if (occurrence.getTime() > after.getTime()) {
      results.push(occurrence)
    }
  }
  return results
}
