import { test, expect } from 'claude-code/testing'
import { PAC_OPEN, PAC_SHUT, headerLines, scoreLine } from '../hooks/tally'

test('PAC_OPEN and PAC_SHUT are 5 lines of 10 characters', () => {
  expect(PAC_OPEN).toHaveLength(5)
  expect(PAC_SHUT).toHaveLength(5)
  for (const row of [...PAC_OPEN, ...PAC_SHUT]) expect(row).toHaveLength(10)
})

test('headerLines idle: open frame, score beside the middle line', () => {
  const lines = headerLines(1234, 0, 0)
  expect(lines).toHaveLength(5)
  expect(lines[0]).toEqual([{ text: PAC_OPEN[0], tone: 'pac' }])
  expect(lines[2]).toEqual([
    { text: PAC_OPEN[2], tone: 'pac' },
    { text: '   ', tone: 'plain' },
    ...scoreLine(1234),
  ])
})

test('headerLines moving on an even step: shut frame', () => {
  const lines = headerLines(5000, 2, 5)
  expect(lines[0]?.[0]?.text).toBe(PAC_SHUT[0])
  expect(lines[1]?.[0]?.text).toBe(PAC_SHUT[1])
})

test('headerLines moving on an odd step: open frame', () => {
  const lines = headerLines(5000, 3, 5)
  expect(lines[1]?.[0]?.text).toBe(PAC_OPEN[1])
})
