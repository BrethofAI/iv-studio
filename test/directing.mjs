// Matthew Hollis's directing method in IV Studio: the writers' direction rules and JSON shape (prompter.js), the
// storyboard's staging (productions.js) and the take reviewer (review.js).
//   node test/directing.mjs [a video to take frames from]
import assert from 'node:assert/strict'
import ffmpegStatic from 'ffmpeg-ffprobe-static'
import { DIRECTING } from '../src/service/directing.js'
import { sketchPrompt } from '../src/service/productions.js'
import { outputSchema, systemPrompt } from '../src/service/prompter.js'
import { FIX_KINDS, Reviewer, reviewSchema, reviewSystem } from '../src/service/review.js'

let n = 0
const ok = async (name, fn) => {
  await fn()
  n++
  console.log(`ok  ${name}`)
}

await ok('every writer gets the direction rules; Claude Code and Codex get the whole method', () => {
  const short = systemPrompt({ mode: 'text', seconds: 8 })
  const full = systemPrompt({ mode: 'text', seconds: 8, full: true })
  assert.match(short, /DIRECTION \(decide it first/)
  assert.match(short, /screen-left is the viewer's left/)
  assert.match(short, /Don't add dialogue, characters, props, camera moves or places/)
  assert.ok(!short.includes(DIRECTING), 'the local writer stays short')
  assert.ok(full.includes(DIRECTING) && full.includes('Matthew Hollis'), 'the whole method, credited')
  assert.match(short, /at most 2-4 short lines/, 'line counts are a ceiling, not a target')
})
await ok('the direction is decided before the shots, with priorities for references', () => {
  for (const mode of ['text', 'frames', 'reference', 'continue']) {
    const s = outputSchema({ mode, refs: mode === 'reference' ? 1 : 0 })
    assert.equal(Object.keys(s.properties)[0], 'direction', `${mode}: direction comes first`)
    assert.equal(s.required[0], 'direction')
    assert.deepEqual(s.properties.direction.required, mode === 'reference' ? ['purpose', 'staging', 'priorities'] : ['purpose', 'staging'])
  }
})
await ok('sketches stand people where the staging says', () => {
  const p = sketchPrompt({ action: 'Tess slides the plate across.', camera: 'Medium shot', staging: 'Tess screen-left facing right; Theo screen-right.' })
  assert.match(p, /Tess slides the plate across\. Tess screen-left facing right; Theo screen-right\./)
  assert.ok(!/undefined/.test(sketchPrompt({ action: 'x' })))
})
await ok('the review shape and its rules', () => {
  const s = reviewSchema()
  assert.deepEqual(s.required, ['verdict', 'works', 'issues', 'fix', 'revised_prompt'])
  assert.deepEqual(s.properties.fix.properties.kind.enum, FIX_KINDS)
  assert.match(reviewSystem(), /unmet is true when the brief already asked/)
  assert.ok(reviewSystem({ full: true }).includes(DIRECTING))
})
await ok('a review is tidied: bounds, unknown kinds, the stretch, and a revision equal to the brief dropped', () => {
  const r = new Reviewer({ studio: () => null, ffmpeg: ffmpegStatic.ffmpegPath })
  const brief = 'integrated_multimodal_description: [Shot 1] Live-action, Tess waves. The camera holds a static shot.\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: N/A'
  const ctx = { prompt: brief, req: { mode: 'text', seconds: 5 }, character: null }
  const a = r.tidy({ verdict: 'meh', works: ['her coat'], issues: [{ from: -1, to: 2.345, kind: 'hair', what: ' a hand melts ', unmet: 1 }], fix: { kind: 'clean_stretch', why: 'the start is fine', clean_from: 0, clean_to: 3.21 }, revised_prompt: brief }, ctx)
  assert.equal(a.verdict, 'usable_with_fixes')
  assert.deepEqual(a.issues, [{ from: 0, to: 2.3, kind: 'other', what: 'a hand melts', unmet: true }])
  assert.deepEqual([a.fix.kind, a.fix.from, a.fix.to, a.fix.label], ['clean_stretch', 0, 3.2, 'Use the clean stretch'])
  assert.equal(a.revisedPrompt, '', 'only revise_prompt carries a prompt')
  const b = r.tidy({ verdict: 'redo', works: [], issues: [], fix: { kind: 'revise_prompt', why: 'x', clean_from: 0, clean_to: 0 }, revised_prompt: brief }, ctx)
  assert.equal(b.revisedPrompt, '', 'a "revision" that changes nothing is dropped')
  const c = r.tidy({ verdict: 'redo', works: [], issues: [], fix: { kind: 'revise_prompt', why: 'x', clean_from: 0, clean_to: 0 }, revised_prompt: brief.replace('waves', 'says "Hi there."') }, ctx)
  assert.match(c.revisedPrompt, /<d>\[English\] Hi there\.<\/d>/, 'quoted speech goes into the tag')
})
await ok('a problem that came back after a revision is marked, and unheard words are left alone', () => {
  const r = new Reviewer({ studio: () => null, ffmpeg: ffmpegStatic.ffmpegPath })
  const ctx = { prompt: 'x', req: { mode: 'text', seconds: 5 }, character: null }
  const past = [{ id: 'a', revised: true, takes: [{ key: '1', fix: 'revise_prompt', unmet: [{ kind: 'space', what: 'looks at the lens' }] }] }]
  const data = { verdict: 'usable_with_fixes', works: [], issues: [{ from: 0, to: 2, kind: 'space', what: 'still at the lens', unmet: true }, { from: 1, to: 3, kind: 'words', what: "can't confirm the line", unmet: false }], fix: { kind: 'revise_prompt', why: 'x', clean_from: 0, clean_to: 0 }, revised_prompt: '' }
  const a = r.tidy(data, { ...ctx, past })
  assert.equal(a.issues.length, 1, 'no transcript: the words guess is dropped')
  assert.equal(a.issues[0].again, true)
  assert.match(a.repeat, /another rewrite may not move them/)
  const b = r.tidy(data, { ...ctx, past, heard: 'Twenty minutes late again.' })
  assert.equal(b.issues.length, 2, 'heard: words issues stay')
  const c = r.tidy(data, { ...ctx, past: [{ ...past[0], revised: false }] })
  assert.ok(!c.issues[0].again && !c.repeat, 'the same prompt run twice is not a revision')
})
await ok("the history is the shot's earlier reviewed runs, finals included", () => {
  const jobs = {
    a: { id: 'a', kind: 'previews', createdAt: '1', plan: { request: { prompt: 'old' } }, reviews: { 1: { fix: { kind: 'revise_prompt' }, issues: [{ kind: 'space', unmet: true, what: 'lens' }] } } },
    f: { id: 'f', kind: 'finish', parent: 'a', createdAt: '2', reviews: { final: { fix: { kind: 'edit' }, issues: [{ kind: 'emotion', unmet: true, what: 'gasp' }] } } },
    b: { id: 'b', kind: 'previews', createdAt: '3', projectId: 'p', plan: { asked: { prompt: 'new' } } },
    c: { id: 'c', kind: 'previews', createdAt: '4', reviews: { 1: { fix: { kind: 'none' }, issues: [] } } }
  }
  const studio = { getProject: () => ({ jobs: ['a', 'f', 'b', 'c'] }), getJob: (id) => jobs[id] }
  const h = new Reviewer({ studio: () => studio, ffmpeg: ffmpegStatic.ffmpegPath }).history(jobs.b)
  assert.equal(h.length, 1, 'only earlier runs')
  assert.equal(h[0].revised, true)
  assert.deepEqual(h[0].takes.map((x) => [x.key, x.unmet[0].kind]), [['1', 'space'], ['final', 'emotion']])
})
const clip = process.argv[2]
if (clip)
  await ok('six frames from a real take, spread over its length', async () => {
    const f = await new Reviewer({ studio: () => null, ffmpeg: ffmpegStatic.ffmpegPath }).frames(clip)
    assert.equal(f.shots.length, 6)
    assert.ok(f.duration > 1 && f.shots[0].at < f.shots[5].at && f.shots[5].at < f.duration)
    assert.ok(Buffer.from(f.shots[0].data, 'base64').subarray(0, 2).equals(Buffer.from([0xff, 0xd8])), 'JPEG')
  })
console.log(`${n} checks passed`)
