import { useEffect, useRef, useState } from 'react'
import Hero from './Hero'
import { ask } from './Confirm'
import { ListSearch, MoreMenu, Track } from './AudioKit'

const M = () => window.ivstudio.music
const DONE = ['success', 'error', 'cancelled']
const ACTIVE_DL = ['queued', 'downloading', 'verifying']
const GB = (b) => `${(b / 1024 ** 3).toFixed(1)} GB`
const LENGTHS = [30, 60, 120, 180]
const LANGUAGES = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese'],
  ['ru', 'Russian'],
  ['unknown', 'Other']
]
const STYLE_EXAMPLE = 'Warm neo-soul, slow and loose. Live drums behind the beat, Rhodes chords, round bass. A soft female lead vocal, close and breathy. Late night, intimate.'
const LYRICS_EXAMPLE = '[Verse]\nLate night glow on the window pane\nCity hums and it calls my name\n\n[Chorus]\nStay right here, don\'t pull it straight\nI love the way we arrive late'
const blank = { name: '', caption: '', lyrics: '', instrumental: false, seconds: 60, seed: '', bpm: 120, key: 'C major', timesignature: '4', language: 'en' }

function state(s) {
  if (s.status === 'queued') return s.queuePosition ? `Waiting · ${s.queuePosition} in ComfyUI's queue` : 'Waiting'
  if (s.status === 'running') return s.progress?.max ? `Making it · ${Math.floor((s.progress.value / s.progress.max) * 100)}%` : 'Making it…'
  if (s.status === 'error') return 'Failed'
  if (s.status === 'cancelled') return 'Cancelled'
  return null
}

// The models an engine still needs, each with a Download button that uses IV Studio's checked downloads.
function NeededModels({ engine, dl, onDone }) {
  const ids = engine.missing.map((m) => m.id)
  const busy = ids.some((id) => ACTIVE_DL.includes(dl[id]?.status))
  const bytes = engine.missing.reduce((n, m) => n + (m.size || 0), 0)
  useEffect(() => {
    if (ids.length && ids.every((id) => dl[id]?.status === 'done')) onDone()
  }, [dl])
  return (
    <div className="music-needed">
      <p className="small">
        {engine.label} needs {engine.missing.length === 1 ? 'one model' : `${engine.missing.length} models`} first ({GB(bytes)}). They download into ComfyUI's models folder and are checked against the SHA-256 Hugging Face publishes.
      </p>
      {engine.missing.map((m) => {
        const s = dl[m.id]
        const pct = s?.total ? Math.floor((s.received / s.total) * 100) : null
        return (
          <div key={m.id} className="music-model">
            <span>{m.label}</span>
            <span className="mono dim">models/{m.folder}</span>
            {s && ACTIVE_DL.includes(s.status) ? (
              <div className="dl">
                <div className="bar">
                  <span style={{ width: `${pct ?? 6}%` }} className={pct == null ? 'indeterminate' : ''} />
                </div>
                <span className="mono dim">{s.status === 'queued' ? 'Queued' : s.status === 'verifying' ? 'Checking…' : `${pct}%`}</span>
              </div>
            ) : s?.status === 'error' ? (
              <span className="small pink">{s.error}</span>
            ) : s?.status === 'done' ? (
              <span className="mono cloud-ok">✓</span>
            ) : (
              <span className="mono dim">{GB(m.size)}</span>
            )}
          </div>
        )
      })}
      {engine.missingNodes?.length > 0 && <p className="small pink">This ComfyUI has no {engine.missingNodes.join(', ')} node. Update ComfyUI (0.33 or newer has it).</p>}
      <button className="btn btn-primary" disabled={busy} onClick={() => window.ivstudio.models.download(ids)}>
        {busy ? 'Downloading…' : `Download · ${GB(bytes)}`}
      </button>
    </div>
  )
}

function SongRow({ song, edits, notify, sendToCreate, openEdit, reuse, reload }) {
  const [name, setName] = useState(song.name)
  useEffect(() => setName(song.name), [song.name])
  const done = song.status === 'success' && song.file
  const making = !DONE.includes(song.status)
  const pct = song.progress?.max ? Math.floor((song.progress.value / song.progress.max) * 100) : null
  async function rename() {
    if (name.trim() && name.trim() !== song.name) await M().rename(song.id, name.trim()).catch((err) => notify(err.message))
    reload()
  }
  async function toEdit(target) {
    try {
      const e = await M().toEdit(song.id, target || null)
      openEdit(e.id)
    } catch (err) {
      notify(err.message)
    }
  }
  async function remove() {
    if (!(await ask({ title: `Delete “${song.name}”?`, message: making ? 'It is still being made: this stops it.' : 'Its file in the music folder goes too. The copy in ComfyUI\'s output folder stays.', confirm: 'Delete', danger: true }))) return
    await M().delete(song.id).catch((err) => notify(err.message))
    reload()
  }
  const meta = [song.engine === 'minimax' ? 'MiniMax Music 3' : 'ACE-Step 1.5', song.duration ? `${Math.round(song.duration)} s` : `${song.seconds} s`, `seed ${song.seed}`, song.instrumental && 'instrumental', song.seconds_taken && `made in ${song.seconds_taken} s`].filter(Boolean).join(' · ')
  const menu = [
    done && { divider: true, label: 'Add to an edit' },
    done && { label: 'A new edit', onClick: () => toEdit(null) },
    ...(done ? edits.slice(0, 6).map((e) => ({ label: e.name, onClick: () => toEdit(e.id) })) : []),
    done && { divider: true, label: '' },
    { label: 'Make another like this', onClick: () => reuse(song) },
    done && { label: 'Show file', onClick: () => window.ivstudio.files.reveal(song.file) },
    { label: 'Delete', danger: true, onClick: remove }
  ]
  return (
    <Track
      file={done ? song.file : null}
      duration={song.duration}
      clamp={false}
      title={<input className="song-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} aria-label="Song name" title="Click to rename" />}
      sub={song.caption}
      meta={meta}
      status={
        done ? undefined : (
          <div className={`track-status ${song.status === 'error' ? 'failed' : ''}`}>
            {making && (
              <span className="track-progress">
                <span style={{ width: `${pct ?? 4}%` }} className={pct == null ? 'indeterminate' : ''} />
              </span>
            )}
            <span className="mono small">
              {state(song)}
              {song.error ? `: ${song.error}` : ''}
            </span>
          </div>
        )
      }
      actions={
        <>
          {done && (
            <button className="btn btn-small btn-primary" onClick={() => sendToCreate({ kind: 'music', file: song.file, text: '', name: song.name })}>
              Use in a shot
            </button>
          )}
          {making && (
            <button className="btn btn-small" onClick={async () => (await M().cancel(song.id).catch((err) => notify(err.message)), reload())}>
              Stop
            </button>
          )}
          <MoreMenu items={menu} label={`More for ${song.name}`} />
        </>
      }
    />
  )
}

export function MusicPage({ notify, sendToCreate, openEdit }) {
  const [meta, setMeta] = useState(null)
  const [status, setStatus] = useState(null)
  const [engine, setEngine] = useState('minimax')
  const [form, setForm] = useState(blank)
  const [songs, setSongs] = useState([])
  const [edits, setEdits] = useState([])
  const [dl, setDl] = useState({})
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const [q, setQ] = useState('')
  const top = useRef(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const check = () => M().status().then(setStatus, (err) => setStatus({ error: err.message, engines: [] }))
  const reload = () => M().list().then(setSongs, (err) => notify(err.message))
  useEffect(() => {
    M().meta().then(setMeta)
    check()
    reload()
    window.ivstudio.edits.list().then(setEdits, () => {})
    window.ivstudio.models.status().then(setDl)
    return window.ivstudio.models.onUpdate((u) => setDl((all) => ({ ...all, [u.id]: u })))
  }, [])
  // while a song is being made, keep its state fresh
  const making = songs.some((s) => !DONE.includes(s.status))
  useEffect(() => {
    if (!making) return
    const t = setInterval(reload, 3000)
    return () => clearInterval(t)
  }, [making])

  const spec = status?.engines?.find((e) => e.id === engine)
  const max = meta?.engines.find((e) => e.id === engine)?.maxSeconds || 300
  const shown = q.trim() ? songs.filter((s) => `${s.name} ${s.caption}`.toLowerCase().includes(q.trim().toLowerCase())) : songs
  async function make() {
    setBusy(true)
    try {
      await M().create({ engine, ...form, seconds: Number(form.seconds), seed: form.seed === '' ? null : Number(form.seed), bpm: Number(form.bpm) })
      set({ seed: '' })
      reload()
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  function reuse(s) {
    setEngine(s.engine)
    setForm({ ...blank, name: s.name, caption: s.caption, lyrics: s.lyrics, instrumental: s.instrumental, seconds: s.seconds, bpm: s.bpm ?? 120, key: s.key || 'C major', timesignature: s.timesignature || '4', language: s.language || 'en' })
    top.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="voices music audio-page" ref={top}>
      <Hero art="music" title="Music" kicker="Audio" />
      <p className="lede">
        Songs and scores, made on this PC.
        <span className="lede-small dim">Describe the music, add lyrics or keep it instrumental, and use it under an edit or as the song a character sings in a shot. Every song is kept here.</span>
      </p>
      {status?.remote && <p className="notice">Music runs on this PC's ComfyUI. Switch to "This PC" on the Cloud page to make music.</p>}
      {status?.error && <p className="notice">{status.error}</p>}

      <section className="audio-card composer">
        <div className="audio-card-head">
          <h2>New song</h2>
        </div>
        <div className="audio-card-body">
          <div className="engine-cards" role="radiogroup" aria-label="Engine">
            {(meta?.engines || []).map((e) => (
              <button key={e.id} role="radio" aria-checked={engine === e.id} className={`engine-card ${engine === e.id ? 'on' : ''}`} onClick={() => (setEngine(e.id), form.seconds > e.maxSeconds && set({ seconds: e.maxSeconds }))}>
                <span className="engine-card-name">{e.label}</span>
                <span className="mono small dim">{e.short}</span>
              </button>
            ))}
          </div>
          {spec && (
            <p className="dim small">
              {spec.note} <span className="music-licence">{spec.licence}</span>
            </p>
          )}
          {spec && !spec.ready && !status?.remote && <NeededModels engine={spec} dl={dl} onDone={check} />}

          <label className="field">
            <span className="field-label mono">Style</span>
            <textarea rows={3} value={form.caption} placeholder={STYLE_EXAMPLE} onChange={(e) => set({ caption: e.target.value })} />
            <span className="field-hint dim small">Genre, mood, instruments, the voice and how it sings, tempo, how the song builds.</span>
          </label>

          <div className="field">
            <span className="field-label mono">
              Lyrics
              <label className="switch-toggle field-action">
                <input type="checkbox" checked={form.instrumental} onChange={(e) => set({ instrumental: e.target.checked })} />
                <span className="switch-track">
                  <span className="switch-knob" />
                </span>
                Instrumental
              </label>
            </span>
            {form.instrumental ? (
              <p className="field-off dim small">No singing: the style alone shapes the music.</p>
            ) : (
              <>
                <textarea rows={8} value={form.lyrics} placeholder={LYRICS_EXAMPLE} onChange={(e) => set({ lyrics: e.target.value })} aria-label="Lyrics" />
                <span className="field-hint dim small">Mark the parts: [Intro], [Verse], [Chorus], [Bridge], [Instrumental], [Outro]. Empty lyrics make an instrumental.</span>
              </>
            )}
          </div>

          <div className="field">
            <span className="field-label mono">Length</span>
            <div className="music-length">
              <div className="segmented">
                {LENGTHS.filter((n) => n <= max).map((n) => (
                  <button key={n} className={Number(form.seconds) === n ? 'on' : ''} onClick={() => set({ seconds: n })}>
                    {n < 60 ? `${n} s` : `${n / 60} min`}
                  </button>
                ))}
              </div>
              <input className="mini" type="number" min={5} max={max} value={form.seconds} onChange={(e) => set({ seconds: e.target.value })} aria-label="Seconds" />
              <span className="dim small">seconds, up to {max}</span>
            </div>
            {engine === 'minimax' && <span className="field-hint dim small">MiniMax sets the length from the lyrics and treats this as a limit: two short sections give about 15 seconds. Write more verses and choruses for a longer song.</span>}
          </div>

          <div className={`more-settings ${more ? 'open' : ''}`}>
            <button type="button" className="more-settings-toggle mono" onClick={() => setMore((m) => !m)} aria-expanded={more}>
              {more ? '−' : '+'} More settings
              <span className="dim">{[form.name && `“${form.name}”`, engine === 'ace' && `${form.bpm} BPM`, engine === 'ace' && form.key, form.seed !== '' && `seed ${form.seed}`].filter(Boolean).join(' · ')}</span>
            </button>
            {more && (
              <div className="more-settings-body">
                <label className="field">
                  <span className="field-label mono">
                    Name <span className="dim">· optional</span>
                  </span>
                  <input value={form.name} placeholder="The style's first words otherwise" onChange={(e) => set({ name: e.target.value })} />
                </label>
                {engine === 'ace' && (
                  <div className="field-grid">
                    <label className="field">
                      <span className="field-label mono">Tempo · BPM</span>
                      <input className="mini" type="number" min={30} max={300} value={form.bpm} onChange={(e) => set({ bpm: e.target.value })} />
                    </label>
                    <label className="field">
                      <span className="field-label mono">Key</span>
                      <select value={form.key} onChange={(e) => set({ key: e.target.value })}>
                        {(meta?.keys || []).map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </label>
                    <div className="field">
                      <span className="field-label mono">Time</span>
                      <div className="segmented">
                        {['2', '3', '4', '6'].map((n) => (
                          <button key={n} className={form.timesignature === n ? 'on' : ''} onClick={() => set({ timesignature: n })}>
                            {n}/4
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="field">
                      <span className="field-label mono">Language</span>
                      <select value={form.language} onChange={(e) => set({ language: e.target.value })}>
                        {LANGUAGES.map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <label className="field">
                  <span className="field-label mono">Seed</span>
                  <input className="mini seed-input" type="number" value={form.seed} placeholder="Random" onChange={(e) => set({ seed: e.target.value })} />
                  <span className="field-hint dim small">The same settings and seed give the same song; a new seed gives a new take.</span>
                </label>
              </div>
            )}
          </div>

          <div className="composer-foot end">
            <button className="btn btn-primary" disabled={busy || !spec?.ready || !form.caption.trim()} onClick={make}>
              {busy ? 'Queuing…' : 'Make it'}
            </button>
          </div>
        </div>
      </section>

      {songs.length > 0 && (
        <section className="audio-section">
          <div className="audio-section-head">
            <h2>
              Songs <span className="count">{songs.length}</span>
            </h2>
            {songs.length > 5 && <ListSearch value={q} onChange={setQ} placeholder="Search songs" />}
          </div>
          <div className="track-list">
            {shown.map((s) => (
              <SongRow key={s.id} song={s} edits={edits} notify={notify} sendToCreate={sendToCreate} openEdit={openEdit} reuse={reuse} reload={reload} />
            ))}
            {shown.length === 0 && <p className="audio-empty dim">No songs match “{q}”.</p>}
          </div>
        </section>
      )}
    </div>
  )
}
