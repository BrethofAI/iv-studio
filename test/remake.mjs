// Remake's pure parts (src/service/remake.js): render length, canvas, keyframe picks, times, the prompt check and
// the graph, against Viggle's own workflow (comfyui/workflows/remake_swap_api.json).
//   node test/remake.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assemblePrompt, checkRemakePrompt, nearestAspect, paintPrompt, paintOk, pickKeyframes, remakeCanvas, remakeGraph, remakeLength, SECTIONS, stamp } from '../src/service/remake.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let n = 0
const ok = (name, fn) => {
  fn()
  n++
  console.log(`ok  ${name}`)
}

ok('length: the smallest 17n+5 from 90 that holds the clip, none past 345', () => {
  assert.equal(remakeLength(24), 90)
  assert.equal(remakeLength(90), 90)
  assert.equal(remakeLength(91), 107)
  assert.equal(remakeLength(124), 124)
  assert.equal(remakeLength(226), 226)
  assert.equal(remakeLength(345), 345)
  assert.equal(remakeLength(346), null)
  for (let f = 1; f <= 345; f++) {
    const L = remakeLength(f)
    assert.ok(L >= f && (L - 5) % 17 === 0 && L >= 90)
  }
})

ok('canvas: short edge 480, long edge the source shape on the 32 grid, capped', () => {
  assert.deepEqual(remakeCanvas(1920, 1080), { width: 864, height: 480 })
  assert.deepEqual(remakeCanvas(832, 480), { width: 832, height: 480 })
  assert.deepEqual(remakeCanvas(2752, 1536), { width: 864, height: 480 })
  assert.deepEqual(remakeCanvas(1080, 1920), { width: 480, height: 864 })
  assert.deepEqual(remakeCanvas(1000, 1000), { width: 480, height: 480 })
  assert.deepEqual(remakeCanvas(3000, 1000), { width: 1088, height: 480 })
  for (const [w, h] of [[1920, 1080], [1280, 720], [1440, 1080], [720, 1280], [2560, 1080]]) {
    const c = remakeCanvas(w, h)
    assert.equal(Math.min(c.width, c.height), 480)
    assert.ok(c.width % 32 === 0 && c.height % 32 === 0)
  }
})

ok('keyframes: 12 frames into each shot, a second late in a long single take, at most four', () => {
  assert.deepEqual(pickKeyframes(124), [12])
  assert.deepEqual(pickKeyframes(226), [12, 181])
  assert.deepEqual(pickKeyframes(226, [50, 140]), [12, 62, 152])
  assert.deepEqual(pickKeyframes(300, [20, 60, 100, 160, 220]).length, 4)
  assert.deepEqual(pickKeyframes(100, [4, 97]), [12], 'cuts within 8 frames of an end are noise')
  assert.deepEqual(pickKeyframes(30, [10]), [5, 20])
})

ok('the painter gets the picture shape nearest the canvas', () => {
  assert.equal(nearestAspect(864 / 480), '16:9')
  assert.equal(nearestAspect(480 / 864), '9:16')
  assert.equal(nearestAspect(1), '1:1')
  assert.equal(nearestAspect(640 / 480), '4:3')
})

ok('a painted swap passes when nobody is added and the person shows more than before', () => {
  assert.equal(paintOk({ added: true, score: 0.9 }), false)
  assert.equal(paintOk({ added: false, score: null }), true)
  assert.equal(paintOk({ added: false, score: 0.76, before: 0.09 }), true)
  assert.equal(paintOk({ added: false, score: 0.2, before: 0.05 }), false)
  assert.equal(paintOk({ added: false, score: 0.32, before: 0.35 }), false, 'Theo was already in the source')
  assert.equal(paintOk({ added: false, score: 0.55, before: 0.35 }), true)
})

ok('times are MM:SS.mmm at 24 fps', () => {
  assert.equal(stamp(0), '00:00.000')
  assert.equal(stamp(12), '00:00.500')
  assert.equal(stamp(184), '00:07.667')
  assert.equal(stamp(1500), '01:02.500')
})

const good = assemblePrompt({
  subject_definitions: '<Video 1> is the source video for the target video edit.\n<Picture 1> is a frame of the target video.',
  summary: '[video editing] The target video is an edited version of <Video 1> on a snowy evening.',
  retention_analysis: '<Video 1> (source video editing): fully_preserved.\n<Picture 1> (target keyframe): fully_preserved.',
  detailed_description: '[Shot 1] From 00:00.000 to 00:05.083 the camera holds. At 00:00.500 the scene matches <Picture 1>.',
  overall_soundscape: 'The soundtrack of <Video 1>, unchanged.'
})

ok('the six sections, in order, each header on its own line, music N/A by default', () => {
  const at = SECTIONS.map((k) => good.indexOf(`${k}:\n`))
  assert.ok(at.every((v, i) => v >= 0 && (!i || v > at[i - 1])))
  assert.ok(good.includes('non_diegetic_music:\nN/A'))
  assert.deepEqual(checkRemakePrompt(good, { pictures: 1, frames: 124 }), [])
})

ok('the check catches missing pictures, orders, late times and "dim"', () => {
  assert.match(checkRemakePrompt(good, { pictures: 2, frames: 124 }).join(), /<Picture 2> isn't named/)
  assert.match(checkRemakePrompt(good, { pictures: 0, frames: 124 }).join(), /only 0 painted/)
  assert.match(checkRemakePrompt(good.replace('on a snowy evening', 'but replace the man with a cat'), { pictures: 1, frames: 124 }).join(), /order/)
  assert.deepEqual(checkRemakePrompt(good.replace('on a snowy evening', 'in which he replaces the pizza maker'), { pictures: 1, frames: 124 }), [])
  assert.match(checkRemakePrompt(good, { pictures: 1, frames: 90 }).join(), /past the end/)
  assert.match(checkRemakePrompt(good.replace('holds', 'holds in a dimly lit room'), { pictures: 1, frames: 124 }).join(), /dim/)
  assert.match(checkRemakePrompt(good.replace('summary:', 'résumé:'), { pictures: 1 }).join(), /missing summary/)
})

ok('the graph is Viggle’s workflow with the int8 file in place of base + LoRA', () => {
  const viggle = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'remake_swap_api.json'), 'utf8'))
  const g = remakeGraph({ kind: 'swap', unet: 'Viggle Remake\\viggle_remake_swap_pruned_int8_convrot.safetensors', clip: 'qwen.safetensors', vae: 'v.safetensors', audioVae: 'a.safetensors', source: 'remake/src.mp4', refs: ['remake/p1.png', 'remake/p2.png'], pins: [12, 184], frames: 226, prompt: 'P', seed: 0 })
  const classes = (x) => Object.values(x).map((n) => n.class_type).sort()
  assert.deepEqual(classes(g), classes(viggle).filter((c) => c !== 'LoraLoaderBypassModelOnly'))
  assert.equal(g[3].inputs.model[0], '1')
  assert.equal(g[11].inputs.pins, '12, 184')
  assert.deepEqual(g[11].inputs.ref_2, ['ref2', 0])
  assert.equal(g[15].inputs.sigmas, viggle['15'].inputs.sigmas)
  for (const k of ['frames', 'short_edge']) assert.equal(g[11].inputs[k], viggle['11'].inputs[k])
  const edit = remakeGraph({ kind: 'change', unet: 'x', clip: 'c', vae: 'v', audioVae: 'a', source: 's', refs: ['r'], frames: 124, prompt: 'P', lora: { name: 'tess.safetensors', strength: 0.8 } })
  assert.equal(edit[15].inputs.sigmas, '1.0, 0.983607, 0.96, 0.923077, 0.857143, 0.705882, 0.0')
  assert.equal(edit[3].inputs.model[0], '2', 'a character LoRA sits between the model and the keyframe node')
  assert.equal(edit[11].inputs.pins, '')
})

ok('the painter is asked to keep the shot and change only what was asked', () => {
  const sw = paintPrompt({ kind: 'swap', people: [{ who: 'the pizza maker', name: 'Theo' }] })
  assert.match(sw, /Change the pizza maker in picture 1 into Theo from picture 2/)
  assert.match(sw, /Do not add anyone/)
  assert.match(sw, /everything they hold/)
  const two = paintPrompt({ kind: 'swap', people: [{ who: 'the woman', name: 'Ada' }, { who: 'the man', name: 'Bo' }] })
  assert.match(two, /Change the woman in picture 1 into Ada from picture 2.*Change the man in picture 1 into Bo from picture 3/)
  const ch = paintPrompt({ kind: 'change', ask: 'make it snow.' })
  assert.match(ch, /^Edit this video frame: make it snow\. Keep everything else/)
})

console.log(`\n${n} checks passed`)
