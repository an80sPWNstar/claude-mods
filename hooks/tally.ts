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
