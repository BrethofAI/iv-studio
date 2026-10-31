import { useState } from 'react'

// The prompt checker's findings (src/service/lint.js) under a prompt: errors first, each with a Fix when the checker
// can mend it. Notes (info) fold away so they don't crowd the list.
const ICON = { error: '✕', warning: '!', info: 'i' }
export default function Findings({ findings, onFix, compact = false }) {
  const [notes, setNotes] = useState(false)
  if (!findings?.length) return compact ? null : <p className="findings-clean mono small">✓ The prompt checker found nothing to fix.</p>
  const main = findings.filter((f) => f.level !== 'info')
  const info = findings.filter((f) => f.level === 'info')
  const row = (f, i) => (
    <li key={`${f.code}${i}`} className={`finding ${f.level}`}>
      <span className="finding-icon mono">{ICON[f.level]}</span>
      <span className="finding-text">{f.message}</span>
      {f.fix && onFix && (
        <button className="btn btn-small" onClick={() => onFix(f.fix)}>
          Fix
        </button>
      )}
    </li>
  )
  return (
    <div className={`findings ${compact ? 'compact' : ''}`}>
      {main.length > 0 && <ul>{main.map(row)}</ul>}
      {info.length > 0 && (
        <>
          <button className="link-btn mono small" onClick={() => setNotes(!notes)}>
            {notes ? '− Hide' : '+'} {info.length} note{info.length > 1 ? 's' : ''}
          </button>
          {notes && <ul>{info.map(row)}</ul>}
        </>
      )}
    </div>
  )
}
