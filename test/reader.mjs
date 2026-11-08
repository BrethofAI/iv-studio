// The reader: parsers on recorded text and made-up frames, then a read of a generated three-shot video.
//   node test/reader.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-ffprobe-static'
import { bandChanges, cutsFromScores, parseSceneScores, Reader, READER, shotsFrom } from '../src/service/reader.js'
import { Edits } from '../src/service/edits.js'

let n = 0
const ok = async (name, fn) => (await fn(), n++, console.log(`ok  ${name}`))

await ok('parseSceneScores reads the metadata blocks and skips one without a score', () => {
  const text = [
    'frame:0    pts:0       pts_time:0',
    'lavfi.scene_score=0.020000',
    'frame:1    pts:512     pts_time:0.041667',
    'frame:2    pts:1024    pts_time:0.083333',
    'lavfi.scene_score=0.610000',
    ''
  ].join('\n')
  const s = parseSceneScores(text)
  assert.equal(s.length, 2)
  assert.deepEqual(s.map((x) => x.t), [0, 0.083333])
  assert.deepEqual(s.map((x) => x.score), [0.02, 0.61])
})

await ok('cutsFromScores keeps the strongest cut and leaves the ends alone', () => {
  const scores = [{ t: 0.04, score: 0.9 }, { t: 2.0, score: 0.5 }, { t: 2.2, score: 0.7 }, { t: 4.5, score: 0.1 }, { t: 6.9, score: 0.4 }]
  assert.deepEqual(cutsFromScores(scores, { duration: 7 }), [2.2])
})

await ok('shotsFrom tiles the video', () => {
  const s = shotsFrom([2.2, 4], 7)
  assert.deepEqual(s.map((x) => [x.index, x.start, x.end, x.duration]), [[1, 0, 2.2, 2.2], [2, 2.2, 4, 1.8], [3, 4, 7, 3]])
})

await ok('bandChanges finds a caption appearing, and minGap holds the next one back', () => {
  const size = READER.bandWidth * READER.bandHeight
  const frames = Array.from({ length: 12 }, (_, k) => new Uint8Array(size).fill(k < 5 ? 0 : k === 5 ? 200 : 100))
  assert.deepEqual(bandChanges(frames), [1.25])
  assert.deepEqual(bandChanges(frames, { minGap: 0.2 }), [1.25, 1.5])
})

await ok('bandChanges finds a small caption swap over a moving picture, and not the movement', () => {
  // movement changes every byte by 2 each frame (alternating); at frame 8 a caption swap changes 1 byte in 4 by 26
  const size = READER.bandWidth * READER.bandHeight
  const frames = Array.from({ length: 16 }, (_, k) => {
    const f = new Uint8Array(size).fill(k % 2 ? 102 : 100)
    if (k >= 8) for (let i = 0; i < size; i += 4) f[i] += 26
    return f
  })
  assert.deepEqual(bandChanges(frames), [2])
})

// ---------- a real read ----------
const { ffmpegPath, ffprobePath } = ffmpegStatic
if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
  console.log('skip  reading a video (no bundled ffmpeg)')
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-reader-'))
  const edits = new Edits({ dataDir: tmp, ffmpeg: ffmpegPath, ffprobe: ffprobePath })
  const file = path.join(tmp, 'three.mp4')
  // red 2 s, blue 1.5 s, green 2 s with a box in the bottom fifth from 4.5 s; a 1 kHz tone throughout
  await edits.run(['-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=red:s=480x854:d=2:r=24',
    '-f', 'lavfi', '-i', 'color=blue:s=480x854:d=1.5:r=24',
    '-f', 'lavfi', '-i', 'color=0x2f7a3a:s=480x854:d=2:r=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=5.5',
    '-filter_complex', "[2]drawbox=x=40:y=720:w=400:h=90:color=white:t=fill:enable='gte(t,1)'[g];[0][1][g]concat=n=3:v=1:a=0,format=yuv420p[v]",
    '-map', '[v]', '-map', '3', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', file])
  const reader = new Reader({ ffmpeg: ffmpegPath, ffprobe: ffprobePath, run: (a) => edits.run(a), runErr: (a) => edits.runErr(a), beatsOf: async () => ({ bpm: 0, beats: [], strength: 0 }) })
  const dir = path.join(tmp, 'read')
  const r = await reader.read(file, dir)
  await ok('three shots at the cuts', () => {
    assert.equal(r.shots.length, 3, `shots: ${JSON.stringify(r.shots.map((s) => [s.start, s.end]))}`)
    assert.ok(Math.abs(r.shots[1].start - 2) < 0.1, `shot 2 starts at ${r.shots[1].start}`)
    assert.ok(Math.abs(r.shots[2].start - 3.5) < 0.1, `shot 3 starts at ${r.shots[2].start}`)
    assert.ok(Math.abs(r.source.duration - 5.5) < 0.1)
    assert.equal(r.source.width, 480)
    assert.equal(r.source.hasAudio, true)
  })
  await ok('frames and sheets on disk', () => {
    for (const s of r.shots) for (const k of ['first', 'middle', 'last', 'sheet']) assert.ok(fs.existsSync(s[k]), `shot ${s.index} ${k}`)
  })
  await ok('the box shows up as one bottom-band change inside shot 3', () => {
    assert.ok(r.shots[2].bandBottom.some((t) => Math.abs(t - 4.5) <= 0.3), `bottom: ${r.shots[2].bandBottom}`)
    assert.deepEqual(r.shots[0].bandBottom, [])
    assert.deepEqual(r.shots[1].bandBottom, [])
    assert.ok(r.shots.every((s) => s.bandTop.length === 0))
  })
  await ok('sound is measured; speech is left out without the voice engine', () => {
    assert.ok(r.loudness && Number.isFinite(r.loudness.integrated), JSON.stringify(r.loudness))
    assert.ok(Array.isArray(r.silences))
    assert.equal(r.speech, 'not_set_up')
    assert.ok(r.shots.every((s) => s.words === null))
    assert.ok(fs.existsSync(path.join(dir, 'reading.json')))
  })
  fs.rmSync(tmp, { recursive: true, force: true })
}
console.log(`${n} passed`)
