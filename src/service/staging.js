// The staging board: a top-down plan of a shot (people, where they face and walk, who they look at, and the camera)
// turned into exact screen-side words for the prompt, the storyboard sketch and the shot's "Who stands where".
// Pure, so the window, the MCP server and the tests share it.
//
// The plan is in metres on the floor: x to the right of the room, y away from the room's front. Angles are in
// degrees on the floor: 0 points along +y (into the room), 90 along +x. A person faces their `facing`; the camera
// looks along its `facing`. Screen-left is the viewer's left.
//   stage = {
//     people: [{ name, x, y, facing, to: {x, y} | null, lookAt: name | null }],
//     camera: { x, y, facing, lens: 'wide' | 'normal' | 'long', move: one of CAMERA_MOVES, height: 'eye' | 'low' | 'high' }
//   }

export const LENSES = { wide: 32, normal: 22, long: 11 } // half the horizontal field of view, degrees
export const CAMERA_MOVES = {
  static: 'holds a static shot',
  push: 'pushes in slowly',
  pull: 'pulls back slowly',
  'pan-left': 'pans slowly to the left',
  'pan-right': 'pans slowly to the right',
  'arc-left': 'arcs slowly around them to the left',
  'arc-right': 'arcs slowly around them to the right',
  'track-left': 'tracks sideways to the left with them',
  'track-right': 'tracks sideways to the right with them',
  handheld: 'is handheld and follows them closely'
}
export const HEIGHTS = { eye: 'at eye level', low: 'from a low angle', high: 'from a high angle' }
export const ROOM = 8 // the board shows an 8 x 8 m floor

const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI
const dir = (a) => ({ x: Math.sin(rad(a)), y: Math.cos(rad(a)) })
const dot = (a, b) => a.x * b.x + a.y * b.y
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'Someone'

export function defaultStage(names = []) {
  const n = names.length
  return {
    people: names.slice(0, 4).map((name, i) => ({ name, x: n === 1 ? 0 : -1 + (2 * i) / Math.max(1, n - 1), y: 1, facing: n === 2 ? (i === 0 ? 90 : -90) : 180, to: null, lookAt: n === 2 ? names[1 - i] : null })),
    camera: { x: 0, y: -3, facing: 0, lens: 'normal', move: 'static', height: 'eye' }
  }
}

// Where a floor point lands in the camera's frame: u from -1 (left edge) to 1 (right edge), depth in metres,
// on: inside the frame.
export function project(stage, p) {
  const c = stage.camera
  const rel = sub(p, c)
  const fwd = dir(c.facing)
  const right = dir(c.facing + 90)
  const depth = dot(rel, fwd)
  const side = dot(rel, right)
  const u = depth > 0.05 ? deg(Math.atan2(side, depth)) / (LENSES[c.lens] || LENSES.normal) : side >= 0 ? 9 : -9
  return { u, depth, on: depth > 0.05 && Math.abs(u) <= 1 }
}

const sideWord = (u) => (u < -0.6 ? 'at screen-left' : u < -0.2 ? 'left of centre' : u <= 0.2 ? 'in the centre' : u <= 0.6 ? 'right of centre' : 'at screen-right')
const shortSide = (u) => (u < -0.2 ? 'screen-left' : u > 0.2 ? 'screen-right' : 'the centre')

// Which way someone faces as the camera sees it.
export function facingWords(stage, person) {
  const c = stage.camera
  const f = dir(person.facing)
  const away = dot(f, dir(c.facing)) // 1: back to the camera, -1: facing it
  const right = dot(f, dir(c.facing + 90))
  const a = deg(Math.acos(Math.max(-1, Math.min(1, -away)))) // 0 facing the camera, 180 back to it
  const to = right >= 0 ? 'screen-right' : 'screen-left'
  if (a < 25) return 'facing the camera'
  if (a < 65) return `turned three-quarters toward ${to}`
  if (a < 115) return `in profile, facing ${to}`
  if (a < 155) return `turned away toward ${to}`
  return 'with their back to the camera'
}

// The shot size from the nearest person on screen (the frame's height at their distance).
export function shotSize(stage) {
  const lens = LENSES[stage.camera.lens] || LENSES.normal
  const vhalf = deg(Math.atan(Math.tan(rad(lens)) * (9 / 16)))
  const depths = stage.people.map((p) => project(stage, p)).filter((q) => q.on).map((q) => q.depth)
  if (!depths.length) return 'Wide shot'
  const h = 2 * Math.min(...depths) * Math.tan(rad(vhalf))
  // a face is about 0.3 m, chest up 0.7, waist up 1.1, a whole person 1.8
  return h < 0.5 ? 'Close-up' : h < 0.85 ? 'Medium close-up' : h < 1.3 ? 'Medium shot' : h < 2.6 ? 'Full shot' : 'Wide shot'
}

export function cameraWords(stage) {
  const c = stage.camera
  return `${shotSize(stage)}, ${HEIGHTS[c.height] || HEIGHTS.eye}; the camera ${CAMERA_MOVES[c.move] || CAMERA_MOVES.static}`
}

// The staging in words, by screen side: where each person starts, which way they face, who they look at, how far
// apart, and where they walk.
export function stagingWords(stage) {
  const people = stage.people || []
  const out = []
  const seen = people.map((p) => ({ p, at: project(stage, p) }))
  const depths = seen.filter((o) => o.at.on).map((o) => o.at.depth)
  const [near, far] = [Math.min(...depths), Math.max(...depths)]
  for (const { p, at } of seen) {
    const name = first(p.name)
    if (!at.on) {
      out.push(`${name} is out of frame${at.depth <= 0.05 ? ', behind the camera' : ` past ${at.u < 0 ? 'screen-left' : 'screen-right'}`}.`)
      continue
    }
    // nearer and further only when the depths really differ
    const depth = far - near < 0.7 ? '' : at.depth === near ? ' in the foreground' : at.depth === far ? ' further back' : ''
    let s = `${name} stands ${sideWord(at.u)}${depth}, ${facingWords(stage, p)}`
    if (p.lookAt) s += `, looking at ${first(p.lookAt)}`
    out.push(s + '.')
  }
  const on = seen.filter((o) => o.at.on)
  if (on.length === 2) {
    const d = Math.hypot(on[0].p.x - on[1].p.x, on[0].p.y - on[1].p.y)
    out.push(`They are ${d < 0.8 ? 'close together' : d < 1.5 ? 'about a step apart' : `about ${Math.round(d)} metres apart`}.`)
  }
  for (const { p, at } of seen) {
    if (!p.to) continue
    const end = project(stage, p.to)
    const name = first(p.name)
    const nearer = end.depth < at.depth - 0.7 ? ' toward the camera' : end.depth > at.depth + 0.7 ? ' away from the camera' : ''
    const from = at.on ? shortSide(at.u) : `outside the frame at ${at.u < 0 ? 'screen-left' : 'screen-right'}`
    const to = end.on ? (Math.abs(end.u) <= 0.2 ? 'the centre' : `the ${end.u < 0 ? 'left' : 'right'} third`) : `out of frame at ${end.u < 0 ? 'screen-left' : 'screen-right'}`
    out.push(`${name} ${at.on ? 'walks' : 'enters and walks'} from ${from}${nearer} to ${to}${end.on ? ' and stops there' : ''}.`)
  }
  return out.join(' ')
}

// Each pair's sides in one shot: { 'Tess|Theo': 'Tess left' }.
export function pairSides(stage) {
  const out = {}
  const on = (stage.people || []).map((p) => ({ p, at: project(stage, p) })).filter((o) => o.at.on)
  for (let i = 0; i < on.length; i++)
    for (let j = i + 1; j < on.length; j++) {
      const [a, b] = [on[i], on[j]].sort((x, y) => first(x.p.name).localeCompare(first(y.p.name)))
      out[`${first(a.p.name)}|${first(b.p.name)}`] = a.at.u <= b.at.u ? first(a.p.name) : first(b.p.name)
    }
  return out
}

// The 180-degree rule between two shots of a scene: a pair seen in both should keep its screen sides, unless the
// camera move crosses the line on screen (an arc). Returns plain-words warnings.
export function lineCheck(before, stage) {
  if (!before || !stage) return []
  const a = pairSides(before)
  const b = pairSides(stage)
  const out = []
  for (const k of Object.keys(b))
    if (a[k] && a[k] !== b[k] && !/^arc/.test(before.camera?.move || '')) {
      const [x, y] = k.split('|')
      out.push(`${x} and ${y} swap sides from the last shot (${a[k]} was on the left, now ${b[k]} is). Keep the camera on the same side of the line between them, or move it there on screen with an arc.`)
    }
  return out
}

// A stage as the shot's fields: staging (words) and camera (shot size and move).
export const stageFields = (stage) => ({ staging: stagingWords(stage), camera: cameraWords(stage) })

// ---------- previs: the plan in motion ----------
// The previs is a grey clip of the board in motion (previs.js renders it): the camera's move and the walks, frame
// by frame. Each frame: camera {x, y, z, aim: {x, y, z}} and people [{x, y, facing}], in metres and degrees.
export const SHADE_WORDS = ['dark grey', 'light grey', 'mid-grey striped', 'white']
const EYE = { eye: 1.6, low: 0.6, high: 3.2 }
const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const turnTo = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t
// how far along their walk someone is: they walk from 10% to 75% of the shot
const walkAt = (t) => smooth(Math.min(1, Math.max(0, (t - 0.1) / 0.65)))

// Where the camera looks: the middle of the people it sees, else 4 m ahead.
function aimPoint(stage) {
  const seen = (stage.people || []).filter((p) => project(stage, p).on)
  if (seen.length) return { x: seen.reduce((s, p) => s + p.x, 0) / seen.length, y: seen.reduce((s, p) => s + p.y, 0) / seen.length }
  const f = dir(stage.camera.facing)
  return { x: stage.camera.x + f.x * 4, y: stage.camera.y + f.y * 4 }
}

export function previsFrames(stage, { frames = 124 } = {}) {
  const c = stage.camera
  const z = EYE[c.height] || EYE.eye
  const aimZ = c.height === 'low' ? 1.5 : c.height === 'high' ? 0.9 : 1.4
  const target = aimPoint(stage)
  const r = Math.hypot(c.x - target.x, c.y - target.y) || 3
  const bearing = deg(Math.atan2(c.x - target.x, c.y - target.y)) // from the target to the camera
  const left = dir(c.facing - 90)
  // an arc goes the way that moves the camera to its own left (arc-left) or right
  const leftwards = dot(dir(bearing + 90), left) > 0 ? 1 : -1
  const out = []
  for (let i = 0; i < frames; i++) {
    const t = frames > 1 ? i / (frames - 1) : 0
    const e = smooth(t)
    let cam = { x: c.x, y: c.y }
    let facing = c.facing
    let aim = null
    switch (c.move) {
      case 'push':
      case 'pull': {
        const d = (c.move === 'push' ? 1 : -1) * Math.min(1.5, r * 0.4) * e
        const f = dir(c.facing)
        cam = { x: c.x + f.x * d, y: c.y + f.y * d }
        break
      }
      case 'pan-left':
      case 'pan-right':
        facing = c.facing + (c.move === 'pan-left' ? -25 : 25) * e
        break
      case 'arc-left':
      case 'arc-right': {
        const a = bearing + (c.move === 'arc-left' ? 1 : -1) * leftwards * 90 * e
        cam = { x: target.x + Math.sin(rad(a)) * r, y: target.y + Math.cos(rad(a)) * r }
        aim = target
        break
      }
      case 'track-left':
      case 'track-right': {
        // tracking "with them" keeps pace with someone walking that way; otherwise a 1.5 m slide
        const sign = c.move === 'track-left' ? 1 : -1
        const along = (p) => dot({ x: p.to.x - p.x, y: p.to.y - p.y }, left)
        const mover = (stage.people || []).find((p) => p.to && sign * along(p) > 0.3)
        const s = mover ? along(mover) * walkAt(t) : sign * 1.5 * e
        cam = { x: c.x + left.x * s, y: c.y + left.y * s }
        break
      }
      case 'handheld': {
        // a fixed, gentle wobble (the same clip every time)
        cam = { x: c.x + 0.05 * Math.sin(t * 7.1) + 0.03 * Math.sin(t * 13.7), y: c.y + 0.04 * Math.sin(t * 5.3) }
        facing = c.facing + 1.2 * Math.sin(t * 9.4)
        break
      }
    }
    const f = dir(facing)
    aim = aim ? { x: aim.x, y: aim.y } : { x: cam.x + f.x * r, y: cam.y + f.y * r }
    const people = (stage.people || []).map((p) => {
      if (!p.to) return { x: p.x, y: p.y, facing: p.facing }
      // they turn to walk, walk from 10% to 75% of the shot, then turn back to their own facing
      const walkDir = deg(Math.atan2(p.to.x - p.x, p.to.y - p.y))
      const w = walkAt(t)
      const facingNow = t < 0.1 ? turnTo(p.facing, walkDir, t / 0.1) : t < 0.75 ? walkDir : turnTo(walkDir, p.facing, smooth(Math.min(1, (t - 0.75) / 0.15)))
      return { x: lerp(p.x, p.to.x, w), y: lerp(p.y, p.to.y, w), facing: facingNow }
    })
    out.push({ camera: { x: cam.x, y: cam.y, z, aim: { x: aim.x, y: aim.y, z: aimZ } }, people })
  }
  return out
}

// A previs clip, by where previs.js keeps it (the app data's previs folder).
// Whether a shot is worth filming from its previs. Tested on 2026-10-31 (2 takes each, previs against the same
// staging in words): H3 followed a previs's arc round the people and barely arced from words, but for a push, a
// track and a walk the words did as well or better, and a previs take renders 1.6-3.5x slower. So arcs only.
export const needsPrevis = (stage) => /^arc/.test(stage?.camera?.move || '')
export const isPrevis = (file) => /[\\/]previs[\\/][^\\/]+\.mp4$/i.test(String(file || ''))

// What the prompt says about a previs clip used as <Video n>.
export function previsWords(stage, n = 1) {
  const who = (stage.people || []).map((p, i) => `the ${SHADE_WORDS[i % 4]} mannequin stands for ${first(p.name)}`).join(', ')
  return `<Video ${n}> is a grey previs of the camera move and the blocking only: plain mannequins and boxes on a bare grey stage. Follow its camera path, speed and framing, and where the people stand and walk, not its look${who ? `; ${who}` : ''}.`
}
