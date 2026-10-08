import type { Snapshot } from '../types'
import { formatRemaining, labelOf } from './format'
import type { Config } from './options'

const COMPACT_AT = 85

export const levelOf = (percent: number, config: Config): number =>
  percent >= config.criticalAt ? 2 : percent >= config.warnAt ? 1 : 0

// One toast per crossing: a key's level is kept, and falls back with the figure
// (a reset, a /clear, a compaction), which arms the next crossing.
export const alertsFor = (
  before: Readonly<Record<string, number>>,
  usage: Snapshot,
  time: number,
  config: Config,
): { levels: Record<string, number>; toasts: string[] } => {
  const levels: Record<string, number> = {}
  const toasts: string[] = []
  const percent = usage.percent ?? 0

  levels.compact = percent >= COMPACT_AT ? 1 : 0
  levels.context = levelOf(percent, config)

  if (levels.compact > (before.compact ?? 0)) {
    toasts.push(`Context ${percent}% full · /compact frees room`)
  } else if (levels.context > (before.context ?? 0)) {
    toasts.push(`Context ${percent}% full`)
  }

  for (const limit of usage.limits) {
    const level = levelOf(limit.percentUsed, config)
    const left = limit.resetsAt === undefined ? undefined : formatRemaining(limit.resetsAt, time)
    levels[limit.kind] = level

    if (level > (before[limit.kind] ?? 0)) {
      const reset = left === undefined || left === 'now' ? '' : ` · resets in ${left}`
      toasts.push(`${labelOf(limit.kind)} limit ${Math.round(limit.percentUsed)}% used${reset}`)
    }
  }

  return { levels, toasts: config.hasToasts ? toasts : [] }
}
