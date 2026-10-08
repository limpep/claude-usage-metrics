import type { Cache, Detail, History, Row, Snapshot, Subagents, Tools, ToolUse, TurnRow } from '../types'
import type { Drawn } from './band'
import {
  formatChange,
  formatCost,
  formatDuration,
  formatSeconds,
  formatShare,
  formatTokens,
  labelOf,
  peakLine,
  plural,
  stepOf,
  tallChart,
  tokensOf,
} from './format'
import { daysTo, HISTORY_DAYS } from './history'

const CHART_ROWS = 4
const LISTED = 8
const TURNS_LISTED = 5
const TOOLS_LISTED = 5
const HISTORY_KINDS = ['five_hour', 'seven_day']

export type PaneFigures = {
  usage: Snapshot
  detail: Detail | null
  turns: readonly number[]
  history: History
  time: number
  turnLog: readonly TurnRow[]
  cache: Cache
  tools: Tools
  subagents: Subagents
}

const heading = (text: string): Drawn[] => [{ text: '' }, { text, isBold: true }]

const row = (name: string, tokens: number, note = ''): Drawn => ({
  text: `${formatTokens(tokens).padStart(7)}  ${name}${note}`,
})

const none: Drawn = { text: 'none', isDim: true }

const baseName = (path: string): string => path.split('/').slice(-2).join('/')

const listed = (title: string, rows: readonly Row[], note: (row: Row) => string = () => ''): Drawn[] =>
  rows.length === 0 ? [] : [...heading(`${title} (${rows.length})`), ...rows.slice(0, LISTED).map(one => row(one.name, one.tokens, note(one)))]

// The heaviest first: `Read ×4 · ≈31k`.
export const toolLine = (use: ToolUse): string | undefined => {
  const heaviest = Object.entries(use)
    .sort(([, one], [, other]) => other.chars - one.chars)
    .slice(0, TOOLS_LISTED)
    .map(([tool, { calls, chars }]) => `${tool} ×${calls} · ≈${formatTokens(tokensOf(chars))}`)

  return heaviest.length === 0 ? undefined : heaviest.join('   ')
}

const turnLine = (turn: TurnRow, number: number): Drawn => {
  const cache = turn.cacheRead === undefined || turn.input === undefined ? undefined : formatShare(turn.cacheRead, turn.input)

  return {
    text: [
      `#${number}`.padEnd(4),
      formatSeconds(turn.durationMs).padStart(7),
      formatChange(turn.added).padStart(9),
      (turn.cost === undefined ? '' : formatCost(turn.cost)).padStart(7),
      cache === undefined ? '' : `  cache ${cache}`,
    ].join(' '),
  }
}

// The pane, one line per row: the fill, the session, the chart, the history,
// the recent turns and their tools, then the breakdown.
export const linesOf = ({ usage, detail, turns, history, time, turnLog, cache, tools, subagents }: PaneFigures): Drawn[] => {
  const percent = usage.percent ?? 0
  const step = stepOf(percent)
  const fill = usage.tokens === undefined ? '-' : formatTokens(usage.tokens)
  const days = daysTo(time, HISTORY_DAYS)
  const cached = formatShare(cache.read, cache.input)
  const session = [
    ...(usage.startedAt === undefined ? [] : [`session ${formatDuration(Math.max(0, time - usage.startedAt))}`]),
    ...(usage.cost === undefined ? [] : [formatCost(usage.cost)]),
    ...(detail === null ? [] : [detail.model]),
    ...(cached === undefined ? [] : [`cache ${cached}`]),
  ]
  const lastTools = toolLine(tools.last)
  const sessionTools = toolLine(tools.session)
  const first = turnLog.length - Math.min(TURNS_LISTED, turnLog.length)

  return [
    { text: `${step.icon} ${percent}%  ${fill} / ${formatTokens(usage.window)}`, color: step.color, isBold: true },
    ...(session.length === 0 ? [] : [{ text: session.join(' · '), isDim: true }]),
    ...(subagents.turns === 0
      ? []
      : [{ text: `subagents ${plural(subagents.turns, 'turn')} · ${formatTokens(subagents.tokens)} tokens`, isDim: true }]),
    ...(turns.length === 0
      ? []
      : [
          ...heading(`Context per turn (last ${turns.length})`),
          ...tallChart(turns, usage.window, CHART_ROWS).map(text => ({ text, color: step.color })),
        ]),
    ...heading(`Daily peak, last ${HISTORY_DAYS} days`),
    ...HISTORY_KINDS.map(kind => {
      const today = history[days.at(-1) ?? '']?.[kind]

      return {
        text: `${labelOf(kind).padEnd(3)}${peakLine(days.map(day => history[day]?.[kind]))}  ${today === undefined ? '-' : `${Math.round(today)}% today`}`,
        color: today === undefined ? undefined : stepOf(today).color,
      }
    }),
    ...(turnLog.length === 0
      ? []
      : [...heading('Recent turns'), ...turnLog.slice(first).map((turn, index) => turnLine(turn, first + index + 1))]),
    ...(sessionTools === undefined
      ? []
      : [
          ...heading('Tool results (estimated)'),
          ...(lastTools === undefined ? [] : [{ text: `last turn  ${lastTools}` }]),
          { text: `session    ${sessionTools}` },
        ]),
    ...(detail === null
      ? []
      : [
          ...heading('Context by category'),
          ...detail.categories.map(category =>
            row(category.name, category.tokens, category.kind === 'deferred' ? ' (on demand)' : ''),
          ),
          ...heading(`MCP servers (${detail.servers.length})`),
          ...(detail.servers.length === 0 ? [none] : []),
          ...detail.servers.slice(0, LISTED).map(server => row(server.name, server.tokens, ` (${plural(server.tools, 'tool')})`)),
          ...listed('Skills', detail.skills),
          ...listed('Agents', detail.agents),
          ...heading(`Memory files (${detail.memoryFiles.length})`),
          ...(detail.memoryFiles.length === 0 ? [none] : []),
          ...detail.memoryFiles.slice(0, LISTED).map(file => row(baseName(file.name), file.tokens, ` (${file.type})`)),
        ]),
  ]
}

// The two files `/usage-metrics export` writes, as rows.
export const historyRows = (history: History): (string | number | undefined)[][] => {
  const kinds = [...new Set(Object.values(history).flatMap(day => Object.keys(day)))].sort()

  return [['day', ...kinds], ...Object.keys(history).sort().map(day => [day, ...kinds.map(kind => history[day]?.[kind])])]
}

export const turnRows = (turnLog: readonly TurnRow[]): (string | number | undefined)[][] => [
  ['turn', 'ended_at', 'duration_s', 'context_tokens', 'added_tokens', 'cost_usd', 'input_tokens', 'cache_read_tokens'],
  ...turnLog.map((turn, index) => [
    index + 1,
    new Date(turn.at).toISOString(),
    Math.round(turn.durationMs / 1000),
    turn.tokens,
    turn.added,
    turn.cost === undefined ? undefined : turn.cost.toFixed(4),
    turn.input,
    turn.cacheRead,
  ]),
]
