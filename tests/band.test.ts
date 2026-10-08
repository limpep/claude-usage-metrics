import { expect, mock, test } from 'claude-code/testing'

import { fit } from '../hooks/band'
import { BAND, usageAt, NOW, MINUTE, HOUR, TURN, TOOLS, withBreakdown, bandTexts, begin } from './helpers'

test('draws the fill, the chart, the last turn and the resets on one line', async ($, on) => {
  let tokens = 36_100
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: usageAt(tokens) }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's' }))

  for (const surface of ['terminal', 'desktop'] as const) {
    tokens = 36_100
    await $.session.end({ reason: 'clear', sessionId: 's', resume: { id: '' } })
    await $.turn.complete(TURN)
    tokens = 134_400
    await $.turn.complete(TURN)

    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text?.trim())

    expect(texts).toEqual([
      '◑ 67%',
      '134.4k / 200k',
      '▂▆',
      '▲ +98.3k last turn',
      '5h 24% ↻ 2h 14m (14:30)',
      '7d 91% ↻ 4d 20h (Oct 9 09:05) · 4d 5h over pace',
    ])
    await ui.unmount()
  }
})

test('leaves out what a narrow band has no room for', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: usageAt(190_000) }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's' }))
  await $.turn.complete(TURN)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 24 } })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text?.trim())

  expect(texts).toEqual(['● 95%', '190k / 200k', '█'])
  await ui.unmount()
})

test('a subagent turn adds nothing to the chart', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: usageAt(50_000) }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's' }))
  await $.turn.complete(TURN)
  await $.turn.complete({ ...TURN, agentId: 'a1' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.findAll({ type: 'Text' }))[2]?.text?.trim()).toBe('▃')
  await ui.unmount()
})

test('counts the reset down while the session sits idle', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: usageAt(50_000) }))
  on('session.start', () => ({ cwd: '/' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const resets = async () => (await ui.findAll({ type: 'Text' })).map(found => found.text?.trim()).slice(-2)

  expect(await resets()).toEqual(['5h 24% ↻ 2h 14m (14:30)', '7d 91% ↻ 4d 20h (Oct 9 09:05) · 4d 5h over pace'])
  await clock.advance(90 * MINUTE)
  expect(await resets()).toEqual(['5h 24% ↻ 44m (14:30)', '7d 91% ↻ 4d 19h (Oct 9 09:05) · 4d 4h over pace'])
  await clock.advance(HOUR)
  expect(await resets()).toEqual(['5h 24% ↻ now (14:30)', '7d 91% ↻ 4d 18h (Oct 9 09:05) · 4d 3h over pace'])
  await ui.unmount()
})

test('counts the MCP servers behind the tools, each once, with the weight of their loaded schemas', async ($, on) => {
  let tools = TOOLS
  await begin($, on, () => withBreakdown(usageAt(50_000), tools))
  await $.turn.complete(TURN)

  expect((await bandTexts($)).at(-1)).toBe('MCP 3 · 12k')

  tools = []
  await $.turn.complete(TURN)

  expect((await bandTexts($)).at(-1)).toBe('MCP 0')
})

test('shows no MCP count where the session gives no breakdown', async ($, on) => {
  await begin($, on, () => usageAt(50_000))
  await $.turn.complete(TURN)

  expect((await bandTexts($)).at(-1)).toBe('7d 91% ↻ 4d 20h (Oct 9 09:05) · 4d 5h over pace')
})

test('shows the session cost after the limits, where the session has one', async ($, on) => {
  await begin($, on, () => ({ ...usageAt(50_000), cost: { usd: 1.837 } }))
  await $.turn.complete(TURN)

  expect((await bandTexts($)).slice(-2)).toEqual(['7d 91% ↻ 4d 20h (Oct 9 09:05) · 4d 5h over pace', '$1.84'])
})

test('draws only the segments asked for, in that order', { options: { segments: 'limits, cost,nonsense,context' } }, async ($, on) => {
  await begin($, on, () => ({ ...usageAt(50_000), cost: { usd: 2 } }))
  await $.turn.complete(TURN)

  expect(await bandTexts($)).toEqual(['5h 24% ↻ 2h 14m (14:30)', '7d 91% ↻ 4d 20h (Oct 9 09:05) · 4d 5h over pace', '$2.00', '◔ 25%'])
})

test('shortens segments before it leaves any out', async ($, on) => {
  await begin($, on, () => usageAt(50_000))
  await $.turn.complete(TURN)
  await $.turn.complete(TURN)

  // 118 columns whole: at 80 every segment still shows, each at its shortest.
  expect(await bandTexts($, 80)).toEqual(['◔ 25%', '50k / 200k', '▃▃', '▲ +0', '5h 24% ↻ 2h 14m', '7d 91% ↻ 4d 20h'])
  expect(fit([{ text: 'aaaa' }, { text: 'bbbbbbbb', short: 'bb' }, { text: 'cccc' }], 9).map(one => one.text)).toEqual(['aaaa', 'bb'])
})
