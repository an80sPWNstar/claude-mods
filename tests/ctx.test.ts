import { test, expect } from 'claude-code/testing'
import { CTX_WINDOW, CTX_DOT, CTX_DOTS, contextSize, ctxTarget, stepToward, ctxBoard, ctxLabel } from '../hooks/tally'

test('constants', () => {
  expect(CTX_WINDOW).toBe(1000000)
  expect(CTX_DOT).toBe(50000)
  expect(CTX_DOTS).toBe(20)
})

test('contextSize sums input + cache read + cache write, not output', () => {
  expect(contextSize({ model: "x", input_tokens: 170, output_tokens: 900, cache_read_input_tokens: 300000, cache_creation_input_tokens: 12000 })).toBe(312170)
})

test('ctxTarget', () => {
  expect(ctxTarget(0)).toBe(0)
  expect(ctxTarget(49999)).toBe(0)
  expect(ctxTarget(50000)).toBe(1)
  expect(ctxTarget(312170)).toBe(6)
  expect(ctxTarget(1000000)).toBe(20)
  expect(ctxTarget(1500000)).toBe(20)
})

test('stepToward', () => {
  expect(stepToward(0, 6)).toBe(1)
  expect(stepToward(5, 6)).toBe(6)
  expect(stepToward(6, 6)).toBe(6)
  expect(stepToward(12, 3)).toBe(3)
})

test('ctxBoard(0, 0, 0)', () => {
  expect(ctxBoard(0, 0, 0)).toEqual([
    { text: "", tone: "plain" },
    { text: "C", tone: "amber" },
    { text: " ·".repeat(20), tone: "dim" },
  ])
})

test('ctxBoard(6, 10, 12)', () => {
  expect(ctxBoard(6, 10, 12)).toEqual([
    { text: "  ".repeat(6), tone: "plain" },
    { text: "O", tone: "amber" },
    { text: " ·".repeat(14), tone: "dim" },
  ])
})

test('ctxBoard(6, 11, 12)', () => {
  expect(ctxBoard(6, 11, 12)).toEqual([
    { text: "  ".repeat(6), tone: "plain" },
    { text: "C", tone: "amber" },
    { text: " ·".repeat(14), tone: "dim" },
  ])
})

test('ctxBoard(20, 5, 5)', () => {
  expect(ctxBoard(20, 5, 5)).toEqual([
    { text: "  ".repeat(20), tone: "plain" },
    { text: "C", tone: "amber" },
    { text: "", tone: "dim" },
  ])
})

test('ctxBoard(25, 0, 0) clamps to 20', () => {
  expect(ctxBoard(25, 0, 0)).toEqual(ctxBoard(20, 5, 5))
})

test('ctxLabel', () => {
  expect(ctxLabel(0)).toBe("1 dot = 50k context · 0 of 1M")
  expect(ctxLabel(312170)).toBe("1 dot = 50k context · 312.2k of 1M")
})
