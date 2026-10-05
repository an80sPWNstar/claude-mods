export type Usage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}
export type ModelRow = { requests: number; input: number; output: number; cacheRead: number; cacheWrite: number }
export type Totals = { byModel: Record<string, ModelRow> }
export type LocalJob = { id: string; box: string; model: string; prompt: number; completion: number; done: boolean }
export type SpawnInfo = { fork: boolean; model?: string; subagentType: string; description: string; isTeammate?: true }
export type SpawnDecision =
  | { action: 'pass' }
  | { action: 'rewrite'; model: 'haiku' }
  | { action: 'deny'; key: string; reason: string }

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export const CTX_WINDOW = 1000000 // context window in tokens
export const CTX_DOT = 5000       // context tokens per dot
export const CTX_DOTS = 200       // CTX_WINDOW / CTX_DOT
export const ROW = 20   // dots per maze row
export const ROWS = 10  // CTX_DOTS / ROW

// The context one step's request carried: input + cache read + cache write.
export function contextSize(u: Usage): number {
  return num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens)
}

// Dots eaten for a context size: Math.min(CTX_DOTS, Math.floor(ctx / CTX_DOT)).
export function ctxTarget(ctx: number): number {
  return Math.min(CTX_DOTS, Math.floor(ctx / CTX_DOT))
}

// One animation step of the eater's position: shown < target ? shown + 1 : target
// (moving up walks one dot at a time; a drop, e.g. after compaction, jumps straight there).
export function stepToward(shown: number, target: number): number {
  return shown < target ? shown + 1 : target
}

// The maze: ROWS lines of ROW cells, two characters per cell, walked as a snake
// (even rows left to right, odd rows right to left).
// s = Math.max(0, Math.min(CTX_DOTS, shown)); p = Math.min(s, CTX_DOTS - 1)  (the eater's cell)
// moving = owed > eaten
// For row r (0..ROWS-1) and column j (0..ROW-1): idx = r * ROW + (r % 2 === 0 ? j : ROW - 1 - j)
//   idx === p -> { text: ' ' + mouth, tone: 'amber' }
//                mouth = moving && eaten % 2 === 0 ? 'O' : (r % 2 === 0 ? 'C' : 'Ɔ')   ('Ɔ' is U+0186)
//   idx < s   -> { text: '  ', tone: 'plain' }
//   otherwise -> { text: ' •', tone: 'pellet' }   ('•' is U+2022)
// Each line is its cells left to right, with ADJACENT RUNS OF THE SAME TONE MERGED into one run (texts concatenated).
export function ctxMaze(shown: number, eaten: number, owed: number): Run[][] {
  const s = Math.max(0, Math.min(CTX_DOTS, shown))
  const p = Math.min(s, CTX_DOTS - 1)
  const moving = owed > eaten
  const rows: Run[][] = []
  for (let r = 0; r < ROWS; r++) {
    const cells: Run[] = []
    for (let j = 0; j < ROW; j++) {
      const idx = r * ROW + (r % 2 === 0 ? j : ROW - 1 - j)
      let run: Run
      if (idx === p) {
        const mouth = moving && eaten % 2 === 0 ? 'O' : (r % 2 === 0 ? 'C' : '\u0186')
        run = { text: ' ' + mouth, tone: 'amber' }
      } else if (idx < s) {
        run = { text: '  ', tone: 'plain' }
      } else {
        run = { text: ' \u2022', tone: 'pellet' }
      }
      const last = cells[cells.length - 1]
      if (last !== undefined && last.tone === run.tone) last.text += run.text
      else cells.push(run)
    }
    rows.push(cells)
  }
  return rows
}

// Label under the maze: '1 dot = 5k context · ' + formatCount(ctx) + ' of 1M'  (middle dot U+00B7)
export function ctxLabel(ctx: number): string {
  return '1 dot = 5k context \u00B7 ' + formatCount(ctx) + ' of 1M'
}

export function emptyTotals(): Totals {
  return { byModel: {} }
}

export function addUsage(t: Totals, u: Usage): Totals {
  const byModel: Record<string, ModelRow> = {}
  for (const [m, r] of Object.entries(t.byModel)) byModel[m] = { ...r }
  const model = typeof u.model === 'string' ? u.model : '?'
  const row = byModel[model] ?? { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  row.requests += 1
  row.input += num(u.input_tokens)
  row.output += num(u.output_tokens)
  row.cacheRead += num(u.cache_read_input_tokens)
  row.cacheWrite += num(u.cache_creation_input_tokens)
  byModel[model] = row
  return { byModel }
}

export function claudeTotal(t: Totals): { all: number; cached: number } {
  let all = 0
  let cached = 0
  for (const r of Object.values(t.byModel)) {
    all += r.input + r.output + r.cacheRead + r.cacheWrite
    cached += r.cacheRead
  }
  return { all, cached }
}

export function parseJob(text: string): LocalJob | null {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const o = obj as Record<string, any>
  const result = o.result
  if (typeof result !== 'object' || result === null || typeof result.usage !== 'object' || result.usage === null) return null
  const usage = result.usage as Record<string, any>
  const server = (typeof o.server === 'object' && o.server !== null ? o.server : {}) as Record<string, any>
  let model = '?'
  if (typeof server.model === 'string' && server.model.length > 0) {
    const base = server.model.split(/[\\/]/).pop() ?? ''
    model = base.endsWith('.gguf') ? base.slice(0, -'.gguf'.length) : base
    if (model.length === 0) model = '?'
  }
  return {
    id: typeof o.id === 'string' ? o.id : String(o.id ?? '?'),
    box: typeof server.name === 'string' && server.name.length > 0 ? server.name : '?',
    model,
    prompt: num(usage.promptTokens),
    completion: num(usage.completionTokens),
    done: o.state === 'done',
  }
}

export function localTotal(jobs: LocalJob[]): { all: number; byBox: Record<string, number> } {
  let all = 0
  const byBox: Record<string, number> = {}
  for (const j of jobs) {
    const s = j.prompt + j.completion
    all += s
    byBox[j.box] = (byBox[j.box] ?? 0) + s
  }
  return { all, byBox }
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k'
  return (n / 1_000_000).toFixed(2) + 'M'
}

export function statusLine(claude: { all: number; cached: number }, local: { all: number }): string {
  return `Claude ${formatCount(claude.all)} (${formatCount(claude.cached)} cached) · Local ${formatCount(local.all)}`
}

export function spawnDecision(s: SpawnInfo, confirmed: ReadonlySet<string>): SpawnDecision {
  const key = `${s.subagentType}|${s.model ?? 'inherit'}|${s.fork ? 'fork' : 'agent'}|${s.description}`
  if (s.isTeammate === true) return { action: 'pass' }
  if (confirmed.has(key)) return { action: 'pass' }
  if (s.fork === true) {
    return {
      action: 'deny',
      key,
      reason:
        'token-meter: routing rule is Haiku first unless Haiku already failed at this task; forks bypass that rule. re-issue the identical call to confirm this fork.',
    }
  }
  if (s.model === undefined) return { action: 'rewrite', model: 'haiku' }
  if (s.model === 'haiku' || s.model.includes('haiku')) return { action: 'pass' }
  return {
    action: 'deny',
    key,
    reason:
      `token-meter: routing rule is Haiku first unless Haiku already failed at this task; ` +
      `${s.model} is not Haiku. re-issue the identical call to confirm it.`,
  }
}

export type Tone = 'head' | 'name' | 'dim' | 'amber' | 'green' | 'plain' | 'pellet'
export type Run = { text: string; tone: Tone }

// Drop a leading "claude-" and a trailing "-YYYYMMDD" (8 digits).
// "claude-opus-5-5" -> "opus-5-5"; "claude-haiku-4-5-20251001" -> "haiku-4-5"; "qwen" -> "qwen".
export function shortModel(id: string): string {
  let s = id
  if (s.startsWith('claude-')) s = s.slice('claude-'.length)
  s = s.replace(/-\d{8}$/, '')
  return s
}

// Lines for the pane. Each line is a list of runs; an empty array is a blank line.
// compact narrows the table: NAME 10 / COL 7 / names sliced to 10, instead of 14 / 8 / 13.
export function paneLines(t: Totals, jobs: LocalJob[], compact = false): Run[][] {
  const NAME = compact ? 10 : 14
  const COL = compact ? 7 : 8
  const SLICE = compact ? 10 : 13
  const lines: Run[][] = []
  lines.push([
    { text: 'Claude'.padEnd(NAME) + ['req', 'in', 'write', 'read', 'out'].map(s => s.padStart(COL)).join(''), tone: 'head' },
  ])
  const models = Object.entries(t.byModel)
  if (models.length === 0) {
    lines.push([{ text: '  (none yet)', tone: 'dim' }])
  } else {
    const sorted = models
      .map(([m, r]) => ({ m, r, total: r.input + r.output + r.cacheRead + r.cacheWrite }))
      .sort((a, b) => b.total - a.total)
    for (const { m, r } of sorted) {
      lines.push([
        { text: shortModel(m).slice(0, SLICE).padEnd(NAME), tone: 'name' },
        {
          text:
            String(r.requests).padStart(COL) +
            formatCount(r.input).padStart(COL) +
            formatCount(r.cacheWrite).padStart(COL),
          tone: 'plain',
        },
        { text: formatCount(r.cacheRead).padStart(COL), tone: 'dim' },
        { text: formatCount(r.output).padStart(COL), tone: 'plain' },
      ])
    }
  }
  lines.push([])
  lines.push([{ text: 'Local'.padEnd(NAME) + 'jobs'.padStart(COL) + 'total'.padStart(COL), tone: 'head' }])
  const boxes: Record<string, { count: number; sum: number }> = {}
  for (const j of jobs) {
    const b = boxes[j.box] ?? { count: 0, sum: 0 }
    b.count += 1
    b.sum += j.prompt + j.completion
    boxes[j.box] = b
  }
  const boxEntries = Object.entries(boxes)
  if (boxEntries.length === 0) {
    lines.push([{ text: '  (none yet)', tone: 'dim' }])
  } else {
    const sorted = boxEntries.sort((a, b) => b[1].sum - a[1].sum)
    for (const [box, b] of sorted) {
      lines.push([
        { text: box.slice(0, SLICE).padEnd(NAME), tone: 'name' },
        { text: String(b.count).padStart(COL) + formatCount(b.sum).padStart(COL), tone: 'plain' },
      ])
    }
  }
  lines.push([])
  const claude = claudeTotal(t)
  const local = localTotal(jobs)
  lines.push([
    { text: 'Total   ', tone: 'plain' },
    { text: 'Claude ' + formatCount(claude.all), tone: 'amber' },
    { text: ' \u00B7 ', tone: 'plain' },
    { text: 'Local ' + formatCount(local.all), tone: 'green' },
  ])
  return lines
}

// Spinner suffix: '… · Claude +' + formatCount(n) + ' this turn'
export function spinnerSuffix(n: number): string {
  return '\u2026 \u00B7 Claude +' + formatCount(n) + ' this turn'
}

export const TRACK = 40 // track width in cells
export const DOT = 1000 // fresh tokens per dot

// Fresh tokens: input + output + cacheWrite over all models (cache reads NOT counted).
// Equals claudeTotal(t).all - claudeTotal(t).cached.
export function freshTotal(t: Totals): number {
  const c = claudeTotal(t)
  return c.all - c.cached
}

// Dots earned so far: Math.floor(fresh / DOT).
export function dotsOwed(fresh: number): number {
  return Math.floor(fresh / DOT)
}

// One tick of the eater. If eaten >= owed, return eaten unchanged.
// Otherwise skip any backlog beyond TRACK, then eat one:
//   return Math.max(eaten, owed - TRACK) + 1
export function stepEaten(eaten: number, owed: number): number {
  if (eaten >= owed) return eaten
  return Math.max(eaten, owed - TRACK) + 1
}

// Arcade score line. The number is fresh with commas every three digits,
// built WITHOUT toLocaleString/Intl (the runtime may lack them):
//   String(fresh).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
// Returns exactly two runs:
// [{ text: 'SCORE ', tone: 'head' }, { text: <grouped number>, tone: 'amber' }]
export function scoreLine(fresh: number): Run[] {
  const grouped = String(fresh).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return [
    { text: 'SCORE ', tone: 'head' },
    { text: grouped, tone: 'amber' },
  ]
}
