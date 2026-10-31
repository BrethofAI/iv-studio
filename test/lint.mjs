// The prompt checker (src/service/lint.js): each rule on a prompt that breaks it, and a clean prompt that passes.
//   node test/lint.mjs
import assert from 'node:assert/strict'
import { blocking, firstLastLine, FIRST_FRAME_LINE, lintPrompt, sections } from '../src/service/lint.js'

let n = 0
const ok = (name, fn) => {
  fn()
  n++
  console.log(`ok  ${name}`)
}
const codes = (p, ctx) => lintPrompt(p, ctx).map((f) => f.code)
const CLEAN = `integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium shot of {char} in a green raincoat at a bus stop at night. The camera pushes in with small amplitude at slow speed. {char} (S1) looks up and says: <d>[English] Bus is late again.</d> [Shot 2] At 00:04.000, the camera cuts to a wide shot as the bus arrives.

overall_soundscape: Rain on the shelter roof and distant traffic.

non_diegetic_music: N/A`
const tess = { name: 'Tess Marlow', trigger: 't3ss4' }

ok('a clean prompt has no warnings or errors', () => {
  const f = lintPrompt(CLEAN, { mode: 'text', seconds: 8, character: tess })
  assert.deepEqual(f.filter((x) => x.level !== 'info'), [], JSON.stringify(f))
})
ok('sections are read whether they sit on one line or the next', () => {
  const s = sections('subject_definitions:\n<Subject 1> is a cat.\n\ndetailed_description: [Shot 1] A cat.')
  assert.equal(s.subject_definitions, '<Subject 1> is a cat.')
  assert.equal(s.detailed_description, '[Shot 1] A cat.')
})
ok('length: the real length on the frame grid, and under the trained floor', () => {
  assert.match(lintPrompt(CLEAN, { seconds: 10 }).find((f) => f.code === 'real-length').message, /10\.13 s \(243 frames/)
  assert.ok(codes(CLEAN, { seconds: 4 }).includes('too-short'))
})
ok('fields: missing description, missing soundscape, template blanks', () => {
  assert.ok(codes('[Shot 1] A cat.', { mode: 'text' }).includes('missing-field'))
  assert.ok(codes(CLEAN.replace(/overall_soundscape:[^\n]*\n\n/, ''), {}).includes('no-soundscape'))
  assert.ok(blocking(lintPrompt(CLEAN.replace('green raincoat', '___'), {})).some((f) => f.code === 'placeholder'))
})
ok('frames: a last frame needs the first-and-last line, and the fix adds it', () => {
  const pics = [{ kind: 'picture' }, { kind: 'picture' }]
  const f = lintPrompt(`${FIRST_FRAME_LINE}\n\n${CLEAN}`, { mode: 'frames', seconds: 5, media: pics }).find((x) => x.code === 'frames-line')
  assert.equal(f.level, 'error')
  assert.ok(f.fix.startsWith(firstLastLine(5, 2)) && !f.fix.includes(FIRST_FRAME_LINE))
  assert.ok(!codes(`${FIRST_FRAME_LINE}\n\n${CLEAN}`, { mode: 'frames', seconds: 8, media: pics.slice(0, 1) }).includes('frames-line'))
  assert.ok(codes(`${firstLastLine(8, 2)}\n\n${CLEAN}`, { mode: 'frames', seconds: 8, media: pics }).includes('frames-cut'))
})
ok('cuts: out of order, past the end, too short', () => {
  assert.ok(codes(CLEAN.replace('00:04.000', '00:09.800'), { seconds: 8 }).includes('cut-late'))
  const two = CLEAN.replace('as the bus arrives.', 'as the bus arrives. [Shot 3] At 00:03.000, the doors open.')
  assert.ok(codes(two, { seconds: 8 }).includes('cut-order'))
  assert.ok(codes(CLEAN.replace('00:04.000', '00:00.800'), { seconds: 8 }).includes('cut-short'))
})
ok('speech: too many words for the time, quotes and names inside <d>, a missing speaker ID', () => {
  const long = CLEAN.replace('Bus is late again.', 'Bus is late again and I have been standing here in the rain for twenty minutes waiting for it to come round the corner.')
  assert.ok(codes(long, { seconds: 5 }).includes('speech-too-long'))
  const quoted = CLEAN.replace('<d>[English] Bus is late again.</d>', '<d>[English] "Bus is late again."</d>')
  const q = lintPrompt(quoted, { seconds: 8 }).find((f) => f.code === 'quoted-line')
  assert.ok(q && q.fix.includes('<d>[English] Bus is late again.</d>'))
  assert.ok(codes(CLEAN.replace('<d>[English] Bus', '<d>[English] Tess: Bus'), { seconds: 8 }).includes('name-in-line'))
  assert.ok(codes(CLEAN.replace(' (S1)', ''), { seconds: 8 }).includes('no-speaker'))
  assert.ok(codes(CLEAN.replace('<d>[English] Bus is late again.</d>', '"Bus is late again."'), { seconds: 8 }).includes('untagged-speech'))
  assert.ok(codes(CLEAN.replace(/<d>[\s\S]*?<\/d>/, 'nothing.'), { seconds: 8, voiceLine: 'x.wav' }).includes('voice-no-words'))
})
ok('references: named but not attached, attached but not named, subjects', () => {
  const ref = `subject_definitions:\n<Subject 1> is the woman in <Picture 1>.\n<Subject 2> is the kitchen in <Picture 3>.\n\ndetailed_description:\n[Shot 1] <Subject 1> (S1) bakes and says: <d>[English] Salt.</d>\n\noverall_soundscape:\nKitchen hum.\n\nnon_diegetic_music:\nN/A`
  const c = codes(ref, { mode: 'reference', seconds: 8, media: [{ kind: 'picture' }, { kind: 'picture' }] })
  assert.ok(c.includes('reference-missing') && c.includes('reference-unused') && c.includes('subject-unused'))
  assert.ok(codes(ref.replace('<Subject 1> (S1)', '<Subject 4> (S1)'), { mode: 'reference', seconds: 8 }).includes('subject-undefined'))
})
ok('the character: missing {char}, and describing the face the LoRA carries', () => {
  assert.ok(codes(CLEAN.replaceAll('{char}', 'a woman'), { seconds: 8, character: tess }).includes('char-missing'))
  assert.ok(codes(CLEAN.replace('{char} in a green raincoat', '{char} with long red hair in a green raincoat'), { seconds: 8, character: tess }).includes('char-face'))
  assert.ok(!codes(CLEAN, { seconds: 8 }).includes('char-missing'), 'no character, no check')
})
ok('wording: filler words (with a fix), too many camera moves', () => {
  const f = lintPrompt(CLEAN.replace('Live-action, cinematic,', 'Live-action, masterpiece, 8k, cinematic,'), { seconds: 8 }).find((x) => x.code === 'filler')
  assert.ok(f && !/masterpiece|8k/.test(f.fix))
  assert.ok(codes(CLEAN.replace('The camera pushes in', 'The camera pans left, tilts up, zooms in and pushes in'), { seconds: 8 }).includes('camera-load'))
})
ok('mentions: an unknown @name is an error', () => {
  assert.ok(codes(CLEAN.replace('{char} in a green', '@Mara in a green'), { seconds: 8, mentions: ['Tess', 'BusStop'] }).includes('mention-unknown'))
  assert.ok(!codes(CLEAN.replace('{char} in a green', '@tess in a green'), { seconds: 8, mentions: ['Tess'] }).includes('mention-unknown'))
})
console.log(`${n} checks passed`)
