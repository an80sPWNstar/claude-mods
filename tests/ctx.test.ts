import { test, expect } from 'claude-code/testing'
import { CTX_WINDOW, CTX_DOT, CTX_DOTS, ROW, ROWS, contextSize, ctxTarget, stepToward, ctxMaze, ctxLabel } from '../hooks/tally'

test('constants', () => {
  expect(CTX_WINDOW).toBe(1000000)
  expect(CTX_DOT).toBe(5000)
  expect(CTX_DOTS).toBe(200)
  expect(ROW).toBe(20)
  expect(ROWS).toBe(10)
})

test('contextSize', () => {
  const size = contextSize({
    model: "x",
    input_tokens: 170,
    output_tokens: 900,
    cache_read_input_tokens: 300000,
    cache_creation_input_tokens: 12000
  })
  expect(size).toBe(312170)
})

test('ctxTarget', () => {
  expect(ctxTarget(0)).toBe(0)
  expect(ctxTarget(4999)).toBe(0)
  expect(ctxTarget(5000)).toBe(1)
  expect(ctxTarget(160600)).toBe(32)
  expect(ctxTarget(1000000)).toBe(200)
  expect(ctxTarget(1500000)).toBe(200)
})

test('stepToward', () => {
  expect(stepToward(0, 6)).toBe(1)
  expect(stepToward(5, 6)).toBe(6)
  expect(stepToward(6, 6)).toBe(6)
  expect(stepToward(12, 3)).toBe(3)
})

test('ctxMaze basic', () => {
  const m0 = ctxMaze(0, 0, 0)
  expect(m0).toHaveLength(10)
  expect(m0[0]).toEqual([
    { text: " C", tone: "amber" },
    { text: " •".repeat(19), tone: "pellet" }
  ])
  expect(m0[1]).toEqual([{ text: " •".repeat(20), tone: "pellet" }])
  expect(m0[9]).toEqual([{ text: " •".repeat(20), tone: "pellet" }])
})

test('ctxMaze partial', () => {
  const m3 = ctxMaze(3, 0, 0)
  expect(m3[0]).toEqual([
    { text: "  ".repeat(3), tone: "plain" },
    { text: " C", tone: "amber" },
    { text: " •".repeat(16), tone: "pellet" }
  ])
})

test('ctxMaze full row', () => {
  const m25 = ctxMaze(25, 0, 0)
  expect(m25[0]).toEqual([{ text: "  ".repeat(20), tone: "plain" }])
  expect(m25[1]).toEqual([
    { text: " •".repeat(14), tone: "pellet" },
    { text: " Ɔ", tone: "amber" },
    { text: "  ".repeat(5), tone: "plain" }
  ])
  expect(m25[2]).toEqual([{ text: " •".repeat(20), tone: "pellet" }])
})

test('ctxMaze moving mouth', () => {
  const m25_10_12 = ctxMaze(25, 10, 12)
  expect(m25_10_12[1]).toEqual([
    { text: " •".repeat(14), tone: "pellet" },
    { text: " O", tone: "amber" },
    { text: "  ".repeat(5), tone: "plain" }
  ])
  
  const m25_11_12 = ctxMaze(25, 11, 12)
  expect(m25_11_12[1]?.[1]).toEqual({ text: " Ɔ", tone: "amber" })
})

test('ctxMaze full', () => {
  const mf = ctxMaze(200, 0, 0)
  expect(mf[0]).toEqual([{ text: "  ".repeat(20), tone: "plain" }])
  expect(mf[9]).toEqual([
    { text: " Ɔ", tone: "amber" },
    { text: "  ".repeat(19), tone: "plain" }
  ])
  
  expect(ctxMaze(250, 0, 0)).toEqual(ctxMaze(200, 0, 0))
})

test('ctxLabel', () => {
  expect(ctxLabel(0)).toBe("1 dot = 5k context · 0 of 1M")
  expect(ctxLabel(160600)).toBe("1 dot = 5k context · 160.6k of 1M")
})
