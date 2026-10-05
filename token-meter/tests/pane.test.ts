import { test, expect } from 'claude-code/testing'
import {
  emptyTotals,
  addUsage,
  shortModel,
  paneLines,
  spinnerSuffix,
} from '../hooks/tally'

test('shortModel drops claude- prefix and trailing date', () => {
  expect(shortModel('claude-opus-5-5')).toBe('opus-5-5')
  expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
  expect(shortModel('qwen')).toBe('qwen')
})

test('spinnerSuffix formats the turn delta', () => {
  expect(spinnerSuffix(18400)).toBe('\u2026 \u00B7 Claude +18.4k this turn')
})

test('paneLines with no models and no jobs', () => {
  const lines = paneLines(emptyTotals(), [])
  expect(lines).toHaveLength(7)
  expect(lines[0]).toEqual([
    { text: 'Claude        ' + '     req      in   write    read     out', tone: 'head' },
  ])
  expect(lines[1]).toEqual([{ text: '  (none yet)', tone: 'dim' }])
  expect(lines[2]).toEqual([])
  expect(lines[4]).toEqual([{ text: '  (none yet)', tone: 'dim' }])
  expect(lines[6]).toEqual([
    { text: 'Total   ', tone: 'plain' },
    { text: 'Claude 0', tone: 'amber' },
    { text: ' \u00B7 ', tone: 'plain' },
    { text: 'Local 0', tone: 'green' },
  ])
})

test('paneLines with one model and one local job', () => {
  const t = addUsage(emptyTotals(), {
    model: 'claude-opus-5-5',
    input_tokens: 18200,
    output_tokens: 61000,
    cache_read_input_tokens: 2210000,
    cache_creation_input_tokens: 96400,
  })
  const jobs = [
    { id: 'a', box: 'rtx', model: 'q', prompt: 40000, completion: 1700, done: true },
  ]
  const lines = paneLines(t, jobs)
  expect(lines).toHaveLength(7)
  expect(lines[1]).toEqual([
    { text: 'opus-5-5      ', tone: 'name' },
    { text: '       1   18.2k   96.4k', tone: 'plain' },
    { text: '   2.21M', tone: 'dim' },
    { text: '   61.0k', tone: 'plain' },
  ])
  expect(lines[3]).toEqual([
    { text: 'Local         ' + '    jobs   total', tone: 'head' },
  ])
  expect(lines[4]).toEqual([
    { text: 'rtx           ', tone: 'name' },
    { text: '       1   41.7k', tone: 'plain' },
  ])
  expect(lines[6]?.[1]?.text).toBe('Claude 2.39M')
  expect(lines[6]?.[3]?.text).toBe('Local 41.7k')
})
