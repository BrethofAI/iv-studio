import { useEffect, useRef, useState } from 'react'

// A prompt box that offers the cast and places as you type @ (cast.js resolves them at render time), and the
// dialog that saves a new place. members: window.ivstudio.cast.list().
const fileUrl = (p) => (p ? `ivfile://local/?p=${encodeURIComponent(p)}` : null)
const MAX = 8

export function MentionBox({ value, onChange, members = [], onNewPlace, className, rows, placeholder }) {
  const box = useRef(null)
  const [menu, setMenu] = useState(null) // { query, start, index }

  function look(el) {
    const caret = el.selectionStart
    const m = /(^|[^\w@<])@([A-Za-z][\w-]*)?$/.exec(el.value.slice(0, caret))
    setMenu(m ? { query: (m[2] || '').toLowerCase(), start: caret - (m[2] || '').length - 1, index: 0 } : null)
  }
  const options = menu ? members.filter((m) => m.handle.toLowerCase().startsWith(menu.query) || m.name.toLowerCase().includes(menu.query)).slice(0, MAX) : []
  const rowsShown = [...options, ...(onNewPlace ? [{ newPlace: true }] : [])]

  function pick(opt) {
    if (opt.newPlace) {
      setMenu(null)
      return onNewPlace((place) => insert(place.handle))
    }
    insert(opt.handle)
  }
  function insert(handle) {
    const el = box.current
    const caret = el.selectionStart
    const start = menu ? menu.start : caret
    const text = `${value.slice(0, start)}@${handle} ${value.slice(caret)}`
    onChange(text)
    setMenu(null)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + handle.length + 2
    })
  }
  function keys(e) {
    if (!menu || !rowsShown.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const d = e.key === 'ArrowDown' ? 1 : -1
      setMenu({ ...menu, index: (menu.index + d + rowsShown.length) % rowsShown.length })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(rowsShown[menu.index])
    } else if (e.key === 'Escape') setMenu(null)
  }

  return (
    <div className="mention-box">
      <textarea ref={box} className={className} rows={rows} value={value} placeholder={placeholder} onChange={(e) => (onChange(e.target.value), look(e.target))} onKeyDown={keys} onClick={(e) => look(e.target)} onBlur={() => setTimeout(() => setMenu(null), 150)} />
      {menu && rowsShown.length > 0 && (
        <ul className="mention-menu">
          {rowsShown.map((o, i) =>
            o.newPlace ? (
              <li key="new" className={i === menu.index ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), pick(o))}>
                <span className="mention-thumb add">+</span>
                <span>New place…</span>
              </li>
            ) : (
              <li key={o.handle} className={i === menu.index ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), pick(o))}>
                {o.picture ? <img className="mention-thumb" src={fileUrl(o.picture)} alt="" /> : <span className="mention-thumb">{o.name[0]}</span>}
                <span className="mono">@{o.handle}</span>
                <span className="dim small">
                  {o.kind === 'character' ? 'character' : o.film ? `place · ${o.film}` : 'place'}
                  {o.picture ? '' : ' · no picture'}
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}

// What the mentions in a prompt will turn into, from the render plan's notes.
export function MentionNotes({ notes }) {
  if (!notes?.length) return null
  return (
    <ul className="mention-notes">
      {notes.map((n, i) => (
        <li key={i} className={`small ${n.level === 'info' ? 'dim' : 'pink'}`}>
          @ {n.message}
        </li>
      ))}
    </ul>
  )
}

// A new place: a name, a picture and a few words about it. onSaved gets the saved member ({ handle, … }).
export function PlaceDialog({ onClose, onSaved, notify }) {
  const [form, setForm] = useState({ name: '', description: '', picture: null })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  async function pickPicture() {
    const [file] = await window.ivstudio.files.pick('picture')
    if (file) setForm((f) => ({ ...f, picture: file }))
  }
  async function save() {
    setBusy(true)
    try {
      const place = await window.ivstudio.cast.savePlace(form)
      const members = await window.ivstudio.cast.list()
      onSaved(members.find((m) => m.kind === 'place' && m.id === place.id), members)
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal place-dialog">
        <h2>New place</h2>
        <p className="dim small">Mention it as @Name in any prompt. Its picture is attached, so the room stays the same in every shot.</p>
        <div className="row">
          <span className="row-label">Name</span>
          <input autoFocus value={form.name} placeholder="e.g. Bus Stop" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="row">
          <span className="row-label">About it</span>
          <input value={form.description} placeholder="e.g. a rain-slicked shelter under one flickering streetlamp" onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="row">
          <span className="row-label">Picture</span>
          <div className="place-picture">
            {form.picture && <img src={fileUrl(form.picture)} alt="" />}
            <button className="btn btn-small" onClick={pickPicture}>
              {form.picture ? 'Change picture' : '+ Picture'}
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !form.name.trim() || !form.picture} onClick={save}>
            {busy ? 'Saving…' : 'Save place'}
          </button>
        </div>
      </div>
    </div>
  )
}
