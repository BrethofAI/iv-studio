import { useMemo, useRef, useState } from 'react'
import { CAMERA_MOVES, HEIGHTS, LENSES, ROOM, cameraWords, defaultStage, lineCheck, stagingWords } from '../../../service/staging'

// The staging board: a top-down floor (8 x 8 m) with the people and the camera. Drag a person or the camera to
// move them, the small dot in front of them to turn them, and a walker's hollow dot to set where they walk to.
// The words under it are what the shot's "Who stands where" and "Camera" become (staging.js).
//   stage: the shot's stage, or null (a default with start, else the first two names). names: who can be on it.
//   before: the scene's previous shot's stage, for the line check. onChange(stage): on each drop or choice.
const HALF = ROOM / 2
const first = (s) => String(s || '').trim().split(/\s+/)[0]
const SHADES = ['#e85d5d', '#f2c14e', '#6fb7e8', '#8fd18f']
const MOVES = Object.keys(CAMERA_MOVES)
const MOVE_LABEL = { static: 'Static', push: 'Push in', pull: 'Pull back', 'pan-left': 'Pan left', 'pan-right': 'Pan right', 'arc-left': 'Arc left', 'arc-right': 'Arc right', 'track-left': 'Track left', 'track-right': 'Track right', handheld: 'Handheld' }

export default function StageBoard({ stage, names = [], start = null, before = null, onChange }) {
  const [s, setS] = useState(() => stage || defaultStage((start?.length ? start : names).slice(0, 2)))
  const svg = useRef(null)
  const drag = useRef(null)
  const commit = (next) => (setS(next), onChange?.(next))
  const floor = (e) => {
    const p = svg.current.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse())
    const clamp = (v) => Math.max(-HALF, Math.min(HALF, v))
    return { x: clamp(q.x), y: clamp(-q.y) }
  }
  const angle = (from, to) => Math.round((Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI / 5) * 5
  const down = (what) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = what
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const at = floor(e)
    const round = (v) => Math.round(v * 10) / 10
    setS((cur) => {
      const next = { ...cur, camera: { ...cur.camera }, people: cur.people.map((p) => ({ ...p })) }
      if (d.kind === 'cam') Object.assign(next.camera, { x: round(at.x), y: round(at.y) })
      else if (d.kind === 'cam-turn') next.camera.facing = angle(next.camera, at)
      else {
        const p = next.people[d.i]
        if (d.kind === 'person') Object.assign(p, { x: round(at.x), y: round(at.y) })
        else if (d.kind === 'turn') p.facing = angle(p, at)
        else if (d.kind === 'walk') p.to = { x: round(at.x), y: round(at.y) }
      }
      return next
    })
  }
  const up = () => {
    if (!drag.current) return
    drag.current = null
    onChange?.(s)
  }
  const setPerson = (i, patch) => commit({ ...s, people: s.people.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const setCam = (patch) => commit({ ...s, camera: { ...s.camera, ...patch } })
  const add = (name) => commit({ ...s, people: [...s.people, { name, x: 0, y: 0.5, facing: 180, to: null, lookAt: null }] })
  const remove = (i) => commit({ ...s, people: s.people.filter((_, k) => k !== i).map((p) => (p.lookAt === s.people[i].name ? { ...p, lookAt: null } : p)) })
  const words = useMemo(() => stagingWords(s), [s])
  const cam = useMemo(() => cameraWords(s), [s])
  const warnings = useMemo(() => lineCheck(before, s), [before, s])
  const free = names.filter((n) => !s.people.some((p) => first(p.name) === first(n)))
  const fov = LENSES[s.camera.lens] || LENSES.normal
  const ray = (a, len) => ({ x: s.camera.x + Math.sin((a * Math.PI) / 180) * len, y: s.camera.y + Math.cos((a * Math.PI) / 180) * len })
  const [l, r] = [ray(s.camera.facing - fov, 9), ray(s.camera.facing + fov, 9)]
  const ahead = (p, len = 0.55) => ({ x: p.x + Math.sin((p.facing * Math.PI) / 180) * len, y: p.y + Math.cos((p.facing * Math.PI) / 180) * len })

  return (
    <div className="stage-board">
      <svg ref={svg} className="stage-floor" viewBox={`${-HALF} ${-HALF} ${ROOM} ${ROOM}`} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
        <defs>
          <clipPath id="stage-clip">
            <rect x={-HALF} y={-HALF} width={ROOM} height={ROOM} />
          </clipPath>
        </defs>
        <rect x={-HALF} y={-HALF} width={ROOM} height={ROOM} className="stage-bg" />
        {Array.from({ length: ROOM - 1 }, (_, k) => k - HALF + 1).map((v) => (
          <g key={v} className="stage-grid">
            <line x1={v} y1={-HALF} x2={v} y2={HALF} />
            <line x1={-HALF} y1={v} x2={HALF} y2={v} />
          </g>
        ))}
        <polygon clipPath="url(#stage-clip)" className="stage-fov" points={`${s.camera.x},${-s.camera.y} ${l.x},${-l.y} ${r.x},${-r.y}`} />
        {s.people.map((p, i) =>
          p.to ? (
            <g key={`w${i}`}>
              <line className="stage-path" x1={p.x} y1={-p.y} x2={p.to.x} y2={-p.to.y} stroke={SHADES[i % 4]} />
              <circle className="stage-walk" cx={p.to.x} cy={-p.to.y} r={0.2} stroke={SHADES[i % 4]} onPointerDown={down({ kind: 'walk', i })}>
                <title>{`Where ${first(p.name)} walks to`}</title>
              </circle>
            </g>
          ) : null
        )}
        {s.people.map((p, i) => {
          const h = ahead(p)
          return (
            <g key={i}>
              <line className="stage-face" x1={p.x} y1={-p.y} x2={h.x} y2={-h.y} stroke={SHADES[i % 4]} />
              <circle className="stage-person" cx={p.x} cy={-p.y} r={0.28} fill={SHADES[i % 4]} onPointerDown={down({ kind: 'person', i })}>
                <title>{`${first(p.name)}: drag to move`}</title>
              </circle>
              <circle className="stage-turn" cx={h.x} cy={-h.y} r={0.12} fill={SHADES[i % 4]} onPointerDown={down({ kind: 'turn', i })}>
                <title>{`Turn ${first(p.name)}`}</title>
              </circle>
              <text className="stage-name" x={p.x} y={-p.y + 0.62}>
                {first(p.name)}
              </text>
            </g>
          )
        })}
        <g>
          <line className="stage-cam-aim" x1={s.camera.x} y1={-s.camera.y} x2={ray(s.camera.facing, 0.8).x} y2={-ray(s.camera.facing, 0.8).y} />
          <rect className="stage-cam" x={s.camera.x - 0.3} y={-s.camera.y - 0.22} width={0.6} height={0.44} rx={0.06} transform={`rotate(${s.camera.facing} ${s.camera.x} ${-s.camera.y})`} onPointerDown={down({ kind: 'cam' })}>
            <title>Camera: drag to move</title>
          </rect>
          <circle className="stage-cam-turn" cx={ray(s.camera.facing, 0.8).x} cy={-ray(s.camera.facing, 0.8).y} r={0.13} onPointerDown={down({ kind: 'cam-turn' })}>
            <title>Turn the camera</title>
          </circle>
        </g>
      </svg>

      <div className="stage-side">
        {s.people.map((p, i) => (
          <div key={i} className="stage-who">
            <span className="stage-dot" style={{ background: SHADES[i % 4] }} />
            <span className="mono small">{first(p.name)}</span>
            <select className="small" value={p.lookAt || ''} onChange={(e) => setPerson(i, { lookAt: e.target.value || null })} aria-label={`Who ${first(p.name)} looks at`}>
              <option value="">Looks ahead</option>
              {s.people
                .filter((o) => o !== p)
                .map((o) => (
                  <option key={o.name} value={o.name}>
                    Looks at {first(o.name)}
                  </option>
                ))}
            </select>
            <button className={`link-btn mono small ${p.to ? 'pink' : ''}`} onClick={() => setPerson(i, { to: p.to ? null : { x: Math.max(-HALF, Math.min(HALF, p.x + (p.x > 0 ? -2 : 2))), y: p.y } })}>
              {p.to ? 'Stands still' : 'Walks'}
            </button>
            <button className="lora-chip-x" aria-label={`Take ${first(p.name)} off the board`} onClick={() => remove(i)}>
              ×
            </button>
          </div>
        ))}
        {free.length > 0 && s.people.length < 4 && (
          <select className="small" value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label="Put someone on the board">
            <option value="">+ Put someone on the board</option>
            {free.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        <div className="row tight">
          <span className="row-label">Lens</span>
          <div className="segmented">
            {[
              ['wide', 'Wide'],
              ['normal', 'Normal'],
              ['long', 'Long']
            ].map(([k, t]) => (
              <button key={k} className={s.camera.lens === k ? 'on' : ''} onClick={() => setCam({ lens: k })}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="row tight">
          <span className="row-label">Height</span>
          <div className="segmented">
            {Object.keys(HEIGHTS).map((k) => (
              <button key={k} className={(s.camera.height || 'eye') === k ? 'on' : ''} onClick={() => setCam({ height: k })}>
                {k === 'eye' ? 'Eye' : k === 'low' ? 'Low' : 'High'}
              </button>
            ))}
          </div>
        </div>
        <label className="row tight">
          <span className="row-label">Move</span>
          <select value={s.camera.move} onChange={(e) => setCam({ move: e.target.value })}>
            {MOVES.map((m) => (
              <option key={m} value={m}>
                {MOVE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stage-words">
        <p className="small">{words || <span className="dim">Put someone on the board.</span>}</p>
        <p className="small dim">{cam}.</p>
        {warnings.map((w) => (
          <p key={w} className="notice small">
            {w}
          </p>
        ))}
      </div>
    </div>
  )
}
