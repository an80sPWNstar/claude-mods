import type { Register } from 'claude-code'
import { emptyTotals, addUsage, claudeTotal, parseJob, localTotal, statusLine, spawnDecision, breakdownText } from './tally'
import type { Totals, LocalJob } from './tally'

let totals: Totals = emptyTotals()
let jobs: LocalJob[] = []
let confirmed = new Set<string>()
let sid = ''
let jobsDir = ''

async function save($: Register) {
  await $.store.set('totals:' + sid, totals)
}

async function scanLocal($: Register) {
  if (jobsDir === '' || !(await $.fs.exists(jobsDir))) return
  try {
    const entries = await $.fs.list(jobsDir)
    const next: LocalJob[] = []
    for (const e of entries) {
      if (e.kind === 'file' && e.name.endsWith('.json')) {
        const text = await $.fs.read(jobsDir + '/' + e.name)
        const j = parseJob(text)
        if (j !== null) next.push(j)
      }
    }
    jobs = next
  } catch {
    // leave jobs unchanged
  }
}

function show($: Register) {
  $.ui.status(statusLine(claudeTotal(totals), localTotal(jobs)))
}

on('session.start', async ($, e, next) => {
  sid = await $.session.id()
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  jobsDir = home ? home.replace(/\\/g, '/') + '/.lanllm/jobs/' + sid : ''
  const saved = await $.store.get('totals:' + sid)
  if (
    typeof saved === 'object' &&
    saved !== null &&
    typeof (saved as { byModel?: unknown }).byModel === 'object' &&
    (saved as { byModel?: unknown }).byModel !== null
  ) {
    totals = saved as Totals
  }
  await $.command.register({ name: 'tokens', description: 'Token use this session: Claude per model, local per box' })
  await scanLocal($)
  show($)
  $.clock.every(20000, async () => {
    await scanLocal($)
    show($)
  })
  return next(e)
})

on('turn.step', async function* ($, e, next) {
  const r = yield* next(e)
  if (r && r.usage) {
    totals = addUsage(totals, r.usage)
    show($)
    await save($)
  }
  return r
})

on('agent.spawn', async ($, e, next) => {
  const info = {
    fork: e.fork,
    model: e.model,
    subagentType: e.subagentType,
    description: e.description,
    isTeammate: e.isTeammate,
  }
  const d = spawnDecision(info, confirmed)
  if (d.action === 'pass') return next(e)
  if (d.action === 'rewrite') return next({ ...e, model: 'haiku' })
  confirmed.add(d.key)
  return { deny: d.reason }
})

on('command.run', { command: 'tokens' }, async ($) => {
  await scanLocal($)
  show($)
  return { text: breakdownText(totals, jobs) }
})
