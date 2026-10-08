export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  tokens?: number
  window: number
  percent?: number
  limits: Limit[]
  cost?: number
  startedAt?: number
}

export type Sample = { at: number; percent: number }

export type Mcp = { servers: number; tokens: number }

export type Row = { name: string; tokens: number }

export type Detail = {
  model: string
  categories: (Row & { kind: string })[]
  servers: (Row & { tools: number })[]
  memoryFiles: (Row & { type: string })[]
  agents: Row[]
  skills: Row[]
}

// One main-loop turn: when it ended, how long it ran, where it left the context,
// what it added, what the session's cost rose by, and its input read from the cache.
export type TurnRow = {
  at: number
  durationMs: number
  tokens: number
  added: number
  cost?: number
  cacheRead?: number
  input?: number
}

export type Cache = { read: number; input: number }

// Calls and the characters they returned, by tool name.
export type ToolUse = Record<string, { calls: number; chars: number }>

export type Tools = { session: ToolUse; turn: ToolUse; last: ToolUse }

export type Subagents = { turns: number; tokens: number }

// Each day's highest percentage per limit kind, keyed by local date (2026-10-08).
export type History = Record<string, Record<string, number>>

declare module 'claude-code' {
  interface PluginState {
    'usage-metrics': {
      snapshot: Snapshot | null
      turns: number[]
      lastDelta: number | null
      now: number | null
      mcp: Mcp | null
      detail: Detail | null
      samples: Record<string, Sample[]>
      alerted: Record<string, number>
      history: History
      turnLog: TurnRow[]
      cache: Cache
      tools: Tools
      subagents: Subagents
    }
  }
}
