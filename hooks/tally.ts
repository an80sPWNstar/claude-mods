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

export function breakdownText(t: Totals, jobs: LocalJob[]): string {
  const lines: string[] = []
  lines.push('Claude')
  const models = Object.entries(t.byModel)
  if (models.length === 0) {
    lines.push('  (none yet)')
  } else {
    const sorted = models
      .map(([m, r]) => ({ m, r, total: r.input + r.output + r.cacheRead + r.cacheWrite }))
      .sort((a, b) => b.total - a.total)
    for (const { m, r } of sorted) {
      lines.push(
        `${m}  req ${r.requests}  in ${formatCount(r.input)}  write ${formatCount(r.cacheWrite)}  read ${formatCount(r.cacheRead)}  out ${formatCount(r.output)}`,
      )
    }
  }
  lines.push('Local')
  const boxes: Record<string, { count: number; sum: number }> = {}
  for (const j of jobs) {
    const b = boxes[j.box] ?? { count: 0, sum: 0 }
    b.count += 1
    b.sum += j.prompt + j.completion
    boxes[j.box] = b
  }
  const boxEntries = Object.entries(boxes)
  if (boxEntries.length === 0) {
    lines.push('  (none yet)')
  } else {
    const sorted = boxEntries.sort((a, b) => b[1].sum - a[1].sum)
    for (const [box, b] of sorted) {
      lines.push(`${box}  jobs ${b.count}  ${formatCount(b.sum)}`)
    }
  }
  const c = claudeTotal(t)
  const l = localTotal(jobs)
  lines.push(`Total  Claude ${formatCount(c.all)} · Local ${formatCount(l.all)}`)
  return lines.join('\n')
}

export type Tone = 'head' | 'name' | 'dim' | 'amber' | 'green' | 'plain'
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
export function paneLines(t: Totals, jobs: LocalJob[]): Run[][] {
  const lines: Run[][] = []
  lines.push([
    { text: 'Claude'.padEnd(14) + ['req', 'in', 'write', 'read', 'out'].map(s => s.padStart(8)).join(''), tone: 'head' },
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
        { text: shortModel(m).slice(0, 13).padEnd(14), tone: 'name' },
        {
          text:
            String(r.requests).padStart(8) +
            formatCount(r.input).padStart(8) +
            formatCount(r.cacheWrite).padStart(8),
          tone: 'plain',
        },
        { text: formatCount(r.cacheRead).padStart(8), tone: 'dim' },
        { text: formatCount(r.output).padStart(8), tone: 'plain' },
      ])
    }
  }
  lines.push([])
  lines.push([{ text: 'Local'.padEnd(14) + 'jobs'.padStart(8) + 'total'.padStart(8), tone: 'head' }])
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
        { text: box.slice(0, 13).padEnd(14), tone: 'name' },
        { text: String(b.count).padStart(8) + formatCount(b.sum).padStart(8), tone: 'plain' },
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

// One dot per 100k Claude tokens.
export function dotsFor(all: number): number {
  return Math.max(1, Math.min(40, Math.ceil(all / 100000)))
}

// One frame of the pac-man animation.
export function pacFrame(frame: number, dots: number): Run[] {
  const p = Math.min(frame, dots)
  const mouth = frame >= dots ? 'C' : frame % 2 === 0 ? 'C' : 'O'
  return [
    { text: ' '.repeat(p), tone: 'plain' },
    { text: mouth, tone: 'amber' },
    { text: '\u00B7'.repeat(dots - p), tone: 'dim' },
  ]
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

// One frame of the live track. pos = eaten % TRACK.
// ahead = Math.max(0, Math.min(owed - eaten, TRACK - 1 - pos)).
// mouth = owed > eaten ? (eaten % 2 === 0 ? 'O' : 'C') : 'C'
// Returns exactly three runs:
// [{ text: ' '.repeat(pos), tone: 'plain' }, { text: mouth, tone: 'amber' }, { text: '·'.repeat(ahead), tone: 'dim' }]
// ('·' is U+00B7)
export function liveFrame(eaten: number, owed: number): Run[] {
  const pos = eaten % TRACK
  const ahead = Math.max(0, Math.min(owed - eaten, TRACK - 1 - pos))
  const mouth = owed > eaten ? (eaten % 2 === 0 ? 'O' : 'C') : 'C'
  return [
    { text: ' '.repeat(pos), tone: 'plain' },
    { text: mouth, tone: 'amber' },
    { text: '\u00B7'.repeat(ahead), tone: 'dim' },
  ]
}

// Label under the track: '1 dot = 1k fresh tokens · ' + formatCount(fresh) + ' this session'
// (the middle dot is U+00B7)
export function liveLabel(fresh: number): string {
  return '1 dot = 1k fresh tokens \u00B7 ' + formatCount(fresh) + ' this session'
}
