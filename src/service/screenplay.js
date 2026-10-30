// Plain-text and Fountain screenplays into scenes: a heading (INT. / EXT. ... - DAY), action paragraphs, and
// dialogue under a character cue in capitals. Pure: no files, no Node APIs.
//   parseScript(text) -> { title, scenes: [{ heading, location, time, elements: [{ type: 'action' | 'dialogue',
//   text, who?, paren? }] }], speakers: [names] }

const HEADING = /^(?:\.(?=[A-Za-z])|(?:INT\.?\/EXT|I\/E|INT|EXT|EST)[.\s])/i
const TRANSITION = /^(?:[A-Z ]+TO:|FADE (?:IN|OUT)[.:]?|FADE TO BLACK\.?|THE END\.?|>.*)$/
const EXTENSION = /\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT['’]?D|CONTINUED)\)\s*/gi
// A character cue: a short line in capitals with at least one letter (a trailing ^ marks dual dialogue in Fountain).
const isCue = (line) => {
  const s = line.replace(EXTENSION, '').replace(/\^$/, '').trim()
  return s.length > 0 && s.length <= 40 && /[A-Z]/.test(s) && s === s.toUpperCase() && !/[.!?:]$/.test(s) && !HEADING.test(s)
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase())

export function parseScript(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  // Fountain's title page: "Key: value" lines before the first blank line
  let title = null
  let i = 0
  if (/^\s*title\s*:/i.test(lines[0] || '')) {
    for (; i < lines.length && lines[i].trim(); i++) {
      const m = lines[i].match(/^\s*title\s*:\s*(.+)$/i)
      if (m) title = m[1].trim()
    }
  }
  // paragraphs: runs of non-blank lines
  const paras = []
  let cur = []
  for (; i < lines.length; i++) {
    const l = lines[i].trimEnd()
    if (!l.trim()) {
      if (cur.length) paras.push(cur), (cur = [])
    } else cur.push(l.trim())
  }
  if (cur.length) paras.push(cur)

  const scenes = []
  let scene = null
  const ensure = () => scene || ((scene = { heading: null, location: null, time: null, elements: [] }), scenes.push(scene), scene)
  for (const p of paras) {
    const first = p[0]
    if (HEADING.test(first)) {
      const heading = first.replace(/^\./, '').replace(/\s+#[^#]*#\s*$/, '').trim()
      const m = heading.match(/^(?:INT\.?\/EXT|I\/E|INT|EXT|EST)[.\s]+(.*?)(?:\s+[-–—]\s+(.+))?$/i)
      scene = { heading: heading.toUpperCase(), location: m ? titleCase(m[1].trim()) : titleCase(heading), time: m?.[2] ? titleCase(m[2].trim()) : null, elements: [] }
      scenes.push(scene)
      if (p.length > 1) scene.elements.push({ type: 'action', text: p.slice(1).join(' ') })
      continue
    }
    if (p.length === 1 && TRANSITION.test(first)) continue
    if (p.length > 1 && isCue(first)) {
      const who = titleCase(first.replace(EXTENSION, '').replace(/\^$/, '').replace(/^@/, '').trim())
      const paren = p.slice(1).filter((l) => /^\(.*\)$/.test(l)).map((l) => l.slice(1, -1)).join('; ') || null
      const said = p.slice(1).filter((l) => !/^\(.*\)$/.test(l)).join(' ').trim()
      if (said) ensure().elements.push({ type: 'dialogue', who, text: said, ...(paren && { paren }) })
      continue
    }
    ensure().elements.push({ type: 'action', text: p.join(' ').replace(/^!/, '') })
  }
  scenes.forEach((s, k) => {
    if (!s.heading) s.heading = `SCENE ${k + 1}`
  })
  const speakers = [...new Set(scenes.flatMap((s) => s.elements.filter((e) => e.type === 'dialogue').map((e) => e.who)))]
  return { title, scenes: scenes.filter((s) => s.elements.length || s.heading), speakers }
}

// A scene as plain screenplay text again (what the shot writer reads).
export function sceneText(scene) {
  const out = [scene.heading]
  for (const e of scene.elements) out.push(e.type === 'dialogue' ? `${e.who.toUpperCase()}${e.paren ? ` (${e.paren})` : ''}: ${e.text}` : e.text)
  return out.join('\n')
}
