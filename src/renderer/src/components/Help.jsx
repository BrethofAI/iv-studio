import { useEffect, useState } from 'react'
import { TIPS, TIPS_FOR_ART, VIDEO_TITLES } from '../learn'
import { VIDEOS } from '../learnVideos'

// The "?" beside a page's title: the page's tutorial video and the tips that are easy to miss (learn.js TIPS).
// page: a TIPS key, or the banner's art, which maps to one.
export default function Help({ page, art }) {
  const key = page || TIPS_FOR_ART[art]
  const help = TIPS[key]
  const [open, setOpen] = useState(false)
  const [watching, setWatching] = useState(false)
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  if (!help) return null
  return (
    <>
      <button className="help-btn" onClick={() => setOpen(!open)} aria-label="Tips for this page" title="Tips for this page">
        ?
      </button>
      {open && (
        <div className="help-panel" role="dialog" aria-label="Tips">
          <div className="help-head">
            <span className="mono small pink">Easy to miss</span>
            <button className="lora-chip-x" aria-label="Close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <ul>
            {help.tips.map((t) => (
              <li key={t} className="small">
                {t}
              </li>
            ))}
          </ul>
          {VIDEOS[help.video] && (
            <button className="btn btn-small" onClick={() => setWatching(true)}>
              ▶ Watch: {VIDEO_TITLES[help.video]}
            </button>
          )}
          <button
            className="link-btn mono small"
            onClick={() => {
              setOpen(false)
              window.dispatchEvent(new CustomEvent('iv:go', { detail: { page: 'learn' } }))
            }}
          >
            More on the Learn page →
          </button>
        </div>
      )}
      {watching && <VideoPlayer id={help.video} onClose={() => setWatching(false)} />}
    </>
  )
}

// A tutorial video in a pop-up.
export function VideoPlayer({ id, onClose }) {
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal learn-player" role="dialog" aria-label={VIDEO_TITLES[id]}>
        <div className="modal-head">
          <h3>{VIDEO_TITLES[id]}</h3>
          <button className="lora-chip-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <video src={VIDEOS[id]} controls autoPlay />
      </div>
    </div>
  )
}
