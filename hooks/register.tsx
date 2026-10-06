import type { Register } from 'claude-code'
import { createRain, stepRain, fitRain, renderRain, BAND_ROWS } from './rain'
import type { Rain, Run, Tone } from './rain'

const PANE = 'matrix-rain'
let paneOpen = false
let bandOn = true
let working = false
let paneRain: Rain | null = null
let bandRain: Rain | null = null

function toneProps(tone: Tone): { color?: string; bold?: boolean } {
  switch (tone) {
    case 'head': return { color: '#e8ffe8', bold: true }
    case 'bright': return { color: '#00ff41' }
    case 'mid': return { color: '#00b32c' }
    case 'dim': return { color: '#005f1a' }
    case 'blank': return {}
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('band')
    if (typeof saved === 'boolean') bandOn = saved

    await $.command.register({
      name: 'matrix',
      description: 'Matrix rain: /matrix toggles the pane, /matrix band toggles rain while Claude works'
    })

    $.clock.every(80, () => {
      let changed = false
      if (paneOpen) {
        if (paneRain) stepRain(paneRain)
        changed = true
      }
      if (bandOn && working) {
        if (bandRain) stepRain(bandRain)
        changed = true
      }
      if (changed) {
        $.ui.invalidate('ui.render')
      }
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    working = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    working = false
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      paneOpen = false
      paneRain = null
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    paneOpen = true
    paneRain = fitRain(paneRain, e.props.bodyColumns, e.props.scroll.bodyRows, Date.now() | 0)
    const lines = renderRain(paneRain)
    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text wrap="truncate-end">
            {line.map((r: Run) => (
              <Text {...toneProps(r.tone)}>{r.text}</Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    if (!bandOn || !e.props.isWorking || e.props.hasSurvey) {
      bandRain = null
      return next(e)
    }
    bandRain = fitRain(bandRain, e.props.bodyColumns, Math.min(BAND_ROWS, e.props.maxRows), Date.now() | 0)
    const lines = renderRain(bandRain)
    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text wrap="truncate-end">
            {line.map((r: Run) => (
              <Text {...toneProps(r.tone)}>{r.text}</Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'matrix' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'band') {
      bandOn = !bandOn
      await $.store.set('band', bandOn)
      $.ui.invalidate('ui.render')
      return { text: bandOn ? 'Rain while Claude works: on.' : 'Rain while Claude works: off.' }
    }

    const open = (await $.ui.panes()).some(p => p.id === PANE)
    if (open) {
      await $.ui.close({ id: PANE })
      paneOpen = false
      paneRain = null
      return { text: 'Left the Matrix.' }
    } else {
      await $.ui.open({ id: PANE, title: 'Matrix', columns: 48 })
      paneOpen = true
      return { text: 'Entering the Matrix. /matrix again to leave, /matrix band toggles rain while Claude works.' }
    }
  })
}
