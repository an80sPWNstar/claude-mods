import { test, expect } from 'claude-code/testing'
import { emptyTotals, addUsage, claudeTotal, parseJob, localTotal, formatCount, statusLine, spawnDecision } from '../hooks/tally'

test('formatCount', () => {
  expect(formatCount(0)).toBe('0')
  expect(formatCount(950)).toBe('950')
  expect(formatCount(1000)).toBe('1.0k')
  expect(formatCount(38240)).toBe('38.2k')
  expect(formatCount(2412345)).toBe('2.41M')
})

test('addUsage accumulates per model and does not mutate the input', () => {
  const t = emptyTotals()
  const a = addUsage(t, { model: 'm1', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 })
  const b = addUsage(a, { model: 'm1', input_tokens: 20, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 })
  const c = addUsage(b, { model: 'm2', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 })

  expect(c.byModel.m1).toEqual({ requests: 2, input: 30, output: 12, cacheRead: 5, cacheWrite: 3 })
  expect(c.byModel.m2).toEqual({ requests: 1, input: 100, output: 50, cacheRead: 10, cacheWrite: 5 })
  expect(t.byModel).toEqual({})
})

test('claudeTotal sums all and cached', () => {
  const t = emptyTotals()
  const a = addUsage(t, { model: 'm1', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 })
  const b = addUsage(a, { model: 'm1', input_tokens: 20, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 })
  const c = addUsage(b, { model: 'm2', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 })
  expect(claudeTotal(c)).toEqual({ all: 215, cached: 15 })
})

test('parseJob windows path', () => {
  const rec = { id: 'job_a', state: 'done', server: { name: 'rtx:8081', model: 'D:\\Models\\Q\\Qwen3.8-27B-Q4_K_M.gguf' }, result: { usage: { promptTokens: 7875, completionTokens: 2993 } } }
  expect(parseJob(JSON.stringify(rec))).toEqual({ id: 'job_a', box: 'rtx:8081', model: 'Qwen3.8-27B-Q4_K_M', prompt: 7875, completion: 2993, done: true })
})

test('parseJob linux path', () => {
  const rec = { id: 'job_b', state: 'done', server: { name: 'tesla', model: '/home/x/models/Qwen3.6-35B-A3B-Q8_0.gguf' }, result: { usage: { promptTokens: 1000, completionTokens: 500 } } }
  expect(parseJob(JSON.stringify(rec))).toEqual({ id: 'job_b', box: 'tesla', model: 'Qwen3.6-35B-A3B-Q8_0', prompt: 1000, completion: 500, done: true })
})

test('parseJob invalid', () => {
  expect(parseJob('not json')).toBeNull()
  expect(parseJob(JSON.stringify({ id: 'x', state: 'running' }))).toBeNull()
})

test('localTotal', () => {
  const jobs = [
    { id: 'job_a', box: 'rtx:8081', model: 'Qwen3.8-27B-Q4_K_M', prompt: 7875, completion: 2993, done: true },
    { id: 'job_b', box: 'tesla', model: 'Qwen3.6-35B-A3B-Q8_0', prompt: 1000, completion: 500, done: true },
  ]
  expect(localTotal(jobs)).toEqual({ all: 12368, byBox: { 'rtx:8081': 10868, tesla: 1500 } })
})

test('statusLine', () => {
  expect(statusLine({ all: 2412345, cached: 2300000 }, { all: 38240 })).toBe('Claude 2.41M (2.30M cached) · Local 38.2k')
})

test('spawnDecision rewrite when model undefined', () => {
  expect(spawnDecision({ fork: false, subagentType: 'general-purpose', description: 'd' }, new Set())).toEqual({ action: 'rewrite', model: 'haiku' })
})

test('spawnDecision pass for haiku', () => {
  expect(spawnDecision({ fork: false, model: 'haiku', subagentType: 'general-purpose', description: 'd' }, new Set())).toEqual({ action: 'pass' })
})

test('spawnDecision pass for haiku variant', () => {
  expect(spawnDecision({ fork: false, model: 'claude-haiku-4-5-20251001', subagentType: 'general-purpose', description: 'd' }, new Set())).toEqual({ action: 'pass' })
})

test('spawnDecision deny for sonnet', () => {
  const d = spawnDecision({ fork: false, model: 'sonnet', subagentType: 'general-purpose', description: 'd' }, new Set())
  expect(d.action).toBe('deny')
  if (d.action === 'deny') {
    expect(d.reason).toContain('sonnet')
    expect(d.reason).toContain('re-issue')
    expect(d.key).toBe('general-purpose|sonnet|agent|d')
  }
})

test('spawnDecision pass when confirmed', () => {
  const key = 'general-purpose|sonnet|agent|d'
  expect(spawnDecision({ fork: false, model: 'sonnet', subagentType: 'general-purpose', description: 'd' }, new Set([key]))).toEqual({ action: 'pass' })
})

test('spawnDecision deny for fork', () => {
  const d = spawnDecision({ fork: true, model: 'haiku', subagentType: 'general-purpose', description: 'd' }, new Set())
  expect(d.action).toBe('deny')
  if (d.action === 'deny') {
    expect(d.reason).toContain('fork')
  }
})

test('spawnDecision pass for teammate', () => {
  expect(spawnDecision({ fork: false, model: 'opus', subagentType: 'general-purpose', description: 'd', isTeammate: true }, new Set())).toEqual({ action: 'pass' })
})
