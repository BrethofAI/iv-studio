// The staging board's words: screen sides, facing, distance, paths, shot size, and the 180-degree line check.
//   node test/staging.mjs
import assert from 'node:assert/strict'
import { cameraWords, defaultStage, facingWords, isPrevis, lineCheck, previsFrames, previsWords, project, shotSize, stagingWords } from '../src/service/staging.js'
import { lintPrompt } from '../src/service/lint.js'
import { systemPrompt } from '../src/service/prompter.js'

let n = 0
const ok = (name, fn) => {
  fn()
  n++
  console.log(`ok  ${name}`)
}
const two = () => defaultStage(['Tess Marlow', 'Theo Lindqvist'])

ok('two people face each other across the frame', () => {
  const s = two()
  const w = stagingWords(s)
  assert.match(w, /^Tess stands at screen-left, in profile, facing screen-right, looking at Theo\. Theo stands at screen-right, in profile, facing screen-left, looking at Tess\./)
  assert.match(w, /They are about 2 metres apart\./)
})
ok('facing, as the camera sees it', () => {
  const s = two()
  const p = { x: 0, y: 1, facing: 180 }
  assert.equal(facingWords(s, p), 'facing the camera')
  assert.equal(facingWords(s, { ...p, facing: 0 }), 'with their back to the camera')
  assert.equal(facingWords(s, { ...p, facing: 135 }), 'turned three-quarters toward screen-right')
  assert.equal(facingWords(s, { ...p, facing: -45 }), 'turned away toward screen-left')
})
ok('the camera turned round flips the sides', () => {
  const s = two()
  s.camera = { ...s.camera, x: 0, y: 5, facing: 180 }
  assert.match(stagingWords(s), /^Tess stands at screen-right/)
})
ok('off screen and behind the camera', () => {
  const s = two()
  s.people[1].x = 6
  assert.match(stagingWords(s), /Theo is out of frame past screen-right\./)
  s.people[1] = { ...s.people[1], x: 0, y: -4 }
  assert.match(stagingWords(s), /Theo is out of frame, behind the camera\./)
  assert.equal(project(s, { x: 0, y: -4 }).on, false)
})
ok('a walk from outside the frame to the left third', () => {
  const s = defaultStage(['Tess'])
  s.people[0] = { name: 'Tess', x: 3, y: 1, facing: -90, to: { x: -0.6, y: 1 }, lookAt: null }
  s.camera.lens = 'normal'
  assert.match(stagingWords(s), /Tess enters and walks from outside the frame at screen-right to the left third and stops there\./)
})
ok('shot size follows the distance and the lens', () => {
  const s = defaultStage(['Tess'])
  assert.equal(shotSize(s), 'Full shot')
  s.camera.y = 0.2
  assert.equal(shotSize(s), 'Close-up')
  s.camera = { ...s.camera, y: -6, lens: 'wide' }
  assert.equal(shotSize(s), 'Wide shot')
  assert.match(cameraWords(s), /^Wide shot, at eye level; the camera holds a static shot$/)
})
ok('the line between two people: a reverse from the other side swaps them, an arc may', () => {
  const a = two()
  const b = two()
  b.camera = { ...b.camera, y: 5, facing: 180 }
  assert.equal(lineCheck(a, b).length, 1)
  assert.match(lineCheck(a, b)[0], /Tess and Theo swap sides/)
  const over = two()
  over.camera = { ...over.camera, x: -1.6, y: -1.2, facing: 40 }
  assert.deepEqual(lineCheck(a, over), [], 'an over-the-shoulder from the same side keeps them')
  assert.deepEqual(lineCheck({ ...a, camera: { ...a.camera, move: 'arc-left' } }, b), [], 'an arc carries the camera across on screen')
})
ok("previs: an arc goes round the pair to the camera's left and keeps them in view", () => {
  const s = two()
  s.camera.move = 'arc-left'
  const f = previsFrames(s, { frames: 124 })
  assert.equal(f.length, 124)
  const [a, b] = [f[0].camera, f[123].camera]
  assert.ok(Math.abs(a.x) < 1e-9 && Math.abs(a.y + 3) < 1e-9, 'starts where the board puts it')
  assert.ok(b.x < -3.5 && Math.abs(b.y - 1) < 0.1, `ends a quarter turn round to the left (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`)
  assert.deepEqual([f[60].camera.aim.x, f[60].camera.aim.y], [0, 1], 'aimed at the pair throughout')
})
ok('previs: push, pan and a walk', () => {
  const s = defaultStage(['Tess'])
  s.people[0] = { name: 'Tess', x: 2, y: 1, facing: 180, to: { x: -1, y: 1 }, lookAt: null }
  s.camera.move = 'push'
  const f = previsFrames(s, { frames: 101 })
  assert.ok(f[100].camera.y > -3 + 1.1, 'pushes in about 1.5 m')
  assert.deepEqual([f[0].people[0].x, f[100].people[0].x], [2, -1])
  assert.equal(f[50].people[0].facing, -90, 'faces the way she walks')
  assert.equal((f[100].people[0].facing + 360) % 360, 180, 'and turns back at the end')
  s.camera.move = 'pan-right'
  assert.ok(previsFrames(s, { frames: 11 })[10].camera.aim.x > 1, 'a pan right turns the aim right')
  assert.match(previsWords(two(), 1), /^<Video 1> is a grey previs.*the dark grey mannequin stands for Tess, the light grey mannequin stands for Theo\.$/)
})
ok('a previs is a camera guide: the writer is told so, and a prompt that describes its mannequins is stopped', () => {
  const file = String.raw`C:\Users\x\AppData\Roaming\IV Studio\previs\arc_mvw.mp4`
  assert.ok(isPrevis(file) && !isPrevis(String.raw`C:\clips\take.mp4`))
  const media = [{ kind: 'picture', file: 'a.png' }, { kind: 'video', file }]
  const sys = systemPrompt({ mode: 'reference', seconds: 5, media })
  assert.match(sys, /<Video 1> \(video: a grey previs, for the camera move and blocking only\)/)
  assert.match(sys, /Never define a <Subject> from it and never mention mannequins/)
  const good = ['subject_definitions:', '<Subject 1> is the woman in <Picture 1>.', '', 'detailed_description:', `[Shot 1] ${previsWords(two(), 1)} Tess and Theo talk on a rooftop.`, '', 'overall_soundscape: Wind.'].join('\n')
  assert.ok(!lintPrompt(good, { mode: 'reference', seconds: 5, media }).some((f) => f.code === 'previs-look'), 'its own sentence is fine')
  const bad = good.replace('talk on a rooftop', 'stand like the dark grey mannequin')
  assert.ok(lintPrompt(bad, { mode: 'reference', seconds: 5, media }).some((f) => f.code === 'previs-look' && f.level === 'error'))
})
console.log(`${n} checks passed`)
