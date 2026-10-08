import { expect, test } from 'claude-code/testing'

import { alertsFor } from '../hooks/alerts'
import { toConfig } from '../hooks/options'
import { WINDOW, NOW, TURN, begin, limitsAt, SPENT } from './helpers'

test('toasts once as a limit crosses each threshold, and again after it reset', async ($, on) => {
  const toasts: string[] = []
  let fiveHour = 40
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await begin($, on, () => limitsAt(fiveHour))

  for (const percent of [40, 76, 80, 91, 95, 10, 78]) {
    fiveHour = percent
    await $.turn.complete(TURN)
  }

  expect(toasts).toEqual([
    '5h limit 76% used · resets in 2h 14m',
    '5h limit 91% used · resets in 2h 14m',
    '5h limit 78% used · resets in 2h 14m',
  ])
})

test('toasts for the context, with the compaction hint from 85%', async ($, on) => {
  const toasts: string[] = []
  let tokens = 100_000
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await begin($, on, () => limitsAt(10, tokens))

  for (const filled of [100_000, 152_000, 172_000, 182_000, 190_000]) {
    tokens = filled
    await $.turn.complete(TURN)
  }

  expect(toasts).toEqual(['Context 76% full', 'Context 86% full · /compact frees room', 'Context 91% full'])
})

test('stays quiet with toasts switched off', { options: { toasts: false } }, async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await begin($, on, () => limitsAt(95, 190_000))
  await $.turn.complete(TURN)

  expect(toasts).toEqual([])
})

test('decides alerts from the levels held before', () => {
  const config = toConfig({})
  const usage = { window: WINDOW, percent: 80, limits: [{ kind: 'seven_day', percentUsed: 92 }] }

  expect(alertsFor({}, usage, NOW, config)).toEqual({
    levels: { compact: 0, context: 1, seven_day: 2 },
    toasts: ['Context 80% full', '7d limit 92% used'],
  })
  expect(alertsFor({ context: 1, seven_day: 2 }, usage, NOW, config).toasts).toEqual([])
})

test('toasts once when the cache share of input falls under half', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await begin($, on, () => limitsAt(10))

  // 10k of input a turn: 9k cached, then two cold turns take the share to 45% and 30%;
  // a warm one lifts it over half, and the next cold one does not bring it back under.
  for (const read of [9000, 0, 0, 60_000, 0]) {
    await $.turn.complete({ ...TURN, usage: { ...SPENT, input_tokens: 10_000 - Math.min(read, 9000), cache_read_input_tokens: read } })
  }

  expect(toasts).toEqual(['Prompt cache down to 45% of input this session'])
})
