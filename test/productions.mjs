// Projects: a shot's spoken line always reaches its H3 prompt.   node test/productions.mjs
import assert from 'node:assert/strict'
import { asFirstFrame, scriptText, sketchPrompt, withLine } from '../src/service/productions.js'
import { parseScript } from '../src/service/screenplay.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
const P = 'integrated_multimodal_description:\n[Shot 1] Medium static shot: {char} lifts a bowl. She smiles.\n\noverall_soundscape:\nRain taps.\n\nnon_diegetic_music:\nN/A'

ok('a missing line goes at the end of the shot paragraph', () => {
  const out = withLine(P, '{char}', "That's the one.")
  assert.match(out, /She smiles\. \{char\} says: <d>\[English\] That's the one\.<\/d>\n\noverall_soundscape:/)
})
ok('a line already tagged is left alone', () => {
  const q = P.replace('She smiles.', 'She says: <d>[English] That’s the one!</d>')
  assert.equal(withLine(q, '{char}', "That's the one."), q)
})
ok('no line, no change', () => assert.equal(withLine(P, 'Tess', ''), P))
ok('quotes around the words are dropped', () => assert.match(withLine(P, 'Tess', '"Go."'), /<d>\[English\] Go\.<\/d>/))
ok('a prompt without sections still gets the line', () => assert.equal(withLine('[Shot 1] A bowl.', 'Tess', 'Hi.'), '[Shot 1] A bowl. Tess says: <d>[English] Hi.</d>'))
ok('a written script reads back as scenes, cues and lines', () => {
  const text = scriptText({ title: 'Clay', scenes: [{ place: 'Pottery studio', time: 'day', inside: true, beats: [{ kind: 'action', text: 'Tess lifts a bowl.', who: '', how: '' }, { kind: 'line', text: '"That’s the one."', who: 'Tess', how: 'to herself' }] }, { place: 'Street', time: 'NIGHT', inside: false, beats: [{ kind: 'line', text: 'Run!', who: 'Theo', how: '' }] }] })
  const s = parseScript(text)
  assert.equal(s.title, 'Clay')
  assert.deepEqual(s.scenes.map((x) => x.heading), ['INT. POTTERY STUDIO - DAY', 'EXT. STREET - NIGHT'])
  assert.deepEqual(s.scenes[0].elements[1], { type: 'dialogue', who: 'Tess', paren: 'to herself', text: 'That’s the one.' })
  assert.deepEqual(s.speakers.sort(), ['Tess', 'Theo'])
})
ok('a sketch prompt names the face, framing and place', () => {
  const t = sketchPrompt({ action: 'Tess lifts a bowl.', camera: 'Medium shot, static.', place: 'Pottery studio', time: 'DAY', description: 'shelves of bowls', look: 'muted earthy colours', faces: ['Tess Marlow'] })
  assert.match(t, /^Cinematic film still, medium shot, static framing\. Tess Marlow is the person in picture 1; keep their face\. Tess lifts a bowl\. Pottery studio, day: shelves of bowls\. Look: muted earthy colours\./)
})
ok('a shot filmed from its sketch opens on <Picture 1>, once', () => {
  const f = asFirstFrame(P)
  assert.ok(f.startsWith('For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description:'))
  assert.equal(asFirstFrame(f), f)
})
console.log(`${n} checks passed`)
