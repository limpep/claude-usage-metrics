import { expect, mock, test } from 'claude-code/testing'
import type { SessionContextBreakdown } from 'claude-code'

import { dayOf } from '../hooks/history'
import { toolLine } from '../hooks/pane'
import { usageAt, NOW, MINUTE, TURN, TOOLS, withBreakdown, PANE_PROPS, begin, limitsAt, SPENT, paneTexts } from './helpers'

test('the /usage-metrics command opens a pane with the breakdown and the history', async ($, on) => {
  const opened: string[] = []
  mock.store(on, { history: { '2026-10-03': { five_hour: 80, seven_day: 60 } } })
  on('session.start', () => ({ cwd: '/' }))
  on('command.register', () => ({ value: { name: 'usage-metrics' } }) as never)
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: opened.map(id => ({ id, title: 'Usage', isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('ui.close', (_, e) => {
    opened.splice(opened.indexOf(e.id), 1)

    return { value: undefined }
  })
  on('command.run', () => ({}))
  await begin($, on, () => ({ ...withBreakdown(usageAt(50_000), TOOLS), startedAt: NOW - 72 * MINUTE, cost: { usd: 1.5 } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'usage-metrics', args: '', origin: 'user', presentation: 'inline' } as never)

  expect(opened).toEqual(['usage-metrics'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-metrics', component: 'Pane', requestId: 'usage-metrics', props: PANE_PROPS, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text?.trim()).filter(text => text !== '')
    await ui.unmount()

    expect(texts.slice(0, 2)).toEqual(['◔ 25%  50k / 200k', 'session 1h 12m · $1.50 · Opus 5.5'])
    expect(texts).toContain('30k  Messages')
    expect(texts).toContain('2k  MCP tools (deferred) (on demand)')
    expect(texts).toContain('MCP servers (3)')
    expect(texts).toContain('9k  linear (2 tools)')
    expect(texts).toContain('0  posthog (1 tool)')
    expect(texts).toContain('1.2k  project/CLAUDE.md (Project)')
    expect(texts).toContain(`5h ${'·'.repeat(28)}▇▂  24% today`)
    expect(texts).toContain(`7d ${'·'.repeat(28)}▅█  91% today`)
  }

  // A second run of the command closes it.
  await $.command.run({ command: 'usage-metrics', args: '', origin: 'user', presentation: 'inline' } as never)

  expect(opened).toEqual([])
})

test('the pane lists recent turns, the cache share, tool results, subagents, skills and agents', async ($, on) => {
  let tokens = 40_000
  let usd = 1
  const full = withBreakdown(usageAt(0), TOOLS)
  const breakdown = {
    ...full.context.breakdown,
    agents: [{ agentType: 'reviewer', source: 'project', tokens: 300 }],
    skills: { totalSkills: 1, includedSkills: 1, tokens: 700, skillFrontmatter: [{ name: 'deploy', source: 'user', tokens: 700 }] },
  } as SessionContextBreakdown
  on('tool.call', (_, e) => ({ result: {}, text: 'x'.repeat(e.tool === 'Read' ? 8000 : 400) }) as never)
  const clock = await begin($, on, () => {
    const usage = usageAt(tokens)

    return { ...usage, startedAt: NOW, cost: { usd }, context: { ...usage.context, breakdown } }
  })
  await $.turn.complete({ ...TURN, usage: { ...SPENT, cache_read_input_tokens: 9000 } })

  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  await $.tool.call({ tool: 'Read', file_path: 'b.md' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete({ ...TURN, agentId: 'a1', usage: { ...SPENT, cache_read_input_tokens: 3500 } })
  await clock.advance(MINUTE)
  tokens = 52_000
  usd = 1.25
  await $.turn.complete({ ...TURN, durationMs: 95_000, usage: { ...SPENT, cache_read_input_tokens: 3000 } })

  const texts = await paneTexts($)

  // 12k of 14k input read from the cache over the two main turns.
  expect(texts[1]).toBe('session 1m · $1.25 · Opus 5.5 · cache 86%')
  expect(texts[2]).toBe('subagents 1 turn · 5k tokens')
  // The first turn after a /clear has no earlier cost to measure its own from.
  const rows = texts.map(text => text?.replace(/ +/g, ' '))
  expect(rows).toContain('#1 0s ▲ +40k cache 90%')
  expect(rows).toContain('#2 1m 35s ▲ +12k $0.25 cache 75%')
  expect(texts).toContain('3k  claude.ai Gmail (1 tool)')
  expect(texts).toContain('last turn  Read ×2 · ≈4k   Bash ×1 · ≈100')
  expect(texts).toContain('session    Read ×2 · ≈4k   Bash ×1 · ≈100')
  expect(texts).toContain('Skills (1)')
  expect(texts).toContain('700  deploy')
  expect(texts).toContain('Agents (1)')
  expect(texts).toContain('300  reviewer')
})

test('orders tools by what they returned', () => {
  expect(toolLine({ Bash: { calls: 9, chars: 4000 }, Read: { calls: 1, chars: 40_000 } })).toBe('Read ×1 · ≈10k   Bash ×9 · ≈1k')
  expect(toolLine({})).toBe(undefined)
})

test("the pane's buttons compact the session and close the pane", async ($, on) => {
  const done: string[] = []
  on('session.compact', () => {
    done.push('compact')

    return { skip: 'test' }
  })
  on('ui.close', (_, e) => {
    done.push(`close ${e.id}`)

    return { value: undefined }
  })
  await begin($, on, () => usageAt(50_000))
  await $.turn.complete(TURN)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-metrics', component: 'Pane', requestId: 'usage-metrics', props: PANE_PROPS, surface })
    await ui.press({ key: 'compact' })
    await ui.press({ key: 'close' })
    await ui.unmount()
  }

  expect(done).toEqual(['compact', 'close usage-metrics', 'compact', 'close usage-metrics'])
})

test('/usage-metrics export writes the history and the turns as CSV', async ($, on) => {
  const files: Record<string, string> = {}
  let tokens = 40_000
  on('fs.write', (_, e) => {
    files[e.path] = e.text

    return { value: undefined }
  })
  on('session.cwd', () => ({ value: '/work' }))
  on('command.run', () => ({}))
  await begin($, on, () => ({ ...limitsAt(30, tokens), cost: { usd: 0.5 } }))
  await $.turn.complete({ ...TURN, durationMs: 2000, usage: { ...SPENT, input_tokens: 1000, cache_read_input_tokens: 9000 } })
  tokens = 41_000
  await $.turn.complete({ ...TURN, durationMs: 3000 })
  const ran = await $.command.run({ command: 'usage-metrics', args: ' export ', origin: 'user', presentation: 'inline' } as never)

  expect(ran.text).toBe('Wrote /work/usage-metrics-history.csv and /work/usage-metrics-turns.csv.')
  expect(files['/work/usage-metrics-history.csv']).toBe(`day,five_hour\n${dayOf(NOW)},30\n`)
  expect(files['/work/usage-metrics-turns.csv']).toBe(
    [
      'turn,ended_at,duration_s,context_tokens,added_tokens,cost_usd,input_tokens,cache_read_tokens',
      `1,${new Date(NOW).toISOString()},2,40000,40000,,10000,9000`,
      `2,${new Date(NOW).toISOString()},3,41000,1000,0.0000,,`,
      '',
    ].join('\n'),
  )
})
