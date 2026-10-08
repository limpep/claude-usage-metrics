import { mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { SessionContextBreakdown, SessionUsage } from 'claude-code'

export const WINDOW = 200_000

export const BAND = {
  plugin: 'usage-metrics',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

export const usageAt = (tokens: number): SessionUsage => ({
  startedAt: 0,
  context: { tokens, window: WINDOW, percent: Math.round((tokens / WINDOW) * 100) },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-04T14:30:00' },
    { kind: 'seven_day', percentUsed: 91, resetsAt: '2026-10-09T09:05:00' },
  ],
})

// Local time, like the offset-less resets above: the same remaining time in every timezone.
export const NOW = new Date('2026-10-04T12:16:00').getTime()
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const TURN = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const

// A breakdown as the session gives it, cut to what the mod reads.
export const breakdownOf = (tools: readonly { serverName: string; tokens: number; isLoaded?: boolean }[]) =>
  ({
    model: 'Opus 5.5',
    categories: [
      { name: 'Messages', tokens: 30_000, kind: 'used' },
      { name: 'MCP tools (deferred)', tokens: 2000, kind: 'deferred' },
      { name: 'Free space', tokens: 150_000, kind: 'free' },
    ],
    memoryFiles: [{ path: '/home/me/project/CLAUDE.md', type: 'Project', tokens: 1200 }],
    mcpTools: tools.map((tool, index) => ({ name: `tool_${index}`, isLoaded: true, ...tool })),
  }) as unknown as SessionContextBreakdown

export const TOOLS = [
  { serverName: 'linear', tokens: 5000 },
  { serverName: 'linear', tokens: 4000 },
  { serverName: 'claude.ai Gmail', tokens: 3000 },
  { serverName: 'posthog', tokens: 2000, isLoaded: false },
]

export const withBreakdown = (usage: SessionUsage, tools: typeof TOOLS): SessionUsage => ({
  ...usage,
  context: { ...usage.context, breakdown: breakdownOf(tools) },
})

export const PANE_PROPS = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

export type Engine = Parameters<TestBody>[0]

export const bandTexts = async ($: Engine, bodyColumns = 160) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns } })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text?.trim())
  await ui.unmount()

  return texts
}

// What every test below stands on: a clock, a cleared session, and the bottoms the mod's hooks reach.
export const begin = async ($: Engine, on: Parameters<TestBody>[1], usage: () => SessionUsage) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: usage() }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's' }))
  await $.session.end({ reason: 'clear', sessionId: 's', resume: { id: '' } })

  return clock
}

export const limitsAt = (fiveHour: number, tokens = 50_000): SessionUsage => ({
  ...usageAt(tokens),
  rateLimits: [{ kind: 'five_hour', percentUsed: fiveHour, resetsAt: '2026-10-04T14:30:00' }],
})

export const SPENT = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }

export const paneTexts = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'usage-metrics', component: 'Pane', requestId: 'usage-metrics', props: PANE_PROPS, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text?.trim()).filter(text => text !== '')
  await ui.unmount()

  return texts
}
