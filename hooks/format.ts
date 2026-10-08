import type { Limit } from '../types'

const BARS = '▁▂▃▄▅▆▇█'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LIMIT_LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

export type Step = { icon: string; color: string }

const STEPS: readonly (Step & { from: number })[] = [
  { from: 90, icon: '●', color: '#ff4d4f' },
  { from: 75, icon: '◕', color: '#ff8700' },
  { from: 50, icon: '◑', color: '#d670d6' },
  { from: 25, icon: '◔', color: '#00c8d7' },
  { from: 0, icon: '○', color: '#f1c40f' },
]

export const stepOf = (percent: number): Step =>
  STEPS.find(step => percent >= step.from) ?? STEPS[STEPS.length - 1]!

export const formatTokens = (tokens: number): string => {
  const abs = Math.abs(tokens)

  if (abs < 1000) {
    return String(abs)
  }

  const [scaled, unit] = abs < 1_000_000 ? [abs / 1000, 'k'] : [abs / 1_000_000, 'M']

  return scaled.toFixed(1).replace(/\.0$/, '') + unit
}

export const formatChange = (delta: number): string => `${delta < 0 ? '▼ -' : '▲ +'}${formatTokens(delta)}`

export const formatDelta = (delta: number): string => `${formatChange(delta)} last turn`

export const sparkline = (turns: readonly number[], window: number): string =>
  turns
    .map(tokens => {
      const level = Math.floor((tokens / Math.max(window, 1)) * BARS.length)

      return BARS[Math.min(BARS.length - 1, Math.max(0, level))]
    })
    .join('')

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// The two largest units, a zero second one left out.
export const formatDuration = (ms: number): string => {
  if (ms < MINUTE) {
    return '<1m'
  }

  const [major, minor] =
    ms >= DAY
      ? [`${Math.floor(ms / DAY)}d`, `${Math.floor((ms % DAY) / HOUR)}h`]
      : ms >= HOUR
        ? [`${Math.floor(ms / HOUR)}h`, `${Math.floor((ms % HOUR) / MINUTE)}m`]
        : [`${Math.floor(ms / MINUTE)}m`, '']

  return minor === '' || minor.startsWith('0') ? major : `${major} ${minor}`
}

// Instants compared in epoch milliseconds, so no timezone or DST shift enters the sum.
export const formatRemaining = (resetsAt: string, now: number): string | undefined => {
  const left = new Date(resetsAt).getTime() - now

  if (Number.isNaN(left)) {
    return undefined
  }

  return left <= 0 ? 'now' : formatDuration(left)
}

const pad = (n: number): string => String(n).padStart(2, '0')

// In the machine's own timezone; the date only when the reset falls on another day.
export const formatResetTime = (resetsAt: string, now: number): string | undefined => {
  const at = new Date(resetsAt)

  if (Number.isNaN(at.getTime())) {
    return undefined
  }

  const today = new Date(now)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const isToday =
    at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate()

  return isToday ? time : `${MONTHS[at.getMonth()]} ${at.getDate()} ${time}`
}

export const labelOf = (kind: string): string => LIMIT_LABELS[kind] ?? kind

// `fullIn`: how long until the window fills at the present pace, when that comes before its reset.
// `overPace`: how far use runs ahead of an even spread over the window.
// `isShort` keeps the figures and the pace warning and drops the rest.
export const formatLimit = (
  limit: Limit,
  now: number,
  notes: { fullIn?: number; overPace?: number; isShort?: boolean } = {},
): string => {
  const left = limit.resetsAt === undefined ? undefined : formatRemaining(limit.resetsAt, now)
  const at = limit.resetsAt === undefined ? undefined : formatResetTime(limit.resetsAt, now)
  const reset = left === undefined || at === undefined ? '' : ` ↻ ${left}${notes.isShort ? '' : ` (${at})`}`
  const pace = notes.fullIn === undefined ? '' : ` ⚠ ~${formatDuration(notes.fullIn)}`
  const over = notes.overPace === undefined || notes.isShort ? '' : ` · ${formatDuration(notes.overPace)} over pace`

  return `${labelOf(limit.kind)} ${Math.round(limit.percentUsed)}%${reset}${pace}${over}`
}

export const formatCost = (usd: number): string => `$${usd.toFixed(2)}`

export const formatMcp = (servers: number, tokens: number): string =>
  `MCP ${servers}${tokens > 0 ? ` · ${formatTokens(tokens)}` : ''}`

// The sparkline over several rows, top row first; a turn with any fill shows at least one step.
export const tallChart = (turns: readonly number[], window: number, rows: number): string[] => {
  const steps = rows * BARS.length
  const levels = turns.map(tokens =>
    tokens <= 0 ? 0 : Math.min(steps, Math.max(1, Math.round((tokens / Math.max(window, 1)) * steps))),
  )

  return Array.from({ length: rows }, (_, row) => {
    const base = (rows - 1 - row) * BARS.length

    return levels.map(level => (level <= base ? ' ' : BARS[Math.min(BARS.length, level - base) - 1])).join('')
  })
}

// One step per day's peak percentage; a day with no figure is a dot.
export const peakLine = (peaks: readonly (number | undefined)[]): string =>
  peaks
    .map(peak =>
      peak === undefined ? '·' : BARS[Math.min(BARS.length - 1, Math.max(0, Math.floor((peak / 100) * BARS.length)))],
    )
    .join('')

// A share as a whole percentage; absent with nothing to share.
export const formatShare = (part: number, whole: number): string | undefined =>
  whole <= 0 ? undefined : `${Math.round((part / whole) * 100)}%`

const CHARS_PER_TOKEN = 4

// A rough token count for returned text: the engine gives a tool result no count of its own.
export const tokensOf = (chars: number): number => Math.round(chars / CHARS_PER_TOKEN)

const quote = (cell: string | number | undefined): string => {
  const text = cell === undefined ? '' : String(cell)

  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const toCsv = (rows: readonly (readonly (string | number | undefined)[])[]): string =>
  rows.map(row => row.map(quote).join(',')).join('\n') + '\n'

// A turn's length: seconds under a minute, then minutes and seconds.
export const formatSeconds = (ms: number): string => {
  const seconds = Math.round(ms / 1000)

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`
