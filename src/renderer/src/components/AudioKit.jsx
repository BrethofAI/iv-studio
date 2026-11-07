import { useEffect, useRef, useState } from 'react'
import { fileUrl } from './edit/model'

// The audio side's shared pieces (Voices, Lines, Music): a track row with a play button and a real waveform you
// can click to jump, a "⋯" menu for the less common actions, and a face or initial for a voice.

const clock = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// ---- one sound at a time: starting a track pauses whichever was playing
let playing = null
function claim(el) {
  if (playing && playing !== el) playing.pause()
  playing = el
}

// ---- waveforms: the file is decoded once (two at a time, only when its row is on screen) and kept as peaks
const BARS = 96
const peaks = new Map() // src -> Promise<number[]>
let ctx = null
let running = 0
const waiting = []
function slot() {
  return new Promise((res) => (running < 2 ? (running++, res()) : waiting.push(res)))
}
function release() {
  running--
  const next = waiting.shift()
  if (next) (running++, next())
}
function peaksOf(src) {
  if (!peaks.has(src))
    peaks.set(
      src,
      (async () => {
        await slot()
        try {
          const buf = await (await fetch(src)).arrayBuffer()
          ctx ||= new AudioContext()
          const audio = await ctx.decodeAudioData(buf)
          const data = audio.getChannelData(0)
          const step = Math.max(1, Math.floor(data.length / BARS))
          const out = []
          for (let i = 0; i < BARS; i++) {
            let max = 0
            for (let j = i * step, end = Math.min(data.length, j + step); j < end; j += 8) max = Math.max(max, Math.abs(data[j]))
            out.push(max)
          }
          const top = Math.max(...out, 0.0001)
          return out.map((v) => Math.max(0.06, Math.sqrt(v / top)))
        } finally {
          release()
        }
      })().catch(() => null)
    )
  return peaks.get(src)
}

function useWave(src, ref) {
  const [wave, setWave] = useState(() => null)
  useEffect(() => {
    if (!src || !ref.current) return
    let live = true
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        peaksOf(src).then((p) => live && setWave(p))
      },
      { rootMargin: '200px' }
    )
    io.observe(ref.current)
    return () => {
      live = false
      io.disconnect()
    }
  }, [src])
  return wave
}

// A player: the round button, the waveform (click or drag to jump) and the time. `file` is a path on this PC.
export function Player({ file, duration, label = 'this', size = 'normal' }) {
  const src = file ? fileUrl(file) : null
  const el = useRef(null)
  const waveRef = useRef(null)
  const wave = useWave(src, waveRef)
  const [on, setOn] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(duration || 0)
  useEffect(() => () => el.current?.pause(), [])
  function toggle() {
    const a = el.current
    if (!a) return
    if (a.paused) {
      claim(a)
      a.play().catch(() => {})
    } else a.pause()
  }
  function seekAt(clientX) {
    const a = el.current
    const box = waveRef.current?.getBoundingClientRect()
    if (!a || !box) return
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
    const go = () => {
      a.currentTime = frac * (a.duration || dur)
      setT(a.currentTime)
    }
    if (a.readyState >= 1) go()
    else (a.preload = 'metadata', a.addEventListener('loadedmetadata', go, { once: true }), a.load())
  }
  function down(e) {
    if (e.button !== 0) return
    seekAt(e.clientX)
    const move = (ev) => seekAt(ev.clientX)
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  function key(e) {
    const a = el.current
    if (!a) return
    if (e.key === 'ArrowRight') (e.preventDefault(), (a.currentTime = Math.min((a.duration || dur), a.currentTime + 2)))
    if (e.key === 'ArrowLeft') (e.preventDefault(), (a.currentTime = Math.max(0, a.currentTime - 2)))
  }
  const frac = dur ? Math.min(1, t / dur) : 0
  const bars = wave || Array.from({ length: BARS }, (_, i) => 0.18 + 0.12 * Math.abs(Math.sin(i * 0.7)))
  return (
    <div className={`player ${on ? 'on' : ''} ${size}`}>
      <audio
        ref={el}
        src={src || undefined}
        // files that don't store their length read just their header for it
        preload={duration ? 'none' : 'metadata'}
        onPlay={() => setOn(true)}
        onPause={() => setOn(false)}
        onEnded={() => (setOn(false), setT(0))}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
      />
      <button className="player-btn" onClick={toggle} disabled={!src} aria-label={on ? `Pause ${label}` : `Play ${label}`} title={on ? 'Pause' : 'Play'}>
        {on ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="3.5" y="2.5" width="3" height="11" rx="0.6" fill="currentColor" />
            <rect x="9.5" y="2.5" width="3" height="11" rx="0.6" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4.5 2.6v10.8L13 8z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div ref={waveRef} className={`wave ${wave ? '' : 'pending'}`} onPointerDown={down} onKeyDown={key} role="slider" tabIndex={0} aria-label={`Position in ${label}`} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}>
        <div className="wave-bars">
          {bars.map((h, i) => (
            <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
        </div>
        <div className="wave-bars wave-played" style={{ clipPath: `inset(0 ${100 - frac * 100}% 0 0)` }} aria-hidden="true">
          {bars.map((h, i) => (
            <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
        </div>
      </div>
      <span className="player-time mono">
        {clock(t)} / {clock(dur)}
      </span>
    </div>
  )
}

// A track row: the words or name, small details, the player, and the actions on the right.
export function Track({ file, duration, title, titleClass = '', sub, meta, actions, status, children, clamp = true }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="track">
      <div className="track-main">
        {title != null && (
          <div className={`track-title ${clamp && !open ? 'clamp' : ''} ${titleClass}`} onClick={() => clamp && setOpen((o) => !o)} title={clamp && !open ? 'Click to read it all' : undefined}>
            {title}
          </div>
        )}
        {sub && <div className="track-sub">{sub}</div>}
        {meta && <div className="track-meta mono">{meta}</div>}
        {status ?? <Player file={file} duration={duration} label={typeof title === 'string' ? title.slice(0, 40) : 'this'} />}
        {children}
      </div>
      {actions && <div className="track-actions">{actions}</div>}
    </div>
  )
}

// "⋯": the less common actions. items: [{ label, onClick, danger, disabled, divider }]
export function MoreMenu({ items, label = 'More' }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => (window.removeEventListener('pointerdown', close), window.removeEventListener('keydown', esc))
  }, [open])
  return (
    <div className="more-menu" ref={box}>
      <button className="more-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}>
        ⋯
      </button>
      {open && (
        <div className="more-list" role="menu">
          {items.filter(Boolean).map((it, i) =>
            it.divider ? (
              <div key={i} className="more-divider">
                {it.label}
              </div>
            ) : (
              <button
                key={i}
                role="menuitem"
                className={it.danger ? 'danger' : ''}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onClick()
                }}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// A voice's face: the character who has it, or its first letter.
export function VoiceAvatar({ name, picture, size = 36 }) {
  return (
    <span className="voice-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {picture ? <img src={fileUrl(picture)} alt="" /> : (name || '?').trim().slice(0, 1).toUpperCase()}
    </span>
  )
}

// A small search box for long lists.
export function ListSearch({ value, onChange, placeholder }) {
  return <input className="list-search" type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
}

export { clock }
