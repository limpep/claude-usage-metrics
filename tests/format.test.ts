import { expect, test } from 'claude-code/testing'

import { formatRemaining, formatResetTime, tallChart, toCsv } from '../hooks/format'
import { historyRows, turnRows } from '../hooks/pane'
import { NOW, MINUTE, HOUR, DAY } from './helpers'

test('formats what is left in its two largest units', () => {
  const at = '2026-10-09T09:05:00'
  const reset = new Date(at).getTime()
  const left = (ms: number) => formatRemaining(at, reset - ms)

  expect(left(3 * DAY + 4 * HOUR + 59 * MINUTE)).toBe('3d 4h')
  expect(left(2 * DAY + 20 * MINUTE)).toBe('2d')
  expect(left(2 * HOUR + 14 * MINUTE + 59_000)).toBe('2h 14m')
  expect(left(HOUR)).toBe('1h')
  expect(left(45 * MINUTE)).toBe('45m')
  expect(left(59_000)).toBe('<1m')
  expect(left(0)).toBe('now')
  expect(left(-HOUR)).toBe('now')
  expect(formatRemaining('not a date', reset)).toBe(undefined)
})

test('a reset with an offset is the same instant in every timezone', () => {
  const now = Date.UTC(2026, 9, 4, 12, 0)

  expect(formatRemaining('2026-10-04T14:30:00Z', now)).toBe('2h 30m')
  expect(formatRemaining('2026-10-04T14:30:00+01:00', now)).toBe('1h 30m')
  expect(formatRemaining('2026-10-04T09:30:00-05:00', now)).toBe('2h 30m')
})

test('gives the reset as a local time, dated when it is not today', () => {
  expect(formatResetTime('2026-10-04T14:30:00', NOW)).toBe('14:30')
  expect(formatResetTime('2026-10-05T00:05:00', NOW)).toBe('Oct 5 00:05')
  expect(formatResetTime('not a date', NOW)).toBe(undefined)

  // An absolute instant lands on this machine's own wall clock.
  const at = new Date(Date.UTC(2026, 9, 4, 20, 0))
  const local = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  expect(formatResetTime('2026-10-04T20:00:00Z', at.getTime())).toBe(local)
})

test('draws the tall chart bottom-up, a small turn still showing', () => {
  expect(tallChart([1, 100_000, 200_000], 200_000, 2)).toEqual(['  █', '▁██'])
})

test('writes CSV rows, quoting where a cell needs it', () => {
  expect(toCsv([['a', 'b,c'], [1, undefined], ['say "hi"', 2]])).toBe('a,"b,c"\n1,\n"say ""hi""",2\n')
  expect(historyRows({ '2026-10-02': { seven_day: 5 }, '2026-10-01': { five_hour: 9 } })).toEqual([
    ['day', 'five_hour', 'seven_day'],
    ['2026-10-01', 9, undefined],
    ['2026-10-02', undefined, 5],
  ])
  expect(turnRows([]).length).toBe(1)
})
