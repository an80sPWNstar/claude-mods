import { test, expect } from 'claude-code/testing'
import { GLYPHS, GAP, BAND_ROWS, nextRand, columnsFor, toneAt, createRain, stepRain, fitRain, renderRain } from '../hooks/rain'
import type { Rain } from '../hooks/rain'

test('constants', () => {
  expect(GLYPHS.length).toBe(77)
  expect(GLYPHS[0]).toBe('\uff66')
  expect(GLYPHS[55]).toBe('\uff9d')
  expect(GLYPHS.slice(56, 66)).toBe('0123456789')
  expect(GLYPHS.endsWith('Z:."=*+-<>|')).toBe(true)
  expect(GAP).toBe(2)
  expect(BAND_ROWS).toBe(4)
})

test('nextRand', () => {
  expect(nextRand(1)).toEqual([0.6270739405881613, 1831565814])
  expect(nextRand(1831565814)).toEqual([0.002735721180215478, -631835669])
  expect(nextRand(0)).toEqual([0.26642920868471265, 1831565813])
})

test('columnsFor', () => {
  expect(columnsFor(0)).toBe(1)
  expect(columnsFor(1)).toBe(1)
  expect(columnsFor(3)).toBe(1)
  expect(columnsFor(4)).toBe(2)
  expect(columnsFor(48)).toBe(24)
  expect(columnsFor(49)).toBe(24)
})

test('toneAt with len 9', () => {
  expect(toneAt(-1, 9)).toBe('blank')
  expect(toneAt(0, 9)).toBe('head')
  expect(toneAt(1, 9)).toBe('bright')
  expect(toneAt(3, 9)).toBe('bright')
  expect(toneAt(4, 9)).toBe('mid')
  expect(toneAt(6, 9)).toBe('mid')
  expect(toneAt(7, 9)).toBe('dim')
  expect(toneAt(8, 9)).toBe('dim')
  expect(toneAt(9, 9)).toBe('blank')
})

test('createRain shape', () => {
  const r = createRain(48, 10, 7)
  expect(r.width).toBe(48)
  expect(r.rows).toBe(10)
  expect(r.cols).toBe(24)
  expect(r.tick).toBe(0)
  expect(r.drops.length).toBe(24)
  expect(r.grid.length).toBe(10)
  for (let i = 0; i < r.grid.length; i++) {
    expect((r.grid[i]?.length ?? 0)).toBe(24)
    for (let j = 0; j < (r.grid[i]?.length ?? 0); j++) {
      expect(GLYPHS.includes((r.grid[i]?.[j] ?? '#'))).toBe(true)
    }
  }
  for (const d of r.drops) {
    expect(d.len >= 4 && d.len <= 10).toBe(true)
    expect(d.speed >= 1 && d.speed <= 3).toBe(true)
    expect(d.head >= -10 && d.head <= 9).toBe(true)
    expect(d.wait).toBe(0)
  }
  expect(createRain(48, 0, 7).rows).toBe(1)
})

test('determinism', () => {
  const a = createRain(40, 8, 123)
  const b = createRain(40, 8, 123)
  for (let i = 0; i < 50; i++) {
    stepRain(a)
    stepRain(b)
  }
  expect(renderRain(a)).toEqual(renderRain(b))
  const c = createRain(40, 8, 124)
  for (let i = 0; i < 50; i++) {
    stepRain(c)
  }
  expect(JSON.stringify(renderRain(c)) === JSON.stringify(renderRain(a))).toBe(false)
})

test('stepRain tick and bounds', () => {
  const r = createRain(20, 6, 9)
  for (let i = 0; i < 200; i++) {
    stepRain(r)
  }
  expect(r.tick).toBe(200)
  for (const d of r.drops) {
    expect(d.head - d.len < 6).toBe(true)
  }
  for (let i = 0; i < r.grid.length; i++) {
    for (let j = 0; j < (r.grid[i]?.length ?? 0); j++) {
      expect(GLYPHS.includes((r.grid[i]?.[j] ?? '#'))).toBe(true)
    }
  }
})

test('respawn', () => {
  const r = createRain(4, 5, 1)
  r.drops[0] = { head: 9, len: 5, speed: 1, wait: 0 }
  stepRain(r)
  expect(r.drops[0]?.head).toBe(-1)
  expect((r.drops[0]?.wait ?? -1) >= 0 && (r.drops[0]?.wait ?? 99) <= 5).toBe(true)
})

test('waiting', () => {
  const r = createRain(4, 5, 1)
  r.drops[0] = { head: -1, len: 4, speed: 1, wait: 2 }
  stepRain(r)
  expect(r.drops[0]?.wait).toBe(1)
  expect(r.drops[0]?.head).toBe(-1)
})

test('render exact', () => {
  const r: Rain = {
    width: 6,
    rows: 3,
    cols: 3,
    tick: 0,
    seed: 1,
    drops: [
      { head: 0, len: 2, speed: 1, wait: 0 },
      { head: 2, len: 3, speed: 1, wait: 0 },
      { head: -1, len: 4, speed: 1, wait: 0 }
    ],
    grid: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i']
    ]
  }
  expect(renderRain(r)).toEqual([
    [
      { text: 'a ', tone: 'head' },
      { text: 'b ', tone: 'mid' },
      { text: '  ', tone: 'blank' }
    ],
    [
      { text: '  ', tone: 'blank' },
      { text: 'e ', tone: 'bright' },
      { text: '  ', tone: 'blank' }
    ],
    [
      { text: '  ', tone: 'blank' },
      { text: 'h ', tone: 'head' },
      { text: '  ', tone: 'blank' }
    ]
  ])
})

test('render merge', () => {
  const r: Rain = {
    width: 6,
    rows: 3,
    cols: 3,
    tick: 0,
    seed: 1,
    drops: [
      { head: -5, len: 2, speed: 1, wait: 0 },
      { head: -5, len: 2, speed: 1, wait: 0 },
      { head: 0, len: 2, speed: 1, wait: 0 }
    ],
    grid: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i']
    ]
  }
  expect(renderRain(r)[0]).toEqual([
    { text: '    ', tone: 'blank' },
    { text: 'c ', tone: 'head' }
  ])
})

test('render invariants', () => {
  const r = createRain(40, 8, 5)
  for (let i = 0; i < 30; i++) {
    stepRain(r)
  }
  const lines = renderRain(r)
  expect(lines.length).toBe(8)
  for (const line of lines) {
    const joined = line.map(r => r.text).join('')
    expect(joined.length).toBe(40)
    for (let i = 1; i < joined.length; i += 2) {
      expect(joined[i]).toBe(' ')
    }
    for (let i = 1; i < line.length; i++) {
      expect(line[i]?.tone === line[i - 1]?.tone).toBe(false)
    }
    for (const run of line) {
      expect(['head', 'bright', 'mid', 'dim', 'blank'].includes(run.tone)).toBe(true)
    }
  }
})

test('fitRain', () => {
  const r = createRain(40, 8, 3)
  expect(fitRain(r, 40, 8, 99) === r).toBe(true)
  const w = fitRain(r, 42, 8, 99)
  expect(w === r).toBe(false)
  expect(w.cols).toBe(21)
  expect(fitRain(null, 10, 3, 1).rows).toBe(3)
  expect(fitRain(r, 40, 0, 1) === r).toBe(false)
})
