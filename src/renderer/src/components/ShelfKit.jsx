import { useEffect, useRef, useState } from 'react'

// Long lists (Shots, Projects) that stay quick and easy to find things in: a group per day (older work by month),
// filter chips, tiles that only load their media once they're near the screen, and more tiles added as you scroll.

const DAY = 24 * 60 * 60 * 1000
const dayStart = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Today, Yesterday, then each day of the last four weeks by its date ("Wednesday 5 November"), then each month.
export function dayGroup(at, now = Date.now()) {
  const t = new Date(at).getTime()
  const today = dayStart(now)
  const d = dayStart(t)
  if (d >= today) return 'Today'
  if (d >= today - DAY) return 'Yesterday'
  const date = new Date(t)
  const year = date.getFullYear() !== new Date(now).getFullYear()
  if (d >= today - 27 * DAY) return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(year && { year: 'numeric' }) })
  return date.toLocaleDateString(undefined, { month: 'long', ...(year && { year: 'numeric' }) })
}

// When something was made: [id, label, test(at)]
export const WHEN = [
  ['any', 'Any time', () => true],
  ['today', 'Today', (t, now) => t >= dayStart(now)],
  ['week', 'This week', (t, now) => t >= dayStart(now) - 6 * DAY],
  ['month', 'This month', (t, now) => t >= dayStart(now) - 29 * DAY],
  ['older', 'Older', (t, now) => t < dayStart(now) - 29 * DAY]
]
export const inWhen = (id, at, now = Date.now()) => (WHEN.find(([w]) => w === id)?.[2] || (() => true))(new Date(at).getTime(), now)

export const groupBy = (items, key) => {
  const out = []
  for (const it of items) {
    const k = key(it)
    const last = out[out.length - 1]
    if (last && last[0] === k) last[1].push(it)
    else out.push([k, [it]])
  }
  return out
}

// One row of filter chips: [id, label, count?]. The rows stay put as other filters change; an option nothing is left
// for greys out (unless it's the one picked).
export function Chips({ label, options, value, onChange }) {
  return (
    <div className="chips-row" role="radiogroup" aria-label={label}>
      <span className="chips-label mono">{label}</span>
      {options.map(([id, name, n]) => {
        const empty = n === 0 && value !== id
        return (
          <button key={id} role="radio" aria-checked={value === id} disabled={empty} className={`chip ${value === id ? 'on' : ''} ${empty ? 'empty' : ''}`} onClick={() => onChange(id)}>
            {name}
            {n !== undefined && <span className="chip-n">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Mounts its children only once it's within a screen or so of view, and keeps them after. Until then it holds the
// space, so the page doesn't jump.
export function Near({ children, className = '', margin = '600px' }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: margin })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return (
    <span ref={ref} className={className}>
      {seen ? children : null}
    </span>
  )
}

// How many items to show: a first screenful, then more each time the end comes near. Resets when the list changes.
export function useMore(total, step = 36, key) {
  const [n, setN] = useState(step)
  const end = useRef(null)
  useEffect(() => setN(step), [key])
  useEffect(() => {
    if (!end.current || n >= total) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setN((x) => x + step), { rootMargin: '900px' })
    io.observe(end.current)
    return () => io.disconnect()
  }, [n, total])
  const sentinel = n < total ? <div ref={end} className="more-sentinel" aria-hidden="true" /> : null
  return [n, sentinel]
}

// Groups, each with a sticky date heading that folds the group away.
export function Groups({ groups, render, limit, gridClass = 'shelf-grid' }) {
  const [shut, setShut] = useState({})
  let left = limit
  return groups.map(([label, list]) => {
    if (left <= 0) return null
    const part = list.slice(0, left)
    left -= part.length
    const closed = shut[label]
    return (
      <section key={label} className={`shelf-group ${closed ? 'shut' : ''}`}>
        <h2 className="shelf-group-head mono">
          <button className="shelf-group-toggle" aria-expanded={!closed} onClick={() => setShut((s) => ({ ...s, [label]: !s[label] }))}>
            <span className="shelf-group-caret" aria-hidden="true">
              ▾
            </span>
            {label} <span className="dim">{list.length}</span>
          </button>
        </h2>
        {!closed && <div className={gridClass}>{part.map(render)}</div>}
      </section>
    )
  })
}

// The filter rows in a panel that folds away. Open by default; each page remembers its own choice. Folded, it says
// which filters are on, and Clear stays to hand.
export function FilterPanel({ id, active = [], onClear, total, shown, children }) {
  const key = `iv.filtersOpen.${id}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== '0'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(key, open ? '0' : '1')
    } catch {}
  }
  return (
    <div className={`shelf-filters ${open ? '' : 'folded'}`}>
      <div className="filters-head">
        <button className="filters-toggle mono" aria-expanded={open} onClick={toggle}>
          <span className="shelf-group-caret" aria-hidden="true">
            ▾
          </span>
          Filters
          {active.length > 0 && <span className="filters-on">{active.length} on</span>}
        </button>
        {!open && active.length > 0 && <span className="filters-summary small">{active.join(' · ')}</span>}
        {active.length > 0 && (
          <button className="link-btn mono small filters-clear" onClick={onClear}>
            Clear · {shown} of {total}
          </button>
        )}
      </div>
      {open && <div className="filters-body">{children}</div>}
    </div>
  )
}
