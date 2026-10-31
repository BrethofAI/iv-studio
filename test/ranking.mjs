// Take ranking (src/service/ranking.js) and the live preview wrap (src/service/remote.js).
//   node test/ranking.mjs [a video to measure]
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-ffprobe-static'
import { combine, DEFAULT_WEIGHTS, heardScore, Ranker, relativeSharpness, spokenLines } from '../src/service/ranking.js'
import { capabilities, withLivePreview } from '../src/service/remote.js'

let n = 0
const ok = async (name, fn) => {
  await fn()
  n++
  console.log(`ok  ${name}`)
}

await ok('spoken lines and how much of them was heard', () => {
  assert.deepEqual(spokenLines('A (S1) says: <d>[English] Bus is late.</d> B (S2): <d>Mine.</d>'), ['Bus is late.', 'Mine.'])
  assert.equal(heardScore('Bus is late. Mine.', 'Bus is late. Mine.'), 1)
  assert.equal(heardScore('Nope. Mine.', 'Nope.'), 0.5)
  assert.ok(heardScore("Bus's late, I'm here", "Hey, bus is late, I'm here. Hey, bus is late, I'm here.") < 1, 'a line said twice over is marked down a little')
  assert.equal(heardScore('', 'anything'), null)
  assert.equal(heardScore('Twenty minutes late again.', '20 minutes late again.'), 1, 'numbers match written either way')
  assert.equal(heardScore('Twenty-one days and a hundred and five nights.', '21 days and 105 nights'), 1)
})
await ok('sharpness relative to the other takes', () => {
  assert.deepEqual(relativeSharpness([4, 8, 6]), [1, 0, 0.5])
  assert.deepEqual(relativeSharpness([5, 5.2, null]), [1, 1, null], 'takes that barely differ are all sharp')
})
await ok('the parts combine over what was measured, and the best is marked', () => {
  const takes = [
    { candidate: 1, parts: { words: 1, likeness: 0.4, motion: 1, sharpness: 0 } },
    { candidate: 2, parts: { words: 0.25, likeness: 0.9, motion: 1, sharpness: 1 } },
    { candidate: 3, parts: { words: null, likeness: null, motion: null, sharpness: null } }
  ]
  const r = combine(takes, DEFAULT_WEIGHTS)
  assert.equal(r[0].best, true, 'hearing every word outweighs a better face when the other take drops half its line (0.5 heard, squared)')
  assert.equal(r[2].score, null)
  assert.equal(combine([takes[0]]).every((t) => !t.best), true, 'one take alone is not "best"')
  const tie = combine([{ candidate: 1, parts: { words: 0.5 } }, { candidate: 2, parts: { words: 0.51 } }])
  assert.ok(tie.every((t) => !t.best), 'a tie has no winner')
})
await ok('picks move the weights towards what set the pick apart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-rank-'))
  const job = { kind: 'previews', ranking: { takes: [{ candidate: 1, parts: { words: 1, likeness: 0.2, motion: 1, sharpness: 0.5 } }, { candidate: 2, parts: { words: 0.6, likeness: 0.9, motion: 1, sharpness: 0.5 } }] } }
  const r = new Ranker({ studio: () => ({ getJob: () => job }), dataDir: root, ffmpeg: '' })
  const w = r.learn('j', 2)
  assert.ok(w.likeness > DEFAULT_WEIGHTS.likeness && w.words < DEFAULT_WEIGHTS.words && w.motion === DEFAULT_WEIGHTS.motion)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'rank-weights.json'), 'utf8')).picks, 1)
  fs.rmSync(root, { recursive: true, force: true })
})
const clip = process.argv[2]
if (clip && fs.existsSync(clip))
  await ok('a real clip is measured: blur and frozen time', async () => {
    const r = new Ranker({ studio: () => null, dataDir: os.tmpdir(), ffmpeg: ffmpegStatic.ffmpegPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) })
    const m = await r.measure(clip)
    assert.ok(m.blur > 0 && m.duration > 1 && m.frozen >= 0, JSON.stringify(m))
    console.log(`    ${path.basename(clip)}: ${JSON.stringify(m)}`)
  })
await ok('live previews: the preview guider gets the model through KJ\'s preview node; nothing else changes', () => {
  const g = { 8: { class_type: 'BlockSparseAttention', inputs: {} }, 14: { class_type: 'BasicGuider', inputs: { model: ['8', 0] } }, 26: { class_type: 'BasicGuider', inputs: { model: ['8', 0] } } }
  const out = withLivePreview(g)
  assert.deepEqual(out[14].inputs.model, ['iv_live', 0])
  assert.deepEqual(out.iv_live.inputs.model, ['8', 0])
  assert.equal(out.iv_live.inputs.tiny_vae, 'taeh3.safetensors')
  assert.deepEqual(out[26].inputs.model, ['8', 0], 'the 2 MP pass is untouched')
  assert.deepEqual(g[14].inputs.model, ['8', 0], 'the original graph is not changed')
  assert.deepEqual(withLivePreview(out), out, 'wrapping twice does nothing')
  const caps = (opts) => capabilities({ ModelPreviewOverrideKJ: { input: { optional: { tiny_vae: ['COMBO', { options: opts }] } } } }, { system: { os: 'win32' } })
  assert.equal(caps(['none', 'taeh3.safetensors']).livePreview, true)
  assert.equal(caps(['none']).livePreview, false)
})
console.log(`${n} checks passed`)
