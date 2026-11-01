// Reframe: where a shot sits in its new frame, the mask's hole, H3 lengths and the graph.   node test/reframe.mjs
import assert from 'node:assert/strict'
import { h3Frames, reframeGeometry, reframeGraph, reframePrompt } from '../src/service/reframe.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
ok('16:9 into 9:16: the shot fits the width, bars above and below, on the 32-pixel grid', () => {
  const g = reframeGeometry({ width: 1376, height: 768, shape: '9:16', megapixels: 0.6 })
  assert.deepEqual([g.W, g.H], [608, 1056])
  assert.equal(g.W % 32 + (g.H % 32), 0)
  assert.equal(g.w, 608)
  assert.equal(g.x, 0)
  assert.ok(g.y > 300 && g.y + g.h <= g.H)
  assert.deepEqual([g.hole.x, g.hole.w], [0, 608], 'no blend at the sides: the shot fills the width')
  assert.equal(g.hole.y, g.y + 16)
  assert.ok(g.filled > 0.6 && g.filled < 0.75, `${g.filled} of the frame is new`)
})
ok('zoom crops into the shot so less is drawn', () => {
  const a = reframeGeometry({ width: 1376, height: 768, shape: '9:16' })
  const b = reframeGeometry({ width: 1376, height: 768, shape: '9:16', zoom: 1.5 })
  assert.ok(b.filled < a.filled)
  assert.equal(b.w, b.W, 'still the whole width')
  assert.ok(b.scaled.w > b.W, 'the sides are cropped')
})
ok('9:16 into 16:9: bars at the sides', () => {
  const g = reframeGeometry({ width: 768, height: 1376, shape: '16:9' })
  assert.equal(g.y, 0)
  assert.ok(g.x > 0 && g.hole.x === g.x + 16)
})
ok('H3 lengths are 17n+5 frames, at most 15 s', () => {
  assert.equal(h3Frames(125), 124)
  assert.equal(h3Frames(124), 124)
  assert.equal(h3Frames(123), 107)
  assert.equal(h3Frames(1000), 362)
  assert.equal(h3Frames(10), 22)
})
ok('the graph regenerates only the mask, holding the source and its sound', () => {
  const g = reframeGraph({ padded: 'p.mp4', mask: 'iv_studio/m.png', prompt: 'x', prefix: 'iv_studio/reframes/a' })
  assert.equal(g.maskload.class_type, 'LoadImage', 'one still mask')
  assert.equal(g.target.inputs.mask_meaning, 'white = generate')
  assert.equal(g.target.inputs.audio_mode, 'preserve source audio')
  assert.deepEqual(g.sample.inputs.latent_image, ['target', 0])
  assert.deepEqual([g.text.inputs.width, g.text.inputs.length], [['edit', 1], ['edit', 3]])
  assert.match(reframePrompt({ shape: '9:16', about: 'Tess at a bus stop.' }), /vertical 9:16[\s\S]*Add no new people[\s\S]*The shot: Tess at a bus stop\./)
})
console.log(`${n} checks passed`)
