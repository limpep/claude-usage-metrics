import type { Mcp, Sample, Snapshot } from '../types'
import { formatChange, formatCost, formatDelta, formatLimit, formatMcp, formatTokens, sparkline, stepOf } from './format'
import type { Config, Segment } from './options'
import { fullIn, overPace } from './pace'

const CHART_TURNS = 12

export const GAP = 2

// `short`: what the segment shrinks to when the band is too narrow for it whole.
export type Drawn = { text: string; short?: string; color?: string; isBold?: boolean; isDim?: boolean }

type Figures = {
  usage: Snapshot
  turns: readonly number[]
  delta: number | null
  time: number
  mcp: Mcp | null
  samples: Readonly<Record<string, Sample[]>>
}

// The band's segments in the order asked for.
export const segmentsOf = ({ usage, turns, delta, time, mcp, samples }: Figures, config: Config): Drawn[] => {
  const chart = turns.slice(-CHART_TURNS)
  const percent = usage.percent ?? 0
  const step = stepOf(percent)
  const fill = usage.tokens === undefined ? '-' : formatTokens(usage.tokens)

  const drawn: Record<Segment, Drawn[]> = {
    context: [{ text: `${step.icon} ${percent}%`, color: step.color, isBold: true }],
    tokens: [{ text: `${fill} / ${formatTokens(usage.window)}` }],
    chart: chart.length > 0 ? [{ text: sparkline(chart, usage.window), color: step.color }] : [],
    delta: delta === null ? [] : [{ text: formatDelta(delta), short: formatChange(delta), isDim: true }],
    limits: usage.limits.map(limit => {
      const notes = {
        fullIn: fullIn(samples[limit.kind] ?? [], limit.resetsAt, time),
        overPace: overPace(limit.kind, limit.percentUsed, limit.resetsAt, time),
      }

      return {
        text: formatLimit(limit, time, notes),
        short: formatLimit(limit, time, { ...notes, isShort: true }),
        color: stepOf(limit.percentUsed).color,
      }
    }),
    cost: usage.cost === undefined ? [] : [{ text: formatCost(usage.cost), isDim: true }],
    mcp: mcp === null ? [] : [{ text: formatMcp(mcp.servers, mcp.tokens), isDim: true }],
  }

  return config.segments.flatMap(name => drawn[name])
}

const widthOf = (segments: readonly Drawn[]): number =>
  segments.reduce((sum, segment, index) => sum + [...segment.text].length + (index === 0 ? 0 : GAP), 0)

// Whole when the band has room; else each segment at its shortest, and then one
// that still does not fit is left out, never wrapped. The first always shows.
export const fit = (segments: readonly Drawn[], columns: number): Drawn[] => {
  if (widthOf(segments) <= columns) {
    return [...segments]
  }

  let used = 0

  return segments
    .map(segment => ({ ...segment, text: segment.short ?? segment.text }))
    .filter((segment, index) => {
      used += [...segment.text].length + (index === 0 ? 0 : GAP)

      return index === 0 || used <= columns
    })
}
