import type { Sample } from '../types'

const MINUTE = 60_000
const KEPT_MS = 60 * MINUTE
const LEAST_SPAN_MS = 10 * MINUTE
const STALE_MS = 30 * MINUTE

// A falling figure is a window that reset: the pace starts over from it.
export const addSample = (list: readonly Sample[], sample: Sample): Sample[] => {
  const last = list.at(-1)

  if (last !== undefined && sample.percent < last.percent) {
    return [sample]
  }

  if (last !== undefined && sample.at - last.at < MINUTE) {
    return [...list]
  }

  return [...list, sample].filter(one => sample.at - one.at <= KEPT_MS)
}

// How long from `now` until the window is full at the pace of the samples; absent
// when the pace is unknown, stale, flat, or reaches full only after the reset.
export const fullIn = (list: readonly Sample[], resetsAt: string | undefined, now: number): number | undefined => {
  const first = list[0]
  const last = list.at(-1)

  if (first === undefined || last === undefined || resetsAt === undefined) {
    return undefined
  }

  const span = last.at - first.at
  const rise = last.percent - first.percent

  if (span < LEAST_SPAN_MS || rise <= 0 || last.percent >= 100 || now - last.at > STALE_MS) {
    return undefined
  }

  const fullAt = last.at + ((100 - last.percent) / rise) * span
  const reset = new Date(resetsAt).getTime()

  return Number.isNaN(reset) || fullAt >= reset ? undefined : Math.max(0, fullAt - now)
}

const WINDOW_MS: Record<string, number> = { seven_day: 7 * 24 * 60 * MINUTE }
const LEAST_OVER_MS = 60 * MINUTE

// How far use runs ahead of an even spread over the window, as time of that
// window; absent for a window whose length is not known, or when not ahead.
export const overPace = (kind: string, percentUsed: number, resetsAt: string | undefined, now: number): number | undefined => {
  const length = WINDOW_MS[kind]
  const reset = resetsAt === undefined ? Number.NaN : new Date(resetsAt).getTime()

  if (length === undefined || Number.isNaN(reset)) {
    return undefined
  }

  const elapsed = Math.min(length, Math.max(0, now - (reset - length)))
  const over = (percentUsed / 100) * length - elapsed

  return over >= LEAST_OVER_MS ? over : undefined
}
