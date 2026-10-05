import type { Register, EngineInterface } from 'claude-code'
import {
  emptyTotals,
  addUsage,
  claudeTotal,
  parseJob,
  localTotal,
  statusLine,
  spawnDecision,
  paneLines,
  spinnerSuffix,
  freshTotal,
  dotsOwed,
  stepEaten,
  liveFrame,
  scoreLine,
} from './tally'
import type { Totals, LocalJob, Run, Tone } from './tally'

let totals: Totals = emptyTotals()
let jobs: LocalJob[] = []
let confirmed = new Set<string>()
let sid = ''
let jobsDir = ''
const PANE = 'token-meter'
let mainTurnId = ''
let turnBase = 0
let eaten = 0

async function save($: EngineInterface) {
  await $.store.set('totals:' + sid, totals)
}

async function scanLocal($: EngineInterface) {
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

function show($: EngineInterface) {
  $.ui.status(statusLine(claudeTotal(totals), localTotal(jobs)))
  $.ui.invalidate('ui.render')
}

function toneProps(tone: Tone) {
  if (tone === 'head') return { bold: true }
  if (tone === 'dim') return { dimColor: true }
  if (tone === 'amber') return { color: '#e8a33d' }
  if (tone === 'green') return { color: '#6bcb77' }
  return {}
}

export const register: Register = on => {
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
    eaten = dotsOwed(freshTotal(totals))
    await $.command.register({ name: 'tokens', description: 'Token use this session: Claude per model, local per box' })
    await scanLocal($)
    show($)
    $.clock.every(20000, async () => {
      await scanLocal($)
      show($)
    })
    $.clock.every(120, () => {
      const owed = dotsOwed(freshTotal(totals))
      if (eaten < owed) {
        eaten = stepEaten(eaten, owed)
        $.ui.invalidate('ui.render')
      }
    })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.turnId !== mainTurnId) {
      mainTurnId = e.turnId
      turnBase = claudeTotal(totals).all
    }
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

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const n = claudeTotal(totals).all - turnBase
    return next({ ...e, props: { ...e.props, suffix: spinnerSuffix(n) } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const fresh = freshTotal(totals)
    const lines: Run[][] = [
      scoreLine(fresh),
      liveFrame(eaten, dotsOwed(fresh)),
      [],
      ...paneLines(totals, jobs),
    ]
    return (
      <Box flexDirection="column">
        {lines.map(line =>
          line.length === 0 ? (
            <Text> </Text>
          ) : (
            <Text wrap="wrap">
              {line.map((r: Run) => (
                <Text {...toneProps(r.tone)}>{r.text}</Text>
              ))}
            </Text>
          ),
        )}
      </Box>
    )
  })

  on('command.run', { command: 'tokens' }, async $ => {
    await scanLocal($)
    show($)
    await $.ui.open({ id: PANE, title: 'Tokens · this session', columns: 56 })
    return { text: 'Opened the tokens pane.' }
  })
}
