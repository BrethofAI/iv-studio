import { useEffect, useMemo, useRef, useState } from 'react'

// Versions of a shot against each other (takes, finals, enhanced copies): up to four, played, paused, stepped and
// scrubbed together. Side by side and Wipe show the first two; Grid shows them all. Zoom (1x, 2x, 4x) looks at the
// same spot in every one, which is where upscalers differ; double-click a picture to choose the spot. Each slot can
// be swapped for any other version of the shot (pool). The sound is the first one's.
//   items: [{ key, url, label, prompt }] (2-4), or a and b; pool: every version the slots can take.
export function CompareViewer({ a, b, items, pool = [], onClose }) {
  const start = items || [a, b].filter(Boolean)
  const all = useMemo(() => {
    const seen = new Map()
    for (const it of [...start, ...pool]) if (it?.url && !seen.has(it.key)) seen.set(it.key, it)
    return [...seen.values()]
  }, [pool])
  const [slots, setSlots] = useState(start.map((it) => it.key).slice(0, 4))
  const shown = slots.map((k) => all.find((it) => it.key === k)).filter(Boolean)
  const [mode, setMode] = useState(start.length > 2 ? 'grid' : 'side')
  const [split, setSplit] = useState(50)
  const [zoom, setZoom] = useState(1)
  const [focus, setFocus] = useState({ x: 50, y: 40 })
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [length, setLength] = useState(0)
  // the shot's shape, from the first version: Wipe lays both pictures in one box of it, so a zoom lines up
  const [ar, setAr] = useState(16 / 9)
  const refs = useRef([])
  const live = () => refs.current.filter(Boolean)
  const visible = mode === 'grid' ? shown : shown.slice(0, 2)

  useEffect(() => {
    const keys = (e) => {
      if (e.target.tagName === 'SELECT') return
      if (e.key === 'Escape') onClose()
      else if (e.key === ' ') (e.preventDefault(), toggle())
      else if (e.key === ',' || e.key === 'ArrowLeft') (e.preventDefault(), step(-1))
      else if (e.key === '.' || e.key === 'ArrowRight') (e.preventDefault(), step(1))
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })
  // every other picture follows the first, so they stay frame-aligned however long each takes to load
  useEffect(() => {
    const lead = refs.current[0]
    if (!lead) return
    const tick = () => {
      setT(lead.currentTime)
      for (const v of refs.current.slice(1)) if (v && Math.abs(v.currentTime - lead.currentTime) > 0.06) v.currentTime = lead.currentTime
    }
    lead.addEventListener('timeupdate', tick)
    lead.addEventListener('seeked', tick)
    return () => (lead.removeEventListener('timeupdate', tick), lead.removeEventListener('seeked', tick))
  }, [mode, slots.join('|')])
  // a changed slot or mode starts paused, at the same moment
  useEffect(() => {
    setPlaying(false)
    const at = t
    requestAnimationFrame(() => live().forEach((v) => (v.pause(), (v.currentTime = at))))
  }, [mode, slots.join('|')])

  function toggle() {
    if (playing) {
      // paused, every picture lands on the first one's frame
      live().forEach((v) => v.pause())
      const at = refs.current[0]?.currentTime ?? t
      live().forEach((v) => (v.currentTime = at))
      setT(at)
    } else live().forEach((v) => v.play().catch(() => {}))
    setPlaying(!playing)
  }
  function seek(sec) {
    live().forEach((v) => (v.currentTime = sec))
    setT(sec)
  }
  function step(frames) {
    live().forEach((v) => v.pause())
    setPlaying(false)
    seek(Math.min(Math.max(0, t + frames / 24), length || t))
  }
  function aim(e) {
    const r = e.currentTarget.getBoundingClientRect()
    setFocus({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) })
    if (zoom === 1) setZoom(2)
  }
  const swap = (i, key) => setSlots((s) => s.map((k, j) => (j === i ? key : k)))
  const unused = all.filter((it) => !slots.includes(it.key))

  refs.current = []
  const look = { transform: `scale(${zoom})`, transformOrigin: `${focus.x}% ${focus.y}%` }
  const frame = (it, i, extra = {}) => (
    <div className="cmp-frame" onDoubleClick={aim} {...extra}>
      <video
        ref={(el) => (refs.current[i] = el)}
        src={it.url}
        muted={i !== 0}
        loop
        playsInline
        preload="auto"
        style={look}
        onLoadedMetadata={(e) => i === 0 && (setLength(e.target.duration), e.target.videoHeight && setAr(e.target.videoWidth / e.target.videoHeight))}
      />
    </div>
  )

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal compare compare-${mode}-mode`}>
        <div className="compare-head">
          <div className="segmented">
            <button className={mode === 'side' ? 'on' : ''} onClick={() => setMode('side')}>
              Side by side
            </button>
            <button className={mode === 'wipe' ? 'on' : ''} onClick={() => setMode('wipe')}>
              Wipe
            </button>
            <button className={mode === 'grid' ? 'on' : ''} disabled={shown.length < 3} title={shown.length < 3 ? 'Add a third version to see a grid' : 'Every version at once'} onClick={() => setMode('grid')}>
              Grid
            </button>
          </div>
          <div className="segmented compare-zoom" title="Double-click a picture to choose where to look">
            {[1, 2, 4].map((z) => (
              <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>
                {z}×
              </button>
            ))}
          </div>
          <span className="mono dim small">Space plays · ← → a frame · double-click to zoom there</span>
          <button className="link-btn mono" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="compare-slots">
          {shown.map((it, i) => (
            <label key={`${i}:${it.key}`} className={`compare-slot ${mode !== 'grid' && i > 1 ? 'off' : ''}`}>
              <span className="mono">{mode === 'wipe' ? (i === 0 ? 'Left' : i === 1 ? 'Right' : 'Not shown') : String.fromCharCode(65 + i)}</span>
              <select value={it.key} onChange={(e) => swap(i, e.target.value)} aria-label={`Version ${i + 1}`}>
                {[it, ...unused].map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {shown.length > 2 && (
                <button className="compare-slot-x" title="Take it out" onClick={(e) => (e.preventDefault(), setSlots((s) => s.filter((_, j) => j !== i)))}>
                  ×
                </button>
              )}
            </label>
          ))}
          {shown.length < 4 && unused.length > 0 && (
            <button
              className="link-btn mono"
              onClick={() => {
                setSlots((s) => [...s, unused[0].key])
                setMode('grid')
              }}
            >
              + Add a version
            </button>
          )}
        </div>

        {mode === 'side' && (
          <div className="compare-side">
            {visible.map((it, i) => (
              <figure key={`${i}:${it.key}`}>
                {frame(it, i)}
                <figcaption className="mono small">{it.label}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {mode === 'wipe' && visible.length === 2 && (
          <div className="compare-wipe" style={{ '--ar': ar }} onDoubleClick={aim}>
            {frame(visible[0], 0, { className: 'cmp-frame cmp-layer' })}
            {frame(visible[1], 1, { className: 'cmp-frame cmp-layer cmp-top', style: { clipPath: `inset(0 0 0 ${split}%)` } })}
            <div className="wipe-line" style={{ left: `${split}%` }} />
            <input className="wipe-slider" type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Wipe position" />
            <span className="wipe-label left mono small">{visible[0].label}</span>
            <span className="wipe-label right mono small">{visible[1].label}</span>
          </div>
        )}
        {mode === 'grid' && (
          <div className={`compare-grid n${visible.length}`}>
            {visible.map((it, i) => (
              <figure key={`${i}:${it.key}`}>
                {frame(it, i)}
                <figcaption className="mono small">{it.label}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="compare-transport">
          <button className="btn btn-small" onClick={toggle}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input type="range" min={0} max={length || 1} step={1 / 24} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="Position" />
          <span className="mono small">
            {t.toFixed(2)} / {length.toFixed(2)} s · frame {Math.round(t * 24) + 1}
          </span>
        </div>
        {visible[0]?.prompt !== visible[1]?.prompt && visible[0]?.prompt && visible[1]?.prompt && (
          <details className="compare-diff" open>
            <summary className="mono dim">What changed in the prompt</summary>
            <PromptDiff before={visible[0].prompt} after={visible[1].prompt} />
          </details>
        )}
      </div>
    </div>
  )
}

// Word changes from one prompt to the next: removed words struck through, added ones marked.
export function PromptDiff({ before, after }) {
  return (
    <pre className="prompt-diff">
      {wordDiff(before, after).map(([op, text], i) => (op === '=' ? text : <span key={i} className={op === '+' ? 'added' : 'removed'}>{text}</span>))}
    </pre>
  )
}

// The longest common run of words between two texts, as [op, text] pieces ('=', '+', '-'), whitespace kept.
export function wordDiff(a, b) {
  const x = String(a).split(/(\s+)/)
  const y = String(b).split(/(\s+)/)
  const n = x.length
  const m = y.length
  if (n * m > 4e6) return [['-', a], ['+', b]]
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out = []
  const push = (op, text) => (out.length && out.at(-1)[0] === op ? (out.at(-1)[1] += text) : out.push([op, text]))
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('=', x[i++])
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('-', x[i++])
    else push('+', y[j++])
  }
  while (i < n) push('-', x[i++])
  while (j < m) push('+', y[j++])
  return out
}

// What changed between a run and the one before it, in a few words.
export function runChanges(req, prev) {
  if (!prev) return []
  const out = []
  if ((req.prompt || '') !== (prev.prompt || '')) out.push('prompt')
  if (req.mode !== prev.mode) out.push(`${prev.mode} → ${req.mode}`)
  if (req.seed !== prev.seed) out.push(`seed ${prev.seed} → ${req.seed}`)
  if (req.seconds !== prev.seconds) out.push(`${prev.seconds} s → ${req.seconds} s`)
  if (req.aspect !== prev.aspect) out.push(`${prev.aspect} → ${req.aspect}`)
  if (req.character !== prev.character) out.push('character')
  if (JSON.stringify(req.extraLoras || []) !== JSON.stringify(prev.extraLoras || [])) out.push('LoRAs')
  if (JSON.stringify((req.media || []).map((m) => m.file)) !== JSON.stringify((prev.media || []).map((m) => m.file))) out.push('references')
  if (req.megapixels !== prev.megapixels) out.push(`${prev.megapixels} → ${req.megapixels} MP`)
  return out
}
