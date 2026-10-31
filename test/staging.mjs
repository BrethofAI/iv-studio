// The staging board's words: screen sides, facing, distance, paths, shot size, and the 180-degree line check.
//   node test/staging.mjs
import assert from 'node:assert/strict'
import { cameraWords, defaultStage, facingWords, lineCheck, project, shotSize, stagingWords } from '../src/service/staging.js'

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
console.log(`${n} checks passed`)
