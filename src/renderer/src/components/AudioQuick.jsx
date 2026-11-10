// The quick-start bar on a page's tall banner (the audio pages, and the visual side's main pages): the page's main
// words and its main button, in the Workflows tools' glass panel (.stage-panel). It edits the same state as the page's form below, so
// nothing is typed twice. When the page can't run yet, a short note says why, with a button that shows the way.
//
// value / onChange: the words. onGo: the page's own action (the same one the form's button runs). disabled: exactly
// the form button's disabled. before: anything that sits before the words (Lines' voice picker). after: more buttons.
// note: { text, action?: { label, onClick } } when the page isn't ready.
// search: the words are a search (type=search; Enter doesn't press the button). No goLabel: no button.
export default function QuickBar({ value, onChange, placeholder, label, goLabel, busyLabel, busy, disabled, onGo, before, after, note, search = false }) {
  const go = () => !disabled && onGo?.()
  return (
    <>
      <div className="stage-panel stage-quick">
        {before}
        <input type={search ? 'search' : 'text'} value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => !search && e.key === 'Enter' && go()} />
        {goLabel && (
          <button className="btn btn-primary" disabled={disabled} onClick={go}>
            {busy ? busyLabel || 'Working…' : goLabel}
          </button>
        )}
        {after}
      </div>
      {note && (
        <p className="stage-note stage-quick-note small">
          {note.text}
          {note.action && (
            <>
              {' '}
              <button className="link-btn" onClick={note.action.onClick}>
                {note.action.label}
              </button>
            </>
          )}
        </p>
      )}
    </>
  )
}

// Brings a part of the page below the banner into view (the setup card, the form).
export const showBelow = (selector) => document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
