// Reel: the beat finder on a made-up click track, and the cut plan.   node test/reel.mjs
import assert from 'node:assert/strict'
import { findBeats, reelPlan } from '../src/service/reel.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
const RATE = 11025
// a click track: a short burst of noise every beat, under a quiet hum, starting at `offset` seconds
function clicks(bpm, seconds, offset = 0.3) {
  const s = new Float32Array(Math.round(seconds * RATE))
  let seed = 7
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let k = 0; k < s.length; k++) s[k] = 0.05 * Math.sin((2 * Math.PI * 110 * k) / RATE)
  for (let t = offset; t < seconds; t += 60 / bpm) for (let k = 0; k < 400; k++) {
    const i = Math.round(t * RATE) + k
    if (i < s.length) s[i] += 0.8 * noise() * Math.exp(-k / 120)
  }
  return s
}
ok('finds the tempo and the beats of a click track', () => {
  for (const bpm of [92, 120, 140]) {
    const r = findBeats(clicks(bpm, 20), RATE)
    assert.ok(Math.abs(r.bpm - bpm) <= 1.5, `${bpm} BPM heard as ${r.bpm}`)
    const off = r.beats.map((t) => ((t - 0.3) / (60 / bpm)) % 1).map((f) => Math.min(f, 1 - f) * (60 / bpm))
    assert.ok(off.every((d) => d < 0.05), `${bpm}: beats land on the clicks (worst ${Math.max(...off).toFixed(3)} s)`)
    assert.ok(r.strength > 0.3, `a clear beat (${r.strength})`)
  }
})
ok('silence has no beat, and a reel then cuts at an even pace', () => {
  const r = findBeats(new Float32Array(RATE * 10), RATE)
  assert.equal(r.beats.length > 0 && r.strength > 0.3, false)
  const p = reelPlan({ beats: [], period: 0, duration: 10, count: 3, pace: 'normal' })
  assert.deepEqual(p.slots.map((s) => [s.at, s.seconds]), [[0, 2.2], [2.2, 2.2], [4.4, 2.2]])
})
ok('each picture holds a whole number of beats near the pace, from the start of the song', () => {
  const period = 0.5 // 120 BPM
  const beats = Array.from({ length: 80 }, (_, k) => +(0.12 + k * period).toFixed(3))
  const p = reelPlan({ beats, period, duration: 40, count: 6, pace: 'normal' })
  assert.equal(p.beatsPer, 4, '4 beats = 2 s, nearest 2.2 s')
  assert.equal(p.slots[0].at, 0)
  assert.ok(p.slots.slice(1).every((s) => beats.includes(s.at)), 'every later cut is on a beat')
  assert.ok(p.slots.slice(1, -1).every((s) => Math.abs(s.seconds - 2) < 1e-6))
  assert.deepEqual(p.slots.map((s) => s.move), ['in', 'left', 'out', 'right', 'in', 'left'])
  assert.equal(reelPlan({ beats, period, duration: 40, count: 6, pace: 'fast' }).beatsPer, 2)
  assert.equal(reelPlan({ beats, period, duration: 40, count: 6, pace: 'calm' }).beatsPer, 8)
})
ok('a short song (or length) leaves pictures out rather than running past it', () => {
  const period = 0.5
  const beats = Array.from({ length: 20 }, (_, k) => +(k * period).toFixed(3))
  const p = reelPlan({ beats, period, duration: 9.5, count: 10, pace: 'normal' })
  assert.ok(p.seconds <= 9.5 && p.slots.length < 10, `${p.slots.length} pictures in ${p.seconds} s`)
  assert.ok(reelPlan({ beats, period, duration: 9.5, count: 10, pace: 'normal', length: 5 }).seconds <= 5)
})
console.log(`${n} checks passed`)
