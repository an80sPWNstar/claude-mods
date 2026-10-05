import { test, expect } from 'claude-code/testing'
import { scoreLine } from '../hooks/tally'

test('scoreLine(0) returns the three runs with "0"', () => {
  expect(scoreLine(0)).toEqual([
    { text: 'SCORE ', tone: 'head' },
    { text: '0', tone: 'amber' },
  ])
})

test('scoreLine(191800) groups the number as "191,800"', () => {
  expect(scoreLine(191800)).toEqual([
    { text: 'SCORE ', tone: 'head' },
    { text: '191,800', tone: 'amber' },
  ])
})

test('middle run text for 999 is "999"', () => {
  expect(scoreLine(999)[1]?.text).toBe('999')
})

test('middle run text for 1000 is "1,000"', () => {
  expect(scoreLine(1000)[1]?.text).toBe('1,000')
})

test('middle run text for 1234567 is "1,234,567"', () => {
  expect(scoreLine(1234567)[1]?.text).toBe('1,234,567')
})

test('middle run text for 100000 is "100,000"', () => {
  expect(scoreLine(100000)[1]?.text).toBe('100,000')
})
