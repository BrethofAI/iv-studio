// Remix a song, offline (no ComfyUI, no ffmpeg): the remix graph, the key guess and tempo on a made-up song,
// and Music.remix on stand-ins (checks, what it reads from the song, what it queues, the song record).
//   node test/music-remix.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkPrompt } from '../src/service/graph.js'
import { estimateKey } from '../src/service/musickey.js'
import { monoDecoder, Music, REMIX, remixGraph } from '../src/service/music.js'
import { findBeats } from '../src/service/reel.js'

let passed = 0
const test = async (name, fn) => {
  await fn()
  passed++
  console.log(`ok - ${name}`)
}

// A made-up song at 11025 Hz: a kick on every beat and triads, I-IV-V-I in the given major key (root 0 = C).
const RATE = 11025
function song({ root = 7, bpm = 120, seconds = 24 } = {}) {
  const n = Math.floor(seconds * RATE)
  const out = new Float32Array(n)
  const beat = 60 / bpm
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)
  const chords = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]].map((c) => c.map((s) => 48 + root + s))
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const bar = Math.floor(t / (beat * 4)) % 4
    let v = 0
    for (const m of chords[bar]) v += 0.15 * Math.sin(2 * Math.PI * hz(m) * t)
    v += 0.12 * Math.sin(2 * Math.PI * hz(36 + root + chords[bar][0] - 48 - root) * t) // the bass on the chord's root
    const sinceBeat = t % beat
    v += 0.6 * Math.exp(-sinceBeat * 40) * Math.sin(2 * Math.PI * 60 * sinceBeat)
    out[i] = v
  }
  return out
}

await test('remix graph: the song is encoded, partly re-noised, and the audio codes stay off', () => {
  const g = remixGraph({ ckpt: 'ace.safetensors', audio: 'iv_studio/remix/a.flac', tags: 'synthwave', seconds: 46, seed: 7, bpm: 92, key: 'C major', timesignature: '4', language: 'en', strength: 0.65, prefix: 'iv_studio/music/x' })
  assert.deepEqual(checkPrompt(g), [])
  assert.equal(g[5].class_type, 'LoadAudio')
  assert.equal(g[5].inputs.audio, 'iv_studio/remix/a.flac')
  assert.deepEqual(g[6].inputs, { audio: ['5', 0], vae: ['1', 2] })
  assert.deepEqual(g[7].inputs.latent_image, ['6', 0])
  assert.equal(g[7].inputs.denoise, 0.65)
  assert.equal(g[3].inputs.generate_audio_codes, false)
  assert.equal(g[3].inputs.lyrics, '[Instrumental]')
  assert.equal(g[3].inputs.duration, 46)
  assert.equal(g[3].inputs.keyscale, 'C major')
  assert.ok(!Object.values(g).some((n) => n.class_type === 'EmptyAceStep1.5LatentAudio'), 'no empty latent: the song is the start')
})

await test('presets: subtle, remix (the default), reimagine, all inside the allowed range', () => {
  assert.deepEqual(REMIX.presets.map((p) => [p.id, p.strength]), [['subtle', 0.5], ['remix', 0.65], ['reimagine', 0.8]])
  assert.equal(REMIX.default, 0.65)
  for (const p of REMIX.presets) assert.ok(p.strength >= REMIX.min && p.strength <= REMIX.max)
})

await test('key guess: a made-up song in G major, and one in E flat major', () => {
  assert.equal(estimateKey(song({ root: 7 }), RATE).key, 'G major')
  assert.equal(estimateKey(song({ root: 3 }), RATE).key, 'D# major')
})

await test('tempo: the beat finder reads 120 BPM off the made-up song', () => {
  const b = findBeats(song({ bpm: 120 }), RATE)
  assert.ok(Math.abs(b.bpm - 120) < 2, `read ${b.bpm}`)
})

await test('monoDecoder turns ffmpeg bytes into samples, whatever their alignment', async () => {
  const f = new Float32Array([0.25, -0.5, 1])
  const odd = Buffer.concat([Buffer.alloc(1), Buffer.from(f.buffer)]).subarray(1)
  const decode = monoDecoder(async (args) => (assert.ok(args.includes('f32le') && args.includes('11025')), odd))
  assert.deepEqual(Array.from(await decode('x.wav', 11025)), [0.25, -0.5, 1])
})

// ---------- Music.remix on stand-ins ----------
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-remix-'))
const src = path.join(dataDir, 'my song.flac')
fs.writeFileSync(src, 'not really audio')
const long = path.join(dataDir, 'long.wav')
fs.writeFileSync(long, 'x')
const lengths = { [src]: 24, [long]: 400 }
const staged = []
const queued = []
const studio = {
  comfy: { remote: false, objectInfo: async () => ({}), systemStats: async () => ({ devices: [] }) },
  stage: async (file, sub) => (staged.push([file, sub]), `${sub}/${path.basename(file)}`),
  createProject: (name) => ({ id: 'p1', name }),
  submitGraph: async (j) => (queued.push(j), { id: `job${queued.length}`, status: 'queued' })
}
let decodes = 0
const music = new Music({ studio, dataDir, probe: async (f) => ({ duration: lengths[f] }), decode: async () => (decodes++, song({ root: 7, bpm: 120 })) })
const ready = { remote: false, engines: [{ id: 'ace', label: 'ACE-Step 1.5 Turbo', ready: true, remixReady: true, missing: [], missingNodes: [], files: { ace15: 'ace_step_1.5_turbo_aio.safetensors' } }] }
music.status = async () => ready

await test('remix refuses: no style, strength out of range, a missing file, a non-sound file, too long', async () => {
  await assert.rejects(music.remix({ source: src }), /Describe the new style/)
  await assert.rejects(music.remix({ source: src, caption: 'x', strength: 0.95 }), /Strength is 0.4 to 0.9/)
  await assert.rejects(music.remix({ source: path.join(dataDir, 'nope.mp3'), caption: 'x' }), /File not found/)
  const txt = path.join(dataDir, 'notes.txt')
  fs.writeFileSync(txt, 'x')
  await assert.rejects(music.remix({ source: txt, caption: 'x' }), /takes a sound file/)
  await assert.rejects(music.remix({ source: long, caption: 'x', bpm: 100, key: 'C major' }), /5 seconds to 5 minutes; this one is 400 s/)
  await assert.rejects(music.remix({ source: src, caption: 'x', key: 'H major' }), /Key must be one of/)
  assert.equal(queued.length, 0)
})

await test('remix without tempo or key reads them from the song and queues the graph', async () => {
  const s = await music.remix({ source: src, caption: 'driving synthwave' })
  assert.equal(decodes, 1)
  assert.deepEqual(staged.at(-1), [src, 'iv_studio/remix'])
  const g = queued.at(-1).graph
  assert.equal(g[7].inputs.denoise, 0.65)
  assert.equal(g[3].inputs.bpm, 120)
  assert.equal(g[3].inputs.keyscale, 'G major')
  assert.equal(g[3].inputs.duration, 24)
  assert.equal(g[3].inputs.tags, 'driving synthwave')
  assert.equal(g[5].inputs.audio, 'iv_studio/remix/my song.flac')
  assert.equal(s.name, 'my song (remix)')
  assert.deepEqual(s.remix, { source: src, sourceName: 'my song', strength: 0.65 })
  assert.equal(s.engine, 'ace')
  assert.equal(s.instrumental, true)
  assert.equal(music.all()[0].id, s.id, 'saved in the song list')
})

await test('given tempo and key are used as they are, without reading the song', async () => {
  const before = decodes
  const s = await music.remix({ source: src, caption: 'lo-fi', strength: 0.8, bpm: 90, key: 'E minor', seed: 5, name: 'Lo-fi take' })
  assert.equal(decodes, before)
  const g = queued.at(-1).graph
  assert.equal(g[3].inputs.bpm, 90)
  assert.equal(g[3].inputs.keyscale, 'E minor')
  assert.equal(g[7].inputs.denoise, 0.8)
  assert.equal(g[7].inputs.seed, 5)
  assert.equal(s.name, 'Lo-fi take')
})

await test('a finished song from the list can be remixed by its id, and keeps its name as the source', async () => {
  const made = path.join(dataDir, 'music', 'mine.flac')
  fs.mkdirSync(path.dirname(made), { recursive: true })
  fs.writeFileSync(made, 'x')
  lengths[made] = 30
  music.saveAll([{ id: 'abc', name: 'Trailer score', status: 'success', file: made }, ...music.all()])
  const s = await music.remix({ songId: 'abc', caption: 'jazz trio', bpm: 100, key: 'C major' })
  assert.equal(s.remix.sourceName, 'Trailer score')
  assert.equal(s.name, 'Trailer score (remix)')
  await assert.rejects(music.remix({ songId: 'zzz', caption: 'x' }), /No song zzz/)
})

await test('analyse reports length, tempo and the guessed key', async () => {
  const a = await music.analyse({ source: src })
  assert.equal(a.duration, 24)
  assert.equal(a.bpm, 120)
  assert.equal(a.key, 'G major')
  assert.equal(a.name, 'my song')
})

await test('remix refuses when this ComfyUI cannot load songs', async () => {
  music.status = async () => ({ ...ready, engines: [{ ...ready.engines[0], remixReady: false }] })
  await assert.rejects(music.remix({ source: src, caption: 'x', bpm: 100, key: 'C major' }), /can't load songs/)
  music.status = async () => ({ ...ready, engines: [{ ...ready.engines[0], ready: false, remixReady: false, missing: [{ label: 'ACE-Step 1.5 Turbo AIO' }] }] })
  await assert.rejects(music.remix({ source: src, caption: 'x', bpm: 100, key: 'C major' }), /needs ACE-Step 1.5 Turbo AIO/)
})

fs.rmSync(dataDir, { recursive: true, force: true })
console.log(`\n${passed} passed`)
