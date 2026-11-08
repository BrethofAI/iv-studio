import { useState } from 'react'
import Hero from './Hero'
import { StepHead, DropIcon } from './CreateKit'
import { NEEDS } from '../workflows'

// The Workflows tools (Sequences, Replace, Reel, Shinobi, Sizzle) in Create's style: numbered step cards, choice
// cards, a drop zone and, where a tool has one main action, a pinned summary card (a bar at the bottom of narrow
// windows). The page wraps itself in .create-v2 so Create's layout and pieces apply.

// What a tool needs beyond IV Studio (workflows.js), under its banner's note, the same words as on its card.
export function WorkflowNeeds({ page }) {
  const needs = NEEDS[page]
  if (!needs?.length) return null
  return (
    <p className="workflow-needs stage-needs small">
      <span className="mono pink">Needs</span> {needs.join(' · ')}
    </p>
  )
}

// The banner, with the way back to Workflows (or to the tool's own list).
export function FlowHero({ go, back, ...props }) {
  return <Hero back={back || (go && { label: 'Workflows', onClick: () => go('workflows') })} {...props} />
}

export function Step({ n, title, sub, className = '', children, right }) {
  return (
    <section className={`create-step ${className}`}>
      <div className="flow-step-top">
        <StepHead n={n} title={title} sub={sub} />
        {right && <div className="flow-step-right">{right}</div>}
      </div>
      {children}
    </section>
  )
}

// Cards to pick one of: [id, name, about, extra?]
export function Choices({ options, value, onChange, className = '', label }) {
  return (
    <div className={`mode-cards flow-choices ${className}`} role="radiogroup" aria-label={label}>
      {options.map(([id, name, about, extra]) => (
        <button key={String(id)} role="radio" aria-checked={value === id} className={`mode-card ${value === id ? 'on' : ''}`} onClick={() => onChange(id)}>
          <span className="mode-name">{name}</span>
          {about && <span className="dim small">{about}</span>}
          {extra && <span className="mono small flow-choice-extra">{extra}</span>}
        </button>
      ))}
    </div>
  )
}

// A place to drop files. onFiles gets local paths; children are the tiles and the add buttons.
export function DropZone({ onFiles, filled, children, empty, hint }) {
  const [over, setOver] = useState(false)
  async function drop(e) {
    e.preventDefault()
    setOver(false)
    const paths = [...(e.dataTransfer?.files || [])].map((f) => window.ivstudio.media.pathFor(f)).filter(Boolean)
    if (paths.length) onFiles(paths)
  }
  return (
    <div className={`media create-drop flow-drop ${over ? 'drag-over' : ''} ${filled ? 'filled' : ''}`} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}>
      {!filled && (
        <div className="create-drop-empty">
          <DropIcon />
          <span>{empty}</span>
          {hint && <span className="small dim">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

// A frame in the chosen shape, showing a picture or the first frame of a video.
export function SummaryFrame({ aspect = '16:9', src, video, tag, empty }) {
  const [w, h] = aspect.split(':').map(Number)
  return (
    <div className="shot-frame-wrap">
      <div className="shot-frame" style={{ '--ar': w / h, aspectRatio: `${w} / ${h}` }}>
        {src ? video ? <video src={`${src}#t=0.4`} muted preload="metadata" /> : <img src={src} alt="" /> : <span className="shot-frame-empty">{empty || aspect}</span>}
        {tag && <span className="shot-frame-tag mono">{tag}</span>}
      </div>
    </div>
  )
}

// The pinned card beside the steps (wide windows) and the bar under them (narrow): what will be made, and the button.
export function Summary({ label, kind, frame, facts, action, note }) {
  const button = (
    <button className="btn btn-primary shot-card-go" disabled={action.disabled} onClick={action.onClick}>
      {action.label}
    </button>
  )
  return (
    <>
      <aside className="shot-card" aria-label={label}>
        <div className="shot-card-head mono">
          <span>{label}</span>
          {kind && <span className="dim">{kind}</span>}
        </div>
        {frame}
        <dl className="shot-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {note && <p className="small dim">{note}</p>}
        {button}
      </aside>
    </>
  )
}

// The narrow-window bar; goes after the layout.
export function SummaryDock({ facts, action }) {
  return (
    <section className="go-dock create-dock">
      <div className="go-info">
        <span className="mono">{facts.map(([, v]) => (typeof v === 'string' ? v : '')).filter(Boolean).join(' · ')}</span>
      </div>
      <button className="btn btn-primary" disabled={action.disabled} onClick={action.onClick}>
        {action.label}
      </button>
    </section>
  )
}

// The stage's bar as a drop target: files dropped anywhere on it arrive as local paths.
export function StageDrop({ onFiles, children }) {
  const [over, setOver] = useState(false)
  async function drop(e) {
    e.preventDefault()
    setOver(false)
    const paths = [...(e.dataTransfer?.files || [])].map((f) => window.ivstudio.media.pathFor(f)).filter(Boolean)
    if (paths.length) onFiles(paths)
  }
  return (
    <div className={`stage-panel stage-drop ${over ? 'over' : ''}`} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}>
      <DropIcon />
      {children}
    </div>
  )
}

// A tool's own list under its stage, in the Shots and Edit shelf style: a heading with a count and search, then tiles.
export function ToolShelf({ label, count, q, setQ, children, empty }) {
  return (
    <section className="tool-shelf">
      <div className="shelf-bar tool-shelf-bar">
        <h2 className="tool-shelf-head">
          {label} <span className="mono dim">{count}</span>
        </h2>
        {setQ && count > 4 && <input className="list-search" type="search" value={q} placeholder={`Search ${label.toLowerCase()}`} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${label.toLowerCase()}`} />}
      </div>
      {count === 0 ? <p className="dim tool-shelf-empty">{empty}</p> : <div className="shelf-grid">{children}</div>}
    </section>
  )
}

export function ShelfTile({ media, status, name, meta = [], onOpen, del }) {
  return (
    <div className="tile-wrap shelf-item">
      <button className="shelf-tile" onClick={onOpen}>
        <span className="shelf-media">
          {media}
          {status && <span className="shelf-status mono">{status}</span>}
        </span>
        <span className="shelf-body">
          <span className="shelf-name">{name}</span>
          <span className="shelf-meta mono">
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </span>
        </span>
      </button>
      {del}
    </div>
  )
}
