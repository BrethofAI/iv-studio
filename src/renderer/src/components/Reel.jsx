import { useEffect, useState } from 'react'
import Hero from './Hero'
import { fileUrl } from './edit/model'

// Reel: pictures (and clips) plus a song, cut to the song's beat with slow camera moves, as an edit
// (src/service/reel.js). The edit opens in Edit, ready to fine-tune and export.
const PACES = [
  ['calm', 'Calm', 'about 3 s a picture'],
  ['normal', 'Normal', 'about 2 s'],
  ['fast', 'Fast', 'about 1 s']
]
const FORMATS = [
  ['1080p', '16:9'],
  ['vertical', '9:16'],
  ['square', '1:1']
]
const IMAGE = /\.(png|jpe?g|webp|bmp)$/i

export default function Reel({ notify, openEdit }) {
  const [items, setItems] = useState([])
  const [songs, setSongs] = useState([])
  const [song, setSong] = useState(null) // { file, name }
  const [pace, setPace] = useState('normal')
  const [format, setFormat] = useState('1080p')
  const [name, setName] = useState('')
  const [making, setMaking] = useState(false)
  useEffect(() => {
    window.ivstudio.music
      .list()
      .then((l) => setSongs((l || []).filter((s) => s.status === 'success' && s.file)))
      .catch(() => {})
  }, [])
  const pick = async (kind) => {
    const files = await window.ivstudio.files.pick(kind)
    return (Array.isArray(files) ? files : files ? [files] : []).map((f) => f.path || f)
  }
  const addItems = async (kind) => setItems([...items, ...(await pick(kind))])
  const move = (i, d) => {
    const next = [...items]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setItems(next)
  }
  async function make() {
    setMaking(true)
    try {
      const r = await window.ivstudio.reels.make({ name: name.trim() || 'Reel', items, song: song.file, pace, format })
      notify(`${r.used} pictures cut to ${r.bpm ? `${r.bpm} BPM` : 'an even pace'} in ${r.seconds.toFixed(1)} s${r.left ? `; ${r.left} didn't fit the song` : ''}. Export it from Edit.`, 'info')
      openEdit(r.editId)
    } catch (err) {
      notify(err.message)
    } finally {
      setMaking(false)
    }
  }
  return (
    <div className="reel-page">
      <Hero art="music" title="Reel" kicker="Pictures and a song, cut to the beat" help="reel" />
      <p className="lede">
        Add pictures in the order they should play, pick a song, and IV Studio cuts them to its beat with a slow move on each picture.
        <span className="lede-small dim">It lands in Edit as an ordinary edit, so you can trim, reorder, add titles and export it there.</span>
      </p>

      <h3 className="reel-h">1 · Pictures</h3>
      <div className="reel-items">
        {items.map((f, i) => (
          <figure key={`${f}${i}`} className="reel-item">
            {IMAGE.test(f) ? <img src={fileUrl(f)} alt="" /> : <video src={fileUrl(f)} muted preload="metadata" />}
            <figcaption className="mono small">
              <span>{i + 1}</span>
              <button className="link-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Earlier">
                ‹
              </button>
              <button className="link-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Later">
                ›
              </button>
              <button className="link-btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove">
                ×
              </button>
            </figcaption>
          </figure>
        ))}
        <button className="reel-add" onClick={() => addItems('picture')}>
          + Add pictures
        </button>
        <button className="reel-add" onClick={() => addItems('video')}>
          + Add a clip
        </button>
      </div>

      <h3 className="reel-h">2 · Song</h3>
      <div className="reel-songs">
        {songs.map((s) => (
          <button key={s.id} className={`reel-song ${song?.file === s.file ? 'on' : ''}`} onClick={() => setSong({ file: s.file, name: s.name })}>
            <span>{s.name}</span>
            <span className="mono small dim">{Math.round(s.duration || s.seconds || 0)} s</span>
          </button>
        ))}
        <button
          className="reel-song"
          onClick={async () => {
            const [f] = await pick('audio')
            if (f) setSong({ file: f, name: f.split(/[\\/]/).pop() })
          }}
        >
          <span>{song && !songs.some((s) => s.file === song.file) ? song.name : 'A sound file…'}</span>
          <span className="mono small dim">from this PC</span>
        </button>
      </div>
      {!songs.length && <p className="small dim">Songs you make on Audio → Music show here too.</p>}

      <h3 className="reel-h">3 · Pace and shape</h3>
      <div className="reel-row">
        <div className="segmented">
          {PACES.map(([id, label, sub]) => (
            <button key={id} className={pace === id ? 'on' : ''} title={sub} onClick={() => setPace(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented">
          {FORMATS.map(([id, label]) => (
            <button key={id} className={format === id ? 'on' : ''} onClick={() => setFormat(id)}>
              {label}
            </button>
          ))}
        </div>
        <input className="reel-name" value={name} placeholder="Name (Reel)" onChange={(e) => setName(e.target.value)} />
      </div>
      <p className="small dim">Each picture holds a whole number of beats near the pace, and the cuts keep to the song's bars. A song without a clear beat is cut evenly. The reel ends with the pictures or the song, whichever comes first.</p>
      <button className="btn btn-primary reel-make" disabled={!items.length || !song || making} onClick={make}>
        {making ? 'Finding the beat and making the reel…' : items.length && song ? `Make the reel · ${items.length} picture${items.length === 1 ? '' : 's'}` : 'Add pictures and a song'}
      </button>
    </div>
  )
}
