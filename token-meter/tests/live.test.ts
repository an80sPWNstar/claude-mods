import { test, expect } from 'claude-code/testing'
import { emptyTotals, addUsage, TRACK, DOT, freshTotal, dotsOwed, stepEaten } from '../hooks/tally'

test('TRACK and DOT constants', () => {
  expect(TRACK).toBe(40)
  expect(DOT).toBe(1000)
})

test('freshTotal', () => {
  expect(freshTotal(emptyTotals())).toBe(0)

  let t = addUsage(emptyTotals(), {
    model: 'claude-opus-5-5',
    input_tokens: 18200,
    output_tokens: 61000,
    cache_read_input_tokens: 2210000,
    cache_creation_input_tokens: 96400,
  })
  expect(freshTotal(t)).toBe(175600)

  t = addUsage(t, {
    model: 'claude-haiku-4-5',
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 9999,
    cache_creation_input_tokens: 0,
  })
  expect(freshTotal(t)).toBe(175750)
})

test('dotsOwed', () => {
  expect(dotsOwed(0)).toBe(0)
  expect(dotsOwed(999)).toBe(0)
  expect(dotsOwed(1000)).toBe(1)
  expect(dotsOwed(175600)).toBe(175)
})

test('stepEaten', () => {
  expect(stepEaten(5, 5)).toBe(5)
  expect(stepEaten(7, 5)).toBe(7)
  expect(stepEaten(5, 6)).toBe(6)
  expect(stepEaten(0, 3)).toBe(1)
  expect(stepEaten(0, 100)).toBe(61)
  expect(stepEaten(10, 45)).toBe(11)
})
