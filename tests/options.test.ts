import { expect, test } from 'claude-code/testing'

import { toConfig } from '../hooks/options'

test('reads options, falling back where one is unusable', () => {
  expect(toConfig({})).toEqual({
    segments: ['context', 'tokens', 'chart', 'delta', 'limits', 'cost', 'mcp'],
    warnAt: 75,
    criticalAt: 90,
    hasToasts: true,
    hasCacheToast: true,
  })
  expect(toConfig({ segments: ' , ', warnAt: 95, criticalAt: 80, toasts: false })).toEqual({
    segments: ['context', 'tokens', 'chart', 'delta', 'limits', 'cost', 'mcp'],
    warnAt: 80,
    criticalAt: 80,
    hasToasts: false,
    hasCacheToast: true,
  })
})
