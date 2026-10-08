import { expect, test } from 'claude-code/testing'

import { dayOf, merge } from '../hooks/history'
import { NOW, TURN, begin, limitsAt } from './helpers'

test('keeps each day\'s peak in the store, over what another session wrote', async ($, on) => {
  let fiveHour = 30
  const kept: Record<string, unknown> = {}
  on('store.get', () => ({ value: kept.history }))
  on('store.set', (_, e) => {
    kept[e.key] = e.value

    return { value: undefined }
  })
  await begin($, on, () => limitsAt(fiveHour))
  await $.turn.complete(TURN)

  expect(kept.history).toEqual({ [dayOf(NOW)]: { five_hour: 30 } })

  // Another session stored a higher 7d peak meanwhile; a lower reading here writes nothing new.
  kept.history = { [dayOf(NOW)]: { five_hour: 30, seven_day: 44 } }
  fiveHour = 20
  await $.turn.complete(TURN)
  fiveHour = 55
  await $.turn.complete(TURN)

  expect(kept.history).toEqual({ [dayOf(NOW)]: { five_hour: 55, seven_day: 44 } })
})

test('merges histories by the higher peak and keeps the newest 30 days', () => {
  const days = Array.from({ length: 31 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`)
  const long = Object.fromEntries(days.map(day => [day, { five_hour: 10 }]))
  const merged = merge(long, { '2026-09-31': { five_hour: 5, seven_day: 7 } })

  expect(Object.keys(merged).length).toBe(30)
  expect(merged['2026-09-01']).toBe(undefined)
  expect(merged['2026-09-31']).toEqual({ five_hour: 10, seven_day: 7 })
})
