import { useEffect, useRef, useState } from 'react'

// Two takes against each other: side by side or a wipe, played, paused and scrubbed together, with the word
// changes between their prompts. a and b: { url, label, prompt }.
export function CompareViewer({ a, b, onClose }) {
  const [mode, setMode] = useState('side')
  const [split, setSplit] = useState(50)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [length, setLength] = useState(0)
  const va = useRef(null)
  const vb = useRef(null)
  const both = (fn) => [va.current, vb.current].forEach((v) => v && fn(v))

  useEffect(() => {
    const keys = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') (e.preventDefault(), toggle())
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })
  // b follows a, so they stay frame-aligned however long either one takes to load
  useEffect(() => {
    const v = va.current
    if (!v) return
    const tick = () => {
      setT(v.currentTime)
      if (vb.current && Math.abs(vb.current.currentTime - v.currentTime) > 0.06) vb.current.currentTime = v.currentTime
    }
    v.addEventListener('timeupdate', tick)
    return () => v.removeEventListener('timeupdate', tick)
  }, [mode])
  function toggle() {
    if (playing) both((v) => v.pause())
    else both((v) => v.play().catch(() => {}))
    setPlaying(!playing)
  }
  function seek(sec) {
    both((v) => (v.currentTime = sec))
    setT(sec)
  }
  const video = (ref, take, extra = {}) => <video ref={ref} src={take.url} muted={ref === vb} loop playsInline preload="auto" onLoadedMetadata={(e) => ref === va && setLength(e.target.duration)} {...extra} />

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal compare">
        <div className="compare-head">
          <div className="segmented">
            <button className={mode === 'side' ? 'on' : ''} onClick={() => setMode('side')}>
              Side by side
            </button>
            <button className={mode === 'wipe' ? 'on' : ''} onClick={() => setMode('wipe')}>
              Wipe
            </button>
          </div>
          <span className="mono dim small">Space plays both · the sound is the left take&apos;s</span>
          <button className="link-btn mono" onClick={onClose}>
            Close
          </button>
        </div>
        {mode === 'side' ? (
          <div className="compare-side">
            <figure>
              {video(va, a)}
              <figcaption className="mono small">{a.label}</figcaption>
            </figure>
            <figure>
              {video(vb, b)}
              <figcaption className="mono small">{b.label}</figcaption>
            </figure>
          </div>
        ) : (
          <div className="compare-wipe">
            {video(va, a)}
            {video(vb, b, { style: { clipPath: `inset(0 0 0 ${split}%)` } })}
            <div className="wipe-line" style={{ left: `${split}%` }} />
            <input className="wipe-slider" type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Wipe position" />
            <span className="wipe-label left mono small">{a.label}</span>
            <span className="wipe-label right mono small">{b.label}</span>
          </div>
        )}
        <div className="compare-transport">
          <button className="btn btn-small" onClick={toggle}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input type="range" min={0} max={length || 1} step={1 / 24} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="Position" />
          <span className="mono small">
            {t.toFixed(2)} / {length.toFixed(2)} s
          </span>
        </div>
        {a.prompt !== b.prompt && a.prompt && b.prompt && (
          <details className="compare-diff" open>
            <summary className="mono dim">What changed in the prompt</summary>
            <PromptDiff before={a.prompt} after={b.prompt} />
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
