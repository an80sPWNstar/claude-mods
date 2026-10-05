import { test, expect } from 'claude-code/testing'
import { emptyTotals, addUsage, boardFrame, paneLines } from '../hooks/tally'

test('boardFrame(0, 0, 40)', () => {
  expect(boardFrame(0, 0, 40)).toEqual([
    { text: "", tone: "plain" },
    { text: "C", tone: "amber" },
    { text: "·".repeat(39), tone: "dim" },
  ])
})

test('boardFrame(0, 3, 40)', () => {
  expect(boardFrame(0, 3, 40)).toEqual([
    { text: "", tone: "plain" },
    { text: "O", tone: "amber" },
    { text: "·".repeat(39), tone: "dim" },
  ])
})

test('boardFrame(5, 5, 12)', () => {
  expect(boardFrame(5, 5, 12)).toEqual([
    { text: " ".repeat(5), tone: "plain" },
    { text: "C", tone: "amber" },
    { text: "·".repeat(6), tone: "dim" },
  ])
})

test('boardFrame(41, 50, 40)', () => {
  expect(boardFrame(41, 50, 40)).toEqual([
    { text: " ", tone: "plain" },
    { text: "C", tone: "amber" },
    { text: "·".repeat(38), tone: "dim" },
  ])
})

test('boardFrame(3, 3, 4) clamps width up to 10', () => {
  expect(boardFrame(3, 3, 4)).toEqual([
    { text: "   ", tone: "plain" },
    { text: "C", tone: "amber" },
    { text: "·".repeat(6), tone: "dim" },
  ])
})

test('boardFrame(0, 0, 100) clamps width down to 40', () => {
  expect(boardFrame(0, 0, 100)[2]?.text).toBe("·".repeat(39))
})

test('paneLines compact', () => {
  const t = addUsage(emptyTotals(), {
    model: "claude-opus-5-5",
    input_tokens: 18200,
    output_tokens: 61000,
    cache_read_input_tokens: 2210000,
    cache_creation_input_tokens: 96400,
  })
  const jobs = [{ id: "a", box: "rtx", model: "q", prompt: 40000, completion: 1700, done: true }]
  const lines = paneLines(t, jobs, true)

  expect(lines).toHaveLength(7)

  expect(lines[0]).toEqual([
    { text: "Claude    " + "    req" + "     in" + "  write" + "   read" + "    out", tone: "head" },
  ])

  expect(lines[1]).toEqual([
    { text: "opus-5-5  ", tone: "name" },
    { text: "      1  18.2k  96.4k", tone: "plain" },
    { text: "  2.21M", tone: "dim" },
    { text: "  61.0k", tone: "plain" },
  ])

  expect(lines[3]).toEqual([
    { text: "Local     " + "   jobs" + "  total", tone: "head" },
  ])

  expect(lines[4]).toEqual([
    { text: "rtx       ", tone: "name" },
    { text: "      1  41.7k", tone: "plain" },
  ])
})

test('paneLines compact does not cut a 10-char name', () => {
  const t2 = addUsage(emptyTotals(), {
    model: "claude-sonnet-5-5",
    input_tokens: 1,
    output_tokens: 1,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  })
  expect(paneLines(t2, [], true)[1]?.[0]).toEqual({ text: "sonnet-5-5", tone: "name" })
})

test('paneLines default is unchanged', () => {
  const t = addUsage(emptyTotals(), {
    model: "claude-opus-5-5",
    input_tokens: 18200,
    output_tokens: 61000,
    cache_read_input_tokens: 2210000,
    cache_creation_input_tokens: 96400,
  })
  const jobs = [{ id: "a", box: "rtx", model: "q", prompt: 40000, completion: 1700, done: true }]
  expect(paneLines(t, jobs)[0]?.[0]?.text).toHaveLength(54)
})
