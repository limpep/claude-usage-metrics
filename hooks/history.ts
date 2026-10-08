import type { History, Limit } from '../types'

export const HISTORY_DAYS = 30

const pad = (n: number): string => String(n).padStart(2, '0')

// The local calendar day: a day's peak is the person's day, not UTC's.
export const dayOf = (ms: number): string => {
  const at = new Date(ms)

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

// The last `count` days ending on the day of `ms`, oldest first.
export const daysTo = (ms: number, count: number): string[] => {
  const at = new Date(ms)

  return Array.from({ length: count }, (_, index) =>
    dayOf(new Date(at.getFullYear(), at.getMonth(), at.getDate() - (count - 1 - index), 12).getTime()),
  )
}

export const isHistory = (value: unknown): value is History =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every(
    day => typeof day === 'object' && day !== null && Object.values(day).every(peak => typeof peak === 'number'),
  )

// Each kind's higher figure per day, over the newest days only.
export const merge = (one: History, other: History): History => {
  const days = [...new Set([...Object.keys(one), ...Object.keys(other)])].sort().slice(-HISTORY_DAYS)

  return Object.fromEntries(
    days.map(day => {
      const peaks: Record<string, number> = { ...one[day] }

      for (const [kind, peak] of Object.entries(other[day] ?? {})) {
        peaks[kind] = Math.max(peaks[kind] ?? 0, peak)
      }

      return [day, peaks]
    }),
  )
}

// The day's peaks that rose past what is held; empty when none did.
export const risen = (held: History, limits: readonly Limit[], time: number): History => {
  const day = dayOf(time)
  const higher = limits.filter(limit => limit.percentUsed > (held[day]?.[limit.kind] ?? -1))

  return higher.length === 0 ? {} : { [day]: Object.fromEntries(higher.map(limit => [limit.kind, limit.percentUsed])) }
}
