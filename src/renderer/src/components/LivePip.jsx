import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLive } from './Live'

// Live preview, picture in picture: switched on from the sidebar's queue box, it floats in a corner of every page
// and shows what's rendering now. For H3 previews on this PC that's each step's picture as it's made (Live.jsx);
// other renders show their name, step and time. Drag it by its top bar to another corner; ⤢ makes it bigger.
// Nothing rendering: it shrinks to a small pill, so it's clear it's still on.
const CORNERS = ['br', 'bl', 'tr', 'tl']
const SMALL = 340
const BIG = 540
// from 240 px to most of the window (its sidebar and a margin left over)
const clampW = (w) => Math.round(Math.max(240, Math.min(w, innerWidth - 260, (innerHeight - 160) * 1.9, 1600)))
const load = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d
  } catch {
    return d
  }
}
const save = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function LivePip({ items, now, kindLabel, open, onOff }) {
  const [corner, setCorner] = useState(() => (CORNERS.includes(load('iv.livePipCorner')) ? load('iv.livePipCorner') : 'br'))
  // its width, set by dragging the grip on its inner corner (or ⤢ for the two quick sizes); remembered
  const [width, setWidth] = useState(() => {
    const w = Number(load('iv.livePipW', '')) || (load('iv.livePipBig') === '1' ? BIG : SMALL)
    return clampW(w)
  })
  const [drag, setDrag] = useState(null) // { dx, dy } while dragging
  const [sizing, setSizing] = useState(false)
  const box = useRef(null)
  const item = items.find((i) => i.state === 'running' && i.ours) || items.find((i) => i.state === 'running') || null
  const live = useLive(item?.ours ? item.promptId : null)
  const waiting = items.filter((i) => i.state !== 'running').length
  const big = width >= (SMALL + BIG) / 2

  useEffect(() => save('iv.livePipW', String(Math.round(width))), [width])
  // a smaller window keeps it inside the window
  useEffect(() => {
    const fit = () => setWidth((w) => clampW(w))
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // resize by the grip: it sits on the corner facing into the page, so the panel grows away from the corner it's
  // pinned to (pinned right: dragging left makes it wider)
  function startSize(e) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const sx = e.clientX
    const sy = e.clientY
    const w0 = width
    const h0 = box.current?.getBoundingClientRect().height || 1
    const ar = w0 / h0
    const sxSign = corner.endsWith('r') ? -1 : 1
    const sySign = corner.startsWith('b') ? -1 : 1
    setSizing(true)
    const move = (ev) => {
      // follow whichever way the mouse moved further, across or up/down (height turned into width by the shape)
      const byX = (ev.clientX - sx) * sxSign
      const byY = (ev.clientY - sy) * sySign * ar
      setWidth(clampW(w0 + (Math.abs(byX) >= Math.abs(byY) ? byX : byY)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setSizing(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // drag by the top bar; on release it settles in the nearest corner
  function startDrag(e) {
    if (e.button !== 0 || e.target.closest('button')) return
    const sx = e.clientX
    const sy = e.clientY
    const move = (ev) => setDrag({ dx: ev.clientX - sx, dy: ev.clientY - sy })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // where it was let go (the rectangle still carries the drag offset), then back to resting in a corner
      const b = box.current?.getBoundingClientRect()
      setDrag(null)
      if (!b) return
      const cx = b.left + b.width / 2
      const cy = b.top + b.height / 2
      const next = `${cy > innerHeight / 2 ? 'b' : 't'}${cx > innerWidth / 2 ? 'r' : 'l'}`
      setCorner(next)
      save('iv.livePipCorner', next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // the left corners sit just past the sidebar (none in the full-screen editor); it re-measures every second
  const navRight = Math.max(0, document.querySelector('.nav')?.getBoundingClientRect().right || 0)
  const style = {
    ...(corner.endsWith('l') ? { left: navRight + 20 } : null),
    ...(drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)`, transition: 'none' } : null)
  }
  const sized = { ...style, width, ...(sizing ? { transition: 'none' } : null) }
  const pct = item?.progress?.max ? Math.round((item.progress.value / item.progress.max) * 100) : null

  const body = !item ? (
    <div ref={box} className={`live-pip idle c-${corner}`} style={style} onPointerDown={startDrag} role="status">
      <span className="live-pip-dot" />
      <span className="mono">Live preview</span>
      <span className="mono dim">nothing rendering</span>
      <button className="live-pip-icon" onClick={onOff} title="Turn the live preview off" aria-label="Turn the live preview off">
        ×
      </button>
    </div>
  ) : (
    <div ref={box} className={`live-pip c-${corner} ${sizing ? 'sizing' : ''}`} style={sized} role="region" aria-label="Live preview">
      <span className="live-pip-grip" onPointerDown={startSize} onDoubleClick={() => setWidth(clampW(big ? SMALL : BIG))} title="Drag to resize (double-click: small or big)" aria-hidden="true" />
      <div className="live-pip-bar" onPointerDown={startDrag} title="Drag to move it to another corner">
        <span className="live-pip-dot on" />
        <span className="mono live-pip-tag">Live</span>
        <span className="live-pip-name">{item.ours ? item.name || kindLabel(item.kind) : 'Other ComfyUI work'}</span>
        <button className="live-pip-icon" onClick={() => setWidth(clampW(big ? SMALL : BIG))} title={big ? 'Smaller' : 'Bigger'} aria-label={big ? 'Smaller' : 'Bigger'}>
          {big ? '⤡' : '⤢'}
        </button>
        <button className="live-pip-icon" onClick={onOff} title="Turn the live preview off" aria-label="Turn the live preview off">
          ×
        </button>
      </div>
      <div className="live-pip-pic">
        {live ? (
          <img src={live.image} alt={`Step ${live.step} of ${live.total}`} />
        ) : (
          <div className="live-pip-empty mono small dim">
            {!item.ours
              ? 'Started outside IV Studio: no picture to show.'
              : item.kind === 'previews' || item.kind === 'finish'
                ? 'The first step’s picture shows here in a few seconds.'
                : 'This kind of render shows its progress, not a picture, until it’s done.'}
          </div>
        )}
      </div>
      <div className="live-pip-foot">
        <span className="mono small">
          {[item.ours && item.name && kindLabel(item.kind), item.kind === 'previews' && live?.take && `take ${live.take}`, item.progress ? `step ${item.progress.value}/${item.progress.max}` : live ? `step ${live.step}/${live.total}` : 'rendering', item.startedAt && clock(now - item.startedAt)].filter(Boolean).join(' · ')}
        </span>
        {item.ours && (
          <button className="link-btn mono" onClick={() => open(item)}>
            Open →
          </button>
        )}
      </div>
      <span className="live-pip-progress">
        <span style={{ width: `${pct ?? 0}%` }} />
      </span>
      {waiting > 0 && <div className="live-pip-more mono small dim">+ {waiting} waiting</div>}
    </div>
  )
  return createPortal(body, document.body)
}
