import type { PluginOptions } from 'claude-code'

export const SEGMENTS = ['context', 'tokens', 'chart', 'delta', 'limits', 'cost', 'mcp'] as const

export type Segment = (typeof SEGMENTS)[number]

export type Config = {
  segments: readonly Segment[]
  warnAt: number
  criticalAt: number
  hasToasts: boolean
  hasCacheToast: boolean
}

const isSegment = (name: string): name is Segment => (SEGMENTS as readonly string[]).includes(name)

const percentOf = (value: unknown, fallback: number): number =>
  typeof value === 'number' && value > 0 && value <= 100 ? value : fallback

export const toConfig = (options: PluginOptions): Config => {
  const listed = typeof options.segments === 'string' ? options.segments.split(',').map(name => name.trim()) : []
  const segments = [...new Set(listed.filter(isSegment))]
  const criticalAt = percentOf(options.criticalAt, 90)

  return {
    segments: segments.length === 0 ? SEGMENTS : segments,
    warnAt: Math.min(percentOf(options.warnAt, 75), criticalAt),
    criticalAt,
    hasToasts: options.toasts !== false,
    hasCacheToast: options.cacheToast !== false,
  }
}
