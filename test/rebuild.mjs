// Rebuild: the planning rules, then the Rebuilds service on fakes (no GPU, no ffmpeg).   node test/rebuild.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { alignmentLine, captionsToTitles, defaultRoute, formatFor, h3Length, NO_TEXT, Rebuilds, retime, segmentFilter, validatePlan } from '../src/service/rebuild.js'

let n = 0
const ok = async (name, fn) => (await fn(), n++, console.log(`ok  ${name}`))
const throwsLike = async (fn, re) => {
  try {
    await fn()
  } catch (err) {
    assert.match(err.message, re)
    return
  }
  assert.fail(`expected an error matching ${re}`)
}

// ---------- rules ----------
await ok('h3Length: short shots render 5.17 s from the first frame and are trimmed back', () => {
  const a = h3Length(2.667)
  assert.equal(a.frames, 124)
  assert.equal(a.short, true)
  assert.equal(a.useLast, false)
  assert.equal(a.trimTo, 2.667)
  assert.equal(a.seconds, 5.167)
  assert.equal(h3Length(4.1).short, true)
})
await ok('h3Length: longer shots get both frames, sized for at most a 1.25x slow-down', () => {
  const b = h3Length(4.2)
  assert.deepEqual([b.frames, b.short, b.useLast, b.trimTo], [124, false, true, null])
  assert.equal(h3Length(8).frames, 158)
  const c = h3Length(15)
  assert.deepEqual([c.frames, c.tooLong], [294, false])
  assert.equal(h3Length(20).tooLong, true)
})
await ok('alignmentLine is MiniMax\'s exact wording', () => {
  assert.equal(alignmentLine({ useLast: true, seconds: 5.167 }), 'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 5.17-second mark of the target video.')
  assert.equal(alignmentLine({ useLast: false, seconds: 5.167 }), 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.')
})
await ok('routes default by kind; unsure stays original', () => {
  assert.equal(defaultRoute('ai_video'), 'h3')
  assert.equal(defaultRoute('still'), 'still')
  assert.equal(defaultRoute('live'), 'keep')
  assert.equal(defaultRoute('unsure'), 'keep')
})
await ok('retime speeds a take into its slot, within limits', () => {
  assert.equal(retime(5.167, 2.667).speed, 1.937)
  assert.equal(retime(2, 4).speed, 0.8)
})
await ok('captionsToTitles places captions on the timeline', () => {
  const t = captionsToTitles([{ start: 13.458, duration: 2, reading: { captions: [{ text: 'A', from: 0.5, to: 0.6, where: 'middle' }] } }])
  assert.equal(t.length, 1)
  assert.equal(t[0].op, 'add_title')
  assert.equal(t[0].content, 'A')
  assert.equal(t[0].start, 13.958)
  assert.equal(t[0].duration, 0.3)
  assert.equal(t[0].position, 'center')
  assert.equal(t[0].box, true)
  assert.equal(t[0].size, 5)
})
await ok('formatFor picks the edit format nearest the video', () => {
  assert.equal(formatFor(480, 854), 'vertical')
  assert.equal(formatFor(1920, 1080), '1080p')
  assert.equal(formatFor(1000, 1000), 'square')
})
await ok('segmentFilter trims, retimes, fits and holds to the slot', () => {
  const a = segmentFilter({ trimTo: 2.667, speed: 1, slot: 2.667, width: 1080, height: 1920 })
  assert.match(a, /^trim=duration=2\.667,setpts=\(PTS-STARTPTS\)\/1\.000,/)
  assert.match(a, /scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920/)
  assert.match(a, /tpad=stop_mode=clone:stop_duration=2\.667,trim=duration=2\.667/)
  const b = segmentFilter({ speed: 1.937, slot: 2.667, width: 1080, height: 1920 })
  assert.match(b, /^setpts=\(PTS-STARTPTS\)\/1\.937,/)
  assert.doesNotMatch(b, /^trim=duration=2\.667,setpts/)
})

await ok('titles in Chinese or Korean are drawn with a font that has the characters', async () => {
  const { titleFont } = await import('../src/service/edits.js')
  const has = (f) => ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/malgun.ttf'].includes(f)
  assert.equal(titleFont('Hello, world', 'barlow.ttf', has), 'barlow.ttf')
  assert.equal(titleFont('一个会看图的大模型', 'barlow.ttf', has), 'C:/Windows/Fonts/msyh.ttc')
  assert.equal(titleFont('안녕하세요', 'barlow.ttf', has), 'C:/Windows/Fonts/malgun.ttf')
  assert.equal(titleFont('一个', 'barlow.ttf', () => false), 'barlow.ttf')
})

// a two-shot rebuild for the plan checks: 2.667 s and 8 s
const two = { swap: null, shots: [{ index: 1, start: 0, end: 2.667, duration: 2.667 }, { index: 2, start: 2.667, end: 10.667, duration: 8 }] }
const prompt = (d, body = 'A woman in a library lifts her mug.') => `${alignmentLine(h3Length(d))}\n\nintegrated_multimodal_description: [Shot 1] ${body} ${NO_TEXT}\n\noverall_soundscape: Room tone.\n\nnon_diegetic_music: N/A`
const noLint = () => []
const opts = { lint: noLint, exists: (f) => f === 'mine.mp4' }
await ok('validatePlan: every shot needs a route', () => throwsLike(() => validatePlan(two, { shots: [{ index: 1, route: 'keep' }] }, opts), /Shot 2/))
await ok('validatePlan: an H3 prompt opens with the alignment line', () => throwsLike(() => validatePlan(two, { shots: [{ index: 1, route: 'h3', prompt: `A woman. ${NO_TEXT}` }, { index: 2, route: 'keep' }] }, opts), /Shot 1.*(opening|line)/i))
await ok('validatePlan: an H3 prompt says there is no writing', () => throwsLike(() => validatePlan(two, { shots: [{ index: 1, route: 'h3', prompt: prompt(2.667).replace(NO_TEXT, '') }, { index: 2, route: 'keep' }] }, opts), /Shot 1.*no writing/i))
await ok('validatePlan: your own clip must exist', () => throwsLike(() => validatePlan(two, { shots: [{ index: 1, route: 'own', file: 'gone.mp4' }, { index: 2, route: 'keep' }] }, opts), /Shot 1/))
await ok('validatePlan: a shot too long for one take is refused', () => {
  const long = { swap: null, shots: [{ index: 1, start: 0, end: 20, duration: 20 }] }
  return throwsLike(() => validatePlan(long, { shots: [{ index: 1, route: 'h3', prompt: prompt(20) }] }, opts), /Shot 1 is too long.*split it/)
})
await ok('validatePlan: lint errors stop the plan', () => throwsLike(() => validatePlan(two, { shots: [{ index: 1, route: 'h3', prompt: prompt(2.667) }, { index: 2, route: 'keep' }] }, { ...opts, lint: () => [{ level: 'error', message: 'bad tag' }] }), /Shot 1.*bad tag/))
await ok('validatePlan: a good plan comes back whole', () => {
  const p = validatePlan(two, { shots: [{ index: 1, route: 'h3', prompt: prompt(2.667) }, { index: 2, route: 'own', file: 'mine.mp4' }] }, opts)
  assert.equal(p.shots.length, 2)
  assert.equal(p.shots[0].h3.frames, 124)
  assert.equal(p.shots[0].character, 'none')
  assert.equal(p.shots[1].file, 'mine.mp4')
})

// ---------- the service, on fakes ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-rebuild-'))
const src = path.join(tmp, 'clip.mp4')
fs.writeFileSync(src, 'not really a video')
const pic = (name) => {
  const f = path.join(tmp, name)
  fs.writeFileSync(f, name)
  return f
}
const fakeReader = {
  read: async (file, dir) => {
    fs.mkdirSync(dir, { recursive: true })
    const shot = (index, start, end) => ({ index, start, end, duration: +(end - start).toFixed(3), first: pic(`s${index}_first.jpg`), middle: pic(`s${index}_middle.jpg`), last: pic(`s${index}_last.jpg`), sheet: pic(`s${index}.jpg`), bandTop: [], bandBottom: [], words: null })
    return { source: { file, width: 480, height: 854, fps: 24, duration: 10.667, hasAudio: true }, shots: [shot(1, 0, 2.667), shot(2, 2.667, 10.667)], music: null, loudness: null, silences: [], speech: 'not_set_up' }
  }
}
const edited = []
const calls = { previews: [], finishes: [] }
const fakes = {
  images: { create: async (req) => (edited.push(req), { id: `set${edited.length}` }) },
  remake: { painter: async () => ({ family: 'flux3', model: 'flux3.safetensors' }), waitPictures: async () => pic(`painted${edited.length}.png`) },
  studio: {
    generatePreviews: async (req) => (calls.previews.push(req), { id: `p${calls.previews.length}`, status: 'queued' }),
    refreshJob: async (id) => (id.startsWith('p') ? { id, status: 'success', outputs: [1, 2].map((c) => ({ kind: 'preview', candidate: c, path: pic(`${id}_${c}.mp4`) })) } : { id, status: 'success', outputs: [{ kind: 'final', path: pic(`${id}_final.mp4`) }] }),
    finishCandidate: async (req) => (calls.finishes.push(req), { id: `f${calls.finishes.length}` }),
    localCopy: async (f) => (typeof f === 'string' ? f : f.path)
  }
}
const rebuilds = new Rebuilds({ dataDir: tmp, reader: fakeReader, edits: null, writer: () => ({ engine: 'local', model: 'x' }), lint: noLint, ...fakes })
let id
await ok('read refuses without the rights confirmation', () => throwsLike(() => rebuilds.read({ file: src }), /^Rebuild is for video you made or have the right to rework\. Confirm that \(rights: true\) to go on\.$/))
await ok('read with rights keeps when it was confirmed', async () => {
  const r = await rebuilds.read({ file: src, name: 'Test', rights: true })
  id = r.id
  assert.ok(r.rightsConfirmedAt)
  assert.equal(r.shots.length, 2)
  assert.equal(r.status, 'reading')
  assert.ok(fs.existsSync(path.join(tmp, 'rebuild', id, 'source.mp4')))
})
await ok('saving every shot\'s reading moves it to planning', () => {
  const r = rebuilds.saveReading(id, [
    { index: 1, kind: 'ai_video', why: 'smooth', description: 'A woman', captions: [{ text: 'Hi', from: 0.2, to: 1, where: 'bottom' }] },
    { index: 2, kind: 'ai_video', why: 'smooth', description: 'A room', captions: [] }
  ])
  assert.equal(r.status, 'planning')
  assert.equal(r.shots[0].reading.kind, 'ai_video')
})
await ok('a plan must be written before it is approved, and saving it again resets the OK', () => {
  assert.throws(() => rebuilds.approvePlan(id), /^Error: Write the plan first\.$/)
  rebuilds.savePlan(id, { shots: [{ index: 1, route: 'h3', prompt: prompt(2.667) }, { index: 2, route: 'h3', prompt: prompt(8) }] })
  assert.ok(rebuilds.approvePlan(id).planApprovedAt)
  assert.equal(rebuilds.savePlan(id, { shots: [{ index: 1, route: 'h3', prompt: prompt(2.667) }, { index: 2, route: 'h3', prompt: prompt(8) }] }).planApprovedAt, null)
})
await ok('frames wait for the plan\'s OK; shots wait for the frames\' OK', async () => {
  await throwsLike(() => rebuilds.makeFrames(id), /plan needs the person's OK/)
  rebuilds.approvePlan(id)
  await throwsLike(() => rebuilds.makeShots(id), /frames need the person's OK/)
})
await ok('frames: a short shot with a caption gets one cleaned frame; a clean shot is left alone', async () => {
  const r = await rebuilds.makeFrames(id)
  // shot 1 is short (first frame only) and has a caption: one edit. Shot 2 has no captions and no swap: none.
  assert.equal(edited.length, 1)
  assert.equal(edited[0].mode, 'edit')
  assert.match(edited[0].prompt, /Remove every caption/)
  assert.equal(r.frames[1].edited, true)
  assert.equal(r.frames[1].last, null)
  assert.equal(r.frames[2].edited, false)
  assert.ok(r.frames[2].first && r.frames[2].last)
  assert.equal(r.framesApprovedAt, null)
})
await ok('frames with a swap: both ends edited with the same seed', async () => {
  rebuilds.savePlan(id, { swap: { ask: 'Make her a man in a grey suit.' }, shots: [{ index: 1, route: 'keep' }, { index: 2, route: 'h3', prompt: prompt(8) }] })
  rebuilds.approvePlan(id)
  edited.length = 0
  await rebuilds.makeFrames(id)
  assert.equal(edited.length, 2)
  assert.equal(edited[0].seed, edited[1].seed)
  assert.match(edited[0].prompt, /Then: Make her a man in a grey suit\./)
  assert.deepEqual(edited.map((e) => e.name), ['Rebuild · shot 2 first', 'Rebuild · shot 2 last'])
})
await ok('shots render after the frames\' OK, and a picked take is finished and copied in', async () => {
  rebuilds.approveFrames(id)
  let r = await rebuilds.makeShots(id)
  assert.equal(r.status, 'rendering')
  assert.equal(calls.previews.length, 1)
  assert.equal(calls.previews[0].mode, 'frames')
  assert.equal(calls.previews[0].media.length, 2)
  assert.equal(calls.previews[0].previews, 3, 'a swap gets three previews')
  assert.equal(calls.previews[0].seconds, h3Length(8).seconds)
  r = await rebuilds.refresh(id)
  assert.equal(r.takes[2].status, 'pick')
  rebuilds.pick(id, 2, 2)
  await rebuilds.refresh(id)
  assert.equal(calls.finishes[0].candidate, 2)
  assert.equal(calls.finishes[0].megapixels, 1)
  r = await rebuilds.refresh(id)
  assert.ok(r.takes[2].final && fs.existsSync(r.takes[2].final))
  assert.equal(r.status, 'ready')
})
await ok('list shows it; remove deletes it', () => {
  assert.equal(rebuilds.list()[0].id, id)
  rebuilds.remove(id)
  assert.equal(rebuilds.list().length, 0)
})
fs.rmSync(tmp, { recursive: true, force: true })

// ---------- the first cut's pieces, with the real ffmpeg ----------
const { ffmpegPath, ffprobePath } = (await import('ffmpeg-ffprobe-static')).default
if (!fs.existsSync(ffmpegPath)) console.log('skip  the first cut with ffmpeg (no bundled ffmpeg)')
else {
  const { Edits } = await import('../src/service/edits.js')
  const { Reader } = await import('../src/service/reader.js')
  const { probe } = await import('../src/service/media.js')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-rebuild-cut-'))
  const edits = new Edits({ dataDir: dir, ffmpeg: ffmpegPath, ffprobe: ffprobePath })
  const make = (file, lavfi, seconds) => edits.run(['-y', '-v', 'error', '-f', 'lavfi', '-i', `${lavfi}=s=480x854:r=24:d=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`, '-map', '0', '-map', '1', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file])
  const video = path.join(dir, 'three.mp4')
  await edits.run(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=480x854:d=2:r=24', '-f', 'lavfi', '-i', 'color=blue:s=480x854:d=1.5:r=24', '-f', 'lavfi', '-i', 'color=0x2f7a3a:s=480x854:d=2:r=24', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=5.5', '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0,format=yuv420p[v]', '-map', '[v]', '-map', '3', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', video])
  const take = path.join(dir, 'take.mp4') // an H3 take of 124 frames
  await make(take, 'testsrc2', 5.167)
  const mine = path.join(dir, 'mine.mp4') // the person's own 3 s clip for a 2 s slot
  await make(mine, 'testsrc', 3)
  const reader = new Reader({ ffmpeg: ffmpegPath, ffprobe: ffprobePath, run: (a) => edits.run(a), runErr: (a) => edits.runErr(a), beatsOf: async () => ({ bpm: 0, beats: [], strength: 0 }) })
  const rb = new Rebuilds({ dataDir: dir, reader, edits, writer: () => ({ engine: 'local' }), lint: noLint })
  let r = await rb.read({ file: video, rights: true })
  const cap = (text) => [{ text, from: 0.2, to: 1, where: 'bottom' }]
  rb.saveReading(r.id, [{ index: 1, kind: 'still', captions: cap('ONE') }, { index: 2, kind: 'ai_video', captions: cap('TWO') }, { index: 3, kind: 'live', captions: cap('THREE') }])
  rb.savePlan(r.id, { shots: [{ index: 1, route: 'still' }, { index: 2, route: 'h3', prompt: prompt(1.5) }, { index: 3, route: 'own', file: mine }] })
  rb.approvePlan(r.id)
  r = rb.get(r.id)
  r.takes[2] = { previewJob: 'p', status: 'done', previews: [], candidate: 1, finishJob: 'f', final: take, error: null }
  rb.write(r)
  const cut = await rb.firstCut(r.id)
  await ok('the first cut makes a still, a trimmed H3 take and a sped-up own clip, each its slot long', async () => {
    assert.deepEqual(cut.placed, [1, 2, 3])
    assert.deepEqual([cut.kept, cut.missing], [[], []])
    for (const [k, slot] of [[1, 2], [2, 1.5], [3, 2]]) {
      const info = await probe(ffprobePath, path.join(dir, 'rebuild', r.id, 'cut', `shot_00${k}.mp4`))
      assert.ok(Math.abs(info.duration - slot) <= 0.05, `shot ${k}: ${info.duration} s for a ${slot} s slot`)
      assert.deepEqual([info.width, info.height], [1080, 1920])
    }
    const e = edits.get(cut.editId)
    const v1 = e.clips.filter((c) => c.track === 'V1').sort((a, b) => a.start - b.start)
    assert.deepEqual(v1.map((c) => c.start), [0, 2, 3.5])
    assert.ok(Math.abs(v1[2].start + v1[2].out - 5.5) <= 0.05)
    // titles only over the new, clean pictures (the H3 take and the own clip), not the still from the original
    assert.deepEqual(e.clips.filter((c) => c.track === 'T1').map((c) => [c.text.content, c.start]), [['TWO', 2.2], ['THREE', 3.7]])
  })
  fs.rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} passed`)
