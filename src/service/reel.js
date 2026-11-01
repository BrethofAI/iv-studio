// Reel: pictures (and clips) plus a song, cut to the song's beat with slow camera moves on the pictures, as an
// ordinary edit the person (or an agent) can fine-tune and export. The beat is found here from the song itself
// with the bundled ffmpeg (no Shinobi or Python needed): an onset envelope from the sound's energy, the tempo
// from its autocorrelation, and the beats where that tempo lines up best with the onsets.
// findBeats and reelPlan are pure, so they are tested without ffmpeg.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { FORMATS } from './edits.js'
import { applyOps } from './timeline.js'

const RATE = 11025 // the song is read as mono at this rate
const HOP = 256 // samples per envelope step (about 23 ms)
const FRAME = 1024
const IMAGE = /\.(png|jpe?g|webp|bmp)$/i

// In-place radix-2 FFT (n a power of two).
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar
        im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        ;[cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr]
      }
    }
  }
}

// Beats of a song from its mono samples: { bpm, period (s), beats: [s], strength (0..1, how clear the beat is) }.
export function findBeats(samples, rate = RATE) {
  const steps = Math.floor((samples.length - FRAME) / HOP)
  if (steps < 50) return { bpm: 0, period: 0, beats: [], strength: 0 }
  // spectral flux: how much each frequency band got louder since the last step, summed. Plain loudness heard
  // "New Age Crisis" at 99 BPM, 3 beats to its 4-beat bars (about 131 BPM), because sustained notes swamp it.
  const BINS = FRAME / 2
  const window = new Float64Array(FRAME).map((_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / FRAME))
  const re = new Float64Array(FRAME)
  const im = new Float64Array(FRAME)
  let prev = new Float64Array(BINS)
  let mag = new Float64Array(BINS)
  const raw = new Float64Array(steps)
  for (let k = 0; k < steps; k++) {
    for (let n = 0; n < FRAME; n++) {
      re[n] = samples[k * HOP + n] * window[n]
      im[n] = 0
    }
    fft(re, im)
    let flux = 0
    for (let b = 1; b < BINS; b++) {
      mag[b] = Math.log(1 + 100 * Math.hypot(re[b], im[b]))
      flux += Math.max(0, mag[b] - prev[b])
    }
    raw[k] = k ? flux : 0
    ;[prev, mag] = [mag, prev]
  }
  // less its local mean (about half a second), so steady loud passages don't count as beats
  const env = new Float64Array(steps)
  const W = Math.round((0.5 * rate) / HOP)
  let sum = 0
  for (let k = 0; k < steps; k++) {
    sum += raw[k] - (k > W ? raw[k - W - 1] : 0)
    env[k] = Math.max(0, raw[k] - sum / Math.min(k + 1, W + 1))
  }
  // tempo: the autocorrelation of the envelope between 60 and 180 BPM, leaning gently toward 120
  const toLag = (bpm) => (60 * rate) / HOP / bpm
  let best = { lag: 0, score: -1 }
  const ac = (lag) => {
    const L = Math.floor(lag)
    const f = lag - L
    let s = 0
    for (let k = 0; k + L + 1 < steps; k++) s += env[k] * (env[k + L] * (1 - f) + env[k + L + 1] * f)
    return s / (steps - L)
  }
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = toLag(bpm)
    const lean = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2)
    const score = (ac(lag) + 0.5 * ac(lag * 2)) * lean
    if (score > best.score) best = { lag, score, bpm }
  }
  // tempo and phase together, finely: a small tempo error adds up over a song (1 BPM is 0.2 s off after 30 beats),
  // so the lag is tuned within 2% to where beats every lag steps collect the most onset
  const comb = (lag, at) => {
    let s = 0
    for (let p = at; p < steps; p += lag) s += Math.max(env[Math.floor(p)] || 0, env[Math.ceil(p)] || 0)
    return s
  }
  let phase = { at: 0, sum: -1, lag: best.lag }
  for (let lag = best.lag * 0.98; lag <= best.lag * 1.02; lag += best.lag * 0.001)
    for (let at = 0; at < lag; at += 0.5) {
      const s = comb(lag, at)
      if (s > phase.sum) phase = { at, sum: s, lag }
    }
  const lag = phase.lag
  best.bpm = (60 * rate) / HOP / lag
  const period = (lag * HOP) / rate
  // a step's energy rises as soon as its window reaches the beat, about a window early (measured 87 ms on clicks)
  const late = (FRAME - HOP / 4) / rate
  const beats = []
  for (let p = phase.at; p < steps; p += lag) beats.push(+((p * HOP) / rate + late).toFixed(3))
  // how clear the beat is: the onset the beats collect against the same tempo at any other phase (1 when the
  // beats collect three times the average or more; 0 for a song with no pulse)
  let others = 0
  let count = 0
  for (let at = 0; at < lag; at += 0.5, count++) others += comb(lag, at)
  const ratio = others > 0 ? phase.sum / (others / count) : 0
  return { bpm: +best.bpm.toFixed(1), period: +period.toFixed(4), beats, strength: +Math.max(0, Math.min(1, (ratio - 1) / 2)).toFixed(2) }
}

export const PACES = { calm: 3.2, normal: 2.2, fast: 1.2 } // about this many seconds per picture
const MOVES = ['in', 'left', 'out', 'right']

// The reel's cut: one slot per picture, each a whole number of beats (1, 2, 4 or 8, whichever is nearest the
// pace), from the start of the song. It ends with the pictures or the song (or length), whichever comes first;
// a picture that won't fit is left out. Returns { slots: [{ item, at, seconds, move }], seconds, beatsPer }.
export function reelPlan({ beats = [], period = 0, duration, count, pace = 'normal', length = null }) {
  const target = PACES[pace] || PACES.normal
  const end = Math.min(duration, length || Infinity)
  let cuts
  let beatsPer = 0
  if (period > 0.2 && beats.length > 4) {
    beatsPer = [1, 2, 4, 8].reduce((a, b) => (Math.abs(b * period - target) < Math.abs(a * period - target) ? b : a))
    // cuts every beatsPer beats counted from the song's first beat, so they keep to its bars (counting from
    // wherever half a slot fell put them on the third beat of each bar); the first one comes after half a slot,
    // so the opening picture isn't a flash
    let first = 0
    while (first < beats.length && beats[first] < target / 2 - 0.05) first += beatsPer
    cuts = [0]
    for (let k = first; k < beats.length; k += beatsPer) if (beats[k] > cuts.at(-1) + 0.3) cuts.push(beats[k])
  } else {
    // no clear beat: an even pace
    cuts = []
    for (let t = 0; t < end; t += target) cuts.push(+t.toFixed(3))
  }
  const slots = []
  for (let i = 0; i < count && cuts[i] < end - 0.5; i++) {
    const at = cuts[i]
    const next = Math.min(end, cuts[i + 1] ?? at + target)
    slots.push({ item: i, at: +at.toFixed(3), seconds: +(next - at).toFixed(3), move: MOVES[i % MOVES.length] })
  }
  const seconds = slots.length ? +(slots.at(-1).at + slots.at(-1).seconds).toFixed(3) : 0
  return { slots, seconds, beatsPer }
}

export class Reels {
  // edits: Edits (its ffmpeg, probe, create, write)
  constructor({ dataDir, edits }) {
    this.dir = path.join(dataDir, 'reels')
    this.edits = edits
  }

  async beatsOf(song) {
    const pcm = await this.edits.run(['-v', 'error', '-i', song, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'])
    // (copied: a Buffer's bytes needn't start on a 4-byte boundary)
    const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.byteLength - (pcm.byteLength % 4))))
    return { ...findBeats(samples, RATE), duration: samples.length / RATE }
  }

  // items: picture or video files, in order. song: a sound file. Returns { editId, seconds, bpm, strength, used, left }.
  async make({ name = 'Reel', items, song, pace = 'normal', format = '1080p', length = null }) {
    if (!items?.length) throw new Error('Add some pictures.')
    if (!song || !fs.existsSync(song)) throw new Error('Pick a song.')
    for (const f of items) if (!fs.existsSync(f)) throw new Error(`Not found: ${f}`)
    const beat = await this.beatsOf(song)
    // a song without a clear pulse (an orchestral swell read 0.38) is cut at an even pace instead
    const plan = reelPlan({ ...(beat.strength >= 0.3 ? beat : { beats: [], period: 0 }), duration: beat.duration, count: items.length, pace, length })
    if (!FORMATS[format]) throw new Error(`format must be ${Object.keys(FORMATS).join(', ')}.`)
    // the moving pictures are made at up to 1080 on the short side (a 4K export scales them up)
    const k = Math.min(1, 1080 / Math.min(FORMATS[format].width, FORMATS[format].height))
    const W = Math.round((FORMATS[format].width * k) / 2) * 2
    const H = Math.round((FORMATS[format].height * k) / 2) * 2
    const fps = 30
    const work = path.join(this.dir, randomUUID().slice(0, 8))
    fs.mkdirSync(work, { recursive: true })
    const e = this.edits.create(name)
    e.settings = { ...e.settings, format, fps, loudness: 'web' }
    const media = {}
    const ops = []
    for (const s of plan.slots) {
      const src = items[s.item]
      let file = src
      if (IMAGE.test(src)) {
        // a picture becomes a short clip with a slow move: cover the frame, then push in, pull out or drift
        file = path.join(work, `${String(s.item).padStart(3, '0')}.mp4`)
        const n = Math.max(2, Math.round((s.seconds + 0.5) * fps))
        const z = { in: `1+0.08*on/${n}`, out: `1.08-0.08*on/${n}`, left: '1.08', right: '1.08' }[s.move]
        const x = { in: 'iw/2-(iw/zoom/2)', out: 'iw/2-(iw/zoom/2)', left: `(iw-iw/zoom)*(1-on/${n})`, right: `(iw-iw/zoom)*on/${n}` }[s.move]
        await this.edits.run(['-y', '-v', 'error', '-loop', '1', '-i', src, '-vf', `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='${x}':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${fps},format=yuv420p`, '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', file])
      }
      const m = await this.edits.addMedia(file, { type: 'reel', from: src })
      media[m.id] = m
      ops.push({ op: 'add_clip', media: m.id, track: 'V1', start: s.at, in: 0, out: Math.min(s.seconds, m.duration || s.seconds) })
    }
    const music = await this.edits.addMedia(song, { type: 'file' })
    media[music.id] = music
    ops.push({ op: 'add_clip', media: music.id, track: 'A1', start: 0, in: 0, out: Math.min(plan.seconds, music.duration), fadeOut: Math.min(1.5, plan.seconds / 4) })
    const r = applyOps({ ...e, media }, ops)
    Object.assign(e, { clips: r.clips, media: r.media, tracks: r.tracks, markers: r.markers })
    this.edits.write(e)
    return { editId: e.id, seconds: plan.seconds, bpm: beat.bpm, strength: beat.strength, beatsPer: plan.beatsPer, used: plan.slots.length, left: items.length - plan.slots.length }
  }
}
