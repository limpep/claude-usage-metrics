import { expect, test } from 'claude-code/testing'

import { addSample, fullIn, overPace } from '../hooks/pace'
import { NOW, MINUTE, DAY, TURN, bandTexts, begin, limitsAt } from './helpers'

test('warns on a limit when the pace would fill it before it resets', async ($, on) => {
  let fiveHour = 50
  const clock = await begin($, on, () => limitsAt(fiveHour))
  await $.turn.complete(TURN)

  expect((await bandTexts($)).at(-1)).toBe('5h 50% ↻ 2h 14m (14:30)')

  // 20 points in 20 minutes: the 30 left go in another 30, well before the reset.
  await clock.advance(20 * MINUTE)
  fiveHour = 70
  await $.turn.complete(TURN)

  expect((await bandTexts($)).at(-1)).toBe('5h 70% ↻ 1h 54m (14:30) ⚠ ~30m')
})

test('projects the pace only when it is known and beats the reset', () => {
  const at = '2026-10-04T14:30:00'
  const rising = [
    { at: NOW, percent: 50 },
    { at: NOW + 20 * MINUTE, percent: 70 },
  ]

  expect(fullIn(rising, at, NOW + 20 * MINUTE)).toBe(30 * MINUTE)
  expect(fullIn(rising, at, NOW + 25 * MINUTE)).toBe(25 * MINUTE)
  // Too short a span, a flat pace, a pace that reaches full after the reset, a stale one.
  expect(fullIn([rising[0]!, { at: NOW + 5 * MINUTE, percent: 70 }], at, NOW + 5 * MINUTE)).toBe(undefined)
  expect(fullIn([rising[0]!, { at: NOW + 20 * MINUTE, percent: 50 }], at, NOW + 20 * MINUTE)).toBe(undefined)
  expect(fullIn([rising[0]!, { at: NOW + 20 * MINUTE, percent: 52 }], at, NOW + 20 * MINUTE)).toBe(undefined)
  expect(fullIn(rising, at, NOW + 55 * MINUTE)).toBe(undefined)
  expect(fullIn(rising, undefined, NOW + 20 * MINUTE)).toBe(undefined)
})

test('keeps an hour of samples and starts over when a window resets', () => {
  const first = { at: NOW, percent: 10 }

  expect(addSample([first], { at: NOW + 30_000, percent: 11 })).toEqual([first])
  expect(addSample([first], { at: NOW + 61 * MINUTE, percent: 20 })).toEqual([{ at: NOW + 61 * MINUTE, percent: 20 }])
  expect(addSample([first], { at: NOW + 5 * MINUTE, percent: 2 })).toEqual([{ at: NOW + 5 * MINUTE, percent: 2 }])
})

test('notes a 7-day window only when use runs an hour or more ahead of an even pace', () => {
  const at = '2026-10-09T09:05:00'
  const reset = new Date(at).getTime()
  const halfway = reset - 3.5 * DAY

  expect(overPace('seven_day', 75, at, halfway)).toBe(1.75 * DAY)
  expect(overPace('seven_day', 50, at, halfway)).toBe(undefined)
  expect(overPace('seven_day', 20, at, halfway)).toBe(undefined)
  expect(overPace('five_hour', 99, at, halfway)).toBe(undefined)
  expect(overPace('seven_day', 75, undefined, halfway)).toBe(undefined)
})
