import type { SessionContextBreakdown } from 'claude-code'

import type { Detail, Mcp, Row } from '../types'

const byTokens = (one: Row, other: Row): number => other.tokens - one.tokens

// A server's weight is the schemas inside the window: one loaded on demand weighs nothing yet.
export const toDetail = (breakdown: SessionContextBreakdown): Detail => {
  const servers = new Map<string, Row & { tools: number }>()

  for (const tool of breakdown.mcpTools) {
    const server = servers.get(tool.serverName) ?? { name: tool.serverName, tokens: 0, tools: 0 }
    servers.set(tool.serverName, {
      ...server,
      tools: server.tools + 1,
      tokens: server.tokens + (tool.isLoaded ? tool.tokens : 0),
    })
  }

  return {
    model: breakdown.model,
    categories: breakdown.categories.map(({ name, tokens, kind }) => ({ name, tokens, kind })),
    servers: [...servers.values()].sort(byTokens),
    memoryFiles: breakdown.memoryFiles.map(({ path, type, tokens }) => ({ name: path, type, tokens })).sort(byTokens),
    agents: (breakdown.agents ?? []).map(({ agentType, tokens }) => ({ name: agentType, tokens })).sort(byTokens),
    skills: (breakdown.skills?.skillFrontmatter ?? []).map(({ name, tokens }) => ({ name, tokens })).sort(byTokens),
  }
}

export const toMcp = (detail: Detail): Mcp => ({
  servers: detail.servers.length,
  tokens: detail.servers.reduce((sum, server) => sum + server.tokens, 0),
})
