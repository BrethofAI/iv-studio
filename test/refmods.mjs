// RefMod characters (src/service/refmods.js, plan.js): the graph that makes a RefMod, and a RefMod character in a
// shot's plan. No ComfyUI needed.  node test/refmods.mjs
import assert from 'node:assert/strict'
import { refmodGraph, slugName, subjectHint, MAX_PICTURES } from '../src/service/refmods.js'
import { planPreviews } from '../src/service/plan.js'
import { validateSequence } from '../src/service/sequence.js'

let passed = 0
const ok = (name, fn) => {
  fn()
  passed++
  console.log(`ok  ${name}`)
}

ok('the graph: one LoadImage per picture into the master node, saved as one bundle in characters/', () => {
  const g = refmodGraph({ name: 'maya_ab12cd', pictures: ['iv_studio/refmods/a.png', 'iv_studio/refmods/b.png'], description: subjectHint('a woman'), vae: 'minimax_h3_video_vae_fp16.safetensors' })
  assert.equal(g['1'].class_type, 'LoadImage')
  assert.equal(g['2'].inputs.image, 'iv_studio/refmods/b.png')
  const m = g['30'].inputs
  assert.equal(g['30'].class_type, 'MiniMaxH3RefModMasterExtract')
  assert.deepEqual(m['refs_image.ref_image_0'], ['1', 0])
  assert.deepEqual(m['refs_image.ref_image_1'], ['2', 0])
  assert.equal(m.save_layout, 'bundle')
  assert.equal(m.subfolder, 'characters')
  assert.equal(m.mode, 'Full Reference')
  assert.equal(m.save, true)
  assert.ok(!('audio' in m), 'no voice, no audio input')
  assert.ok(!m.description.includes('{voice}') && !m.description.includes('voice timbre'))
})

ok('a voice clip adds the audio VAE and says so in the prompt hint', () => {
  const g = refmodGraph({ name: 'x', pictures: ['a.png'], audio: 'iv_studio/refmods/v.wav', description: subjectHint('a man'), vae: 'v.safetensors', audioVae: 'minimax_h3_audio_vae_fp32.safetensors' })
  assert.deepEqual(g['30'].inputs.audio, ['20', 0])
  assert.deepEqual(g['30'].inputs.audio_vae, ['21', 0])
  assert.match(g['30'].inputs.description, /voice timbre/)
  assert.throws(() => refmodGraph({ name: 'x', pictures: ['a.png'], audio: 'v.wav', vae: 'v' }), /audio VAE/)
})

ok('no pictures is refused; more than six are cut to six', () => {
  assert.throws(() => refmodGraph({ name: 'x', pictures: [], vae: 'v' }), /at least one picture/)
  const g = refmodGraph({ name: 'x', pictures: Array.from({ length: 9 }, (_, i) => `${i}.png`), vae: 'v' })
  assert.equal(Object.values(g).filter((n) => n.class_type === 'LoadImage').length, MAX_PICTURES)
})

ok('names become safe file names', () => {
  assert.equal(slugName('Maya Ortiz!'), 'maya_ortiz')
  assert.equal(slugName(''), 'character')
})

const chars = [
  { id: 'r1', name: 'Maya', refmod: 'characters/maya_ab12cd', strength: 0.9, trigger: '' },
  { id: 'l1', name: 'Tess', lora: 'MiniMax H3\\tess\\t.safetensors', strength: 0.8, trigger: 't3ss4' }
]
const shot = { mode: 'text', prompt: '{char} waves', aspect: '16:9', megapixels: 0.4, seconds: 5, previews: 1, seed: 1 }

ok('a RefMod character: no character LoRA, {char} is its name, its RefMod is RefMod 1', () => {
  const p = planPreviews({ ...shot, character: 'r1', refmods: [{ name: 'places/kitchen', strength: 1 }] }, chars)
  assert.ok(p.groups.includes('char_none') && !p.groups.includes('char_tess'))
  assert.ok(p.groups.includes('refmods'))
  assert.equal(p.values['1004'], 'Maya')
  assert.equal(p.values['1101.mod_1'], 'characters/maya_ab12cd')
  assert.equal(p.values['1101.strength_1'], 0.9)
  assert.equal(p.values['1101.mod_2'], 'places/kitchen')
  assert.ok(!('1001.LoraLoaderState' in p.values))
})

ok('a LoRA character is unchanged', () => {
  const p = planPreviews({ ...shot, character: 'l1' }, chars)
  assert.ok(p.groups.includes('char_tess') && !p.groups.includes('refmods'))
  assert.equal(p.values['1002'], 't3ss4')
})

ok('References mode with only a RefMod character is enough; eight more RefMods are too many', () => {
  assert.ok(planPreviews({ ...shot, mode: 'reference', character: 'r1' }, chars).groups.includes('refmods'))
  const eight = Array.from({ length: 8 }, (_, i) => ({ name: `m${i}`, strength: 1 }))
  assert.throws(() => planPreviews({ ...shot, character: 'r1', refmods: eight }, chars), /At most 7 RefMods/)
})

ok('sequences refuse a RefMod character in words', () => {
  assert.throws(() => validateSequence({ character: 'r1', shots: [{ prompt: 'x' }], shotSeconds: 10 }, chars), /RefMod character/)
})

console.log(`${passed} checks passed`)
