export type Tone = 'head' | 'bright' | 'mid' | 'dim' | 'blank'
export type Run = { text: string; tone: Tone }
export type Drop = { head: number; len: number; speed: number; wait: number }
export type Rain = { width: number; rows: number; cols: number; tick: number; seed: number; drops: Drop[]; grid: string[][] }

const katakana = (() => {
  let s = ''
  for (let i = 0; i < 56; i++) s += String.fromCharCode(0xff66 + i)
  return s
})()

export const GLYPHS: string = katakana + '0123456789' + 'Z:."=*+-<>|'
export const GAP = 2
export const BAND_ROWS = 4

export function nextRand(seed: number): [number, number] {
  const s = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

function randInt(rain: Rain, lo: number, hi: number): number {
  const [v, s] = nextRand(rain.seed)
  rain.seed = s
  return lo + Math.floor(v * (hi - lo + 1))
}

function glyph(rain: Rain): string {
  return GLYPHS[randInt(rain, 0, GLYPHS.length - 1)] ?? ''
}

export function columnsFor(width: number): number {
  return Math.max(1, Math.floor(width / GAP))
}

export function toneAt(d: number, len: number): Tone {
  if (d < 0 || d >= len) return 'blank'
  if (d === 0) return 'head'
  if (d <= Math.floor(len / 3)) return 'bright'
  if (d <= Math.floor((2 * len) / 3)) return 'mid'
  return 'dim'
}

function newDrop(rain: Rain, initial: boolean): Drop {
  const len = randInt(rain, 4, Math.max(5, rain.rows))
  const speed = randInt(rain, 1, 3)
  if (initial) {
    const head = randInt(rain, -rain.rows, rain.rows - 1)
    return { head, len, speed, wait: 0 }
  }
  const wait = randInt(rain, 0, rain.rows)
  return { head: -1, len, speed, wait }
}

export function createRain(width: number, rows: number, seed: number): Rain {
  const r = Math.max(1, rows)
  const cols = columnsFor(width)
  const rain: Rain = { width, rows: r, cols, tick: 0, seed, drops: [], grid: [] }
  for (let i = 0; i < r; i++) {
    const row: string[] = []
    for (let j = 0; j < cols; j++) row.push(glyph(rain))
    rain.grid.push(row)
  }
  for (let c = 0; c < cols; c++) rain.drops.push(newDrop(rain, true))
  return rain
}

export function stepRain(rain: Rain): void {
  rain.tick += 1
  for (let c = 0; c < rain.cols; c++) {
    const d = rain.drops[c]
    if (!d) continue
    if (d.wait > 0) {
      d.wait -= 1
      continue
    }
    if (rain.tick % d.speed === 0) {
      d.head += 1
      if (d.head >= 0 && d.head < rain.rows) {
        const row = rain.grid[d.head]
        if (row) row[c] = glyph(rain)
      }
    }
    if (d.head - d.len >= rain.rows) {
      rain.drops[c] = newDrop(rain, false)
    }
  }
  const n = Math.max(1, Math.floor((rain.cols * rain.rows) / 40))
  for (let i = 0; i < n; i++) {
    const r = randInt(rain, 0, rain.rows - 1)
    const c = randInt(rain, 0, rain.cols - 1)
    const row = rain.grid[r]
    if (row) row[c] = glyph(rain)
  }
}

export function fitRain(rain: Rain | null, width: number, rows: number, seed: number): Rain {
  if (rain !== null && rain.width === width && rain.rows === Math.max(1, rows)) return rain
  return createRain(width, rows, seed)
}

export function renderRain(rain: Rain): Run[][] {
  const lines: Run[][] = []
  for (let r = 0; r < rain.rows; r++) {
    const line: Run[] = []
    for (let c = 0; c < rain.cols; c++) {
      const d = (rain.drops[c]?.head ?? 0) - r
      const len = rain.drops[c]?.len ?? 0
      const tone = toneAt(d, len)
      const g = rain.grid[r]?.[c] ?? ''
      const text = tone === 'blank' ? '  ' : g + ' '
      const last = line[line.length - 1]
      if (last && last.tone === tone) {
        last.text += text
      } else {
        line.push({ text, tone })
      }
    }
    lines.push(line)
  }
  return lines
}
