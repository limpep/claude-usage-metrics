import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit, Timer } from 'claude-code'

import type { History, Snapshot, ToolUse } from '../types'
import { alertsFor } from './alerts'
import { fit, GAP, segmentsOf } from './band'
import { toDetail, toMcp } from './detail'
import { isHistory, merge, risen } from './history'
import { toConfig } from './options'
import type { Config } from './options'
import { addSample } from './pace'
import { formatShare, toCsv } from './format'
import { historyRows, linesOf, turnRows } from './pane'

const KEPT_TURNS = 60
const TICK_MS = 60_000
const TOAST_MS = 8000
const PANE = 'usage-metrics'
const HISTORY_KEY = 'history'
const CACHE_LOW = 50
const HISTORY_FILE = 'usage-metrics-history.csv'
const TURNS_FILE = 'usage-metrics-turns.csv'
const NO_TOOLS = { session: {}, turn: {}, last: {} }

const snapshot = atom({ plugin: 'usage-metrics', key: 'snapshot' } as const, null)
const turns = atom({ plugin: 'usage-metrics', key: 'turns' } as const, [])
const lastDelta = atom({ plugin: 'usage-metrics', key: 'lastDelta' } as const, null)
const now = atom({ plugin: 'usage-metrics', key: 'now' } as const, null)
const mcp = atom({ plugin: 'usage-metrics', key: 'mcp' } as const, null)
const detail = atom({ plugin: 'usage-metrics', key: 'detail' } as const, null)
const samples = atom({ plugin: 'usage-metrics', key: 'samples' } as const, {})
const alerted = atom({ plugin: 'usage-metrics', key: 'alerted' } as const, {})
const history = atom({ plugin: 'usage-metrics', key: 'history' } as const, {})
const turnLog = atom({ plugin: 'usage-metrics', key: 'turnLog' } as const, [])
const cache = atom({ plugin: 'usage-metrics', key: 'cache' } as const, { read: 0, input: 0 })
const tools = atom({ plugin: 'usage-metrics', key: 'tools' } as const, NO_TOOLS)
const subagents = atom({ plugin: 'usage-metrics', key: 'subagents' } as const, { turns: 0, tokens: 0 })

const counted = (use: ToolUse, tool: string, chars: number): ToolUse => ({
  ...use,
  [tool]: { calls: (use[tool]?.calls ?? 0) + 1, chars: (use[tool]?.chars ?? 0) + chars },
})

type Figures = {
  context: SessionContextUsage
  rateLimits: readonly SessionRateLimit[]
  cost?: SessionCost
  startedAt?: number
}

let ticking: Timer | undefined

// The band redraws on a write, so the countdowns move only as this one does.
const tick = async ($: EngineInterface): Promise<void> => {
  const time = await $.clock.now()
  await update($, now, () => time)
}

// Empty where there is no store, or it holds something else.
const storedHistory = async ($: EngineInterface): Promise<History> => {
  try {
    const value = await $.store.get(HISTORY_KEY)

    return isHistory(value) ? value : {}
  } catch {
    return {}
  }
}

// Every figure the mod keeps follows from one reading: the snapshot, the MCP
// servers, the pace samples, the toasts a crossing raises, and the day's peaks.
const record = async ($: EngineInterface, figures: Figures, config: Config): Promise<Snapshot> => {
  const { context, rateLimits, cost } = figures
  const time = await $.clock.now()
  const held = await read($, snapshot)
  const usage: Snapshot = {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
    limits: rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    cost: cost?.usd ?? held?.cost,
    startedAt: figures.startedAt ?? held?.startedAt,
  }

  // The last breakdown stays where a reading comes without one.
  if (context.breakdown !== undefined) {
    const parts = toDetail(context.breakdown)
    await update($, detail, () => parts)
    await update($, mcp, () => toMcp(parts))
  }

  await update($, now, () => time)
  await update($, snapshot, () => usage)
  await update($, samples, kept =>
    Object.fromEntries(
      usage.limits.map(limit => [limit.kind, addSample(kept[limit.kind] ?? [], { at: time, percent: limit.percentUsed })]),
    ),
  )

  const { levels, toasts } = alertsFor(await read($, alerted), usage, time, config)
  await update($, alerted, kept => ({ ...kept, ...levels }))

  for (const text of toasts) {
    $.ui.toast(text, { timeoutMs: TOAST_MS })
  }

  // Written only when a peak rose, and over what another session stored meanwhile.
  const higher = risen(await read($, history), usage.limits, time)

  if (Object.keys(higher).length > 0) {
    const peaks = merge(merge(await read($, history), await storedHistory($)), higher)
    await update($, history, () => peaks)

    try {
      await $.store.set(HISTORY_KEY, peaks)
    } catch {
      // No store here: the history lasts the session.
    }
  }

  return usage
}

// Absent where the session has no figures to give; the band then waits for session.measure.
const measure = async ($: EngineInterface, config: Config): Promise<Snapshot | undefined> => {
  let figures: Figures

  try {
    figures = await $.session.usage({ breakdown: 'summary' })
  } catch {
    return undefined
  }

  return record($, figures, config)
}

export const register: Register = (on, options) => {
  const config = toConfig(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const kept = await storedHistory($)
    await update($, history, held => merge(held, kept))

    try {
      await $.command.register({ name: PANE, description: 'Open or close the usage pane; `export` writes the history and turns as CSV' })
    } catch {
      // No session to list a command in: the band still draws.
    }

    await tick($)
    ticking?.cancel()
    ticking = $.clock.every(TICK_MS, () => void tick($))

    const measured = await measure($, config)

    // A resumed or reloaded session: the fill so far is the first turn's baseline.
    if (measured?.tokens !== undefined) {
      const baseline = measured.tokens
      await update($, turns, list => (list.length === 0 ? [baseline] : list))
    }

    return started
  })

  on('session.measure', async ($, e, next) => {
    await record($, e, config)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)

    const spent = e.usage
    const input = spent === undefined ? undefined : spent.input_tokens + spent.cache_read_input_tokens + spent.cache_creation_input_tokens

    // A subagent's turn fills its own context: counted apart, never charted.
    if (e.agentId !== undefined) {
      const tokens = input === undefined || spent === undefined ? 0 : input + spent.output_tokens
      await update($, subagents, held => ({ turns: held.turns + 1, tokens: held.tokens + tokens }))

      return completed
    }

    await update($, tools, held => ({ session: held.session, turn: {}, last: held.turn }))

    if (input !== undefined && spent !== undefined) {
      const read = spent.cache_read_input_tokens
      await update($, cache, held => ({ read: held.read + read, input: held.input + input }))
    }

    const costBefore = (await read($, snapshot))?.cost
    const measured = await measure($, config)

    if (measured?.tokens === undefined) {
      return completed
    }

    const tokens = measured.tokens
    const before = (await read($, turns)).at(-1) ?? 0
    const at = await $.clock.now()
    const row = {
      at,
      durationMs: e.durationMs,
      tokens,
      added: tokens - before,
      // The rise since the last reading; unknown for the first turn after a /clear.
      cost: measured.cost === undefined || costBefore === undefined ? undefined : Math.max(0, measured.cost - costBefore),
      cacheRead: spent?.cache_read_input_tokens,
      input,
    }
    await update($, turns, list => [...list, tokens].slice(-KEPT_TURNS))
    await update($, lastDelta, () => tokens - before)
    await update($, turnLog, list => [...list, row].slice(-KEPT_TURNS))

    // Once per fall: armed again when the share is back above the line.
    const share = await read($, cache)
    const isLow = share.input > 0 && (share.read / share.input) * 100 < CACHE_LOW
    const wasLow = ((await read($, alerted)).cache ?? 0) === 1
    await update($, alerted, kept => ({ ...kept, cache: isLow ? 1 : 0 }))

    if (isLow && !wasLow && config.hasToasts && config.hasCacheToast && (await read($, turnLog)).length > 1) {
      $.ui.toast(`Prompt cache down to ${formatShare(share.read, share.input)} of input this session`, { timeoutMs: TOAST_MS })
    }

    return completed
  })

  // What each tool returned to the main loop, by size: the engine counts no tokens for a result.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)

    // The count must never cost the call its result.
    try {
      if (e.agentId === undefined) {
        const chars = typeof ran.text === 'string' ? ran.text.length : (JSON.stringify(ran.result ?? '') ?? '').length
        await update($, tools, held => ({
          session: counted(held.session, e.tool, chars),
          turn: counted(held.turn, e.tool, chars),
          last: held.last,
        }))
      }
    } catch {
      // Uncounted.
    }

    return ran
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, snapshot, () => null)
      await update($, turns, () => [])
      await update($, lastDelta, () => null)
      await update($, mcp, () => null)
      await update($, detail, () => null)
      await update($, turnLog, () => [])
      await update($, cache, () => ({ read: 0, input: 0 }))
      await update($, tools, () => NO_TOOLS)
      await update($, subagents, () => ({ turns: 0, tokens: 0 }))
      // The context starts over; the account's windows do not.
      await update($, alerted, levels => ({ ...levels, context: 0, compact: 0 }))
    }

    return next(e)
  })

  // The command toggles: a second run closes the pane the first opened.
  on('command.run', { command: PANE }, async ($, e) => {
    if (e.args.trim() === 'export') {
      const cwd = await $.session.cwd()
      await $.fs.write(`${cwd}/${HISTORY_FILE}`, toCsv(historyRows(await read($, history))))
      await $.fs.write(`${cwd}/${TURNS_FILE}`, toCsv(turnRows(await read($, turnLog))))

      return { text: `Wrote ${cwd}/${HISTORY_FILE} and ${cwd}/${TURNS_FILE}.` }
    }

    const isOpen = (await $.ui.panes()).some(open => open.id === PANE)

    if (isOpen) {
      await $.ui.close({ id: PANE })

      return { text: 'Usage pane closed.' }
    }

    await $.ui.open({ id: PANE, title: 'Usage' })

    return { text: 'Usage pane opened. Run /usage-metrics again to close it.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await read($, snapshot)

    if (e.props.hasSurvey || usage === null) {
      return next(e)
    }

    const figures = {
      usage,
      turns: await read($, turns),
      delta: await read($, lastDelta),
      time: (await read($, now)) ?? (await $.clock.now()),
      mcp: await read($, mcp),
      samples: await read($, samples),
    }
    const shown = fit(segmentsOf(figures, config), e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {shown.map((segment, index) => (
          <Text key={`segment-${index}`} color={segment.color} bold={segment.isBold} dimColor={segment.isDim} wrap="truncate-end">
            {index === 0 ? '' : ' '.repeat(GAP)}
            {segment.text}
          </Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const usage = await read($, snapshot)
    const { Box, Text, Button } = $.ui.resolve(e)

    if (usage === null) {
      return (
        <Box>
          <Text dimColor>No usage figures yet.</Text>
        </Box>
      )
    }

    const lines = linesOf({
      usage,
      detail: await read($, detail),
      turns: await read($, turns),
      history: await read($, history),
      time: (await read($, now)) ?? (await $.clock.now()),
      turnLog: await read($, turnLog),
      cache: await read($, cache),
      tools: await read($, tools),
      subagents: await read($, subagents),
    })

    // Every line drawn: the pane's window is the engine's to scroll.
    return (
      <Box flexDirection="column">
        <Box>
          <Button key="compact" hotkey="c" onPress={() => void $.session.compact()}>
            Compact now
          </Button>
          <Text> </Text>
          <Button key="close" hotkey="x" role="dismiss" onPress={() => void $.ui.close({ id: PANE })}>
            Close
          </Button>
        </Box>
        {lines.map((line, index) => (
          <Text key={`line-${index}`} color={line.color} bold={line.isBold} dimColor={line.isDim} wrap="truncate-end">
            {line.text === '' ? ' ' : line.text}
          </Text>
        ))}
      </Box>
    )
  })
}
