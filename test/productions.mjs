// Projects: a shot's spoken line always reaches its H3 prompt.   node test/productions.mjs
import assert from 'node:assert/strict'
import { asFirstFrame, beatOf, heading, placePrompt, scriptText, sketchPrompt, spokenWords, withLine, withRoom, withSilence, wordMatch } from '../src/service/productions.js'
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
ok('a line keeps only the words said out loud', () => {
  assert.equal(spokenWords('Theo: "It\'s mine," he says, voice tight.'), "It's mine.")
  assert.equal(spokenWords('Tess: “I’m not wasting anything,” she says, and holds out the umbrella.'), 'I’m not wasting anything.')
  assert.equal(spokenWords('"Run!" she shouts. "Now!"'), 'Run! Now!')
  assert.equal(spokenWords('That’s the one.'), 'That’s the one.')
  assert.equal(spokenWords('I said "no" twice.'), 'I said "no" twice.')
  assert.equal(spokenWords('"Go."'), 'Go.')
  assert.equal(spokenWords("Tess (quiet, steady): 'We both got this.'"), 'We both got this.')
  assert.equal(spokenWords("'Tis the season."), "'Tis the season.")
})
ok('a beat with its fields swapped is put right', () => {
  assert.deepEqual(beatOf({ kind: 'line', speaker: 'Tess', delivery: "it's not my fault you're a wet dog.", words: 'Tess (sharper)' }), { kind: 'line', speaker: 'Tess', delivery: '', words: "it's not my fault you're a wet dog." })
  assert.deepEqual(beatOf({ kind: 'line', speaker: 'Theo', delivery: 'flat', words: 'Theo: "It\'s mine," he says.' }), { kind: 'line', speaker: 'Theo', delivery: 'flat', words: "It's mine." })
  assert.deepEqual(beatOf({ kind: 'line', speaker: 'Tess', delivery: '(soft)', words: 'Theo, wait.' }), { kind: 'line', speaker: 'Tess', delivery: 'soft', words: 'Theo, wait.' })
  assert.deepEqual(beatOf({ kind: 'line', speaker: 'Tess', delivery: '', words: '', action: 'She sits.' }), { kind: 'action', action: 'She sits.' })
  assert.deepEqual(beatOf({ kind: 'action', text: 'Rain falls.', who: '', how: '' }), { kind: 'action', action: 'Rain falls.' })
})
ok('a heading keeps one place and one time', () => {
  assert.deepEqual(heading('Bus stop – rainy afternoon', 'AFTERNOON'), { place: 'Bus stop', time: 'DAY' })
  assert.deepEqual(heading('Lighthouse tower', 'NIGHT - NIGHT'), { place: 'Lighthouse tower', time: 'NIGHT' })
  assert.deepEqual(heading('Living room', 'MIDNIGHT'), { place: 'Living room', time: 'NIGHT' })
  assert.deepEqual(heading('Pier', ''), { place: 'Pier', time: 'DAY' })
})
ok('a shot with no line says nobody speaks', () => {
  const q = P.replace('{char} lifts', '{char} (S1) lifts')
  const out = withSilence(q)
  assert.match(out, /She smiles\. Nobody speaks in this shot: no dialogue, only the sounds of the place\.\n\noverall_soundscape:/)
  assert.ok(!out.includes('(S1)'))
  const talk = withLine(P, 'Tess', 'Hi.')
  assert.equal(withSilence(talk), talk)
})
ok('a spoken take is scored by the words heard', () => {
  assert.equal(wordMatch('Nope. Mine.', 'Nope.'), 0.5)
  assert.equal(wordMatch('Then let’s share it.', 'And let\'s share.'), 0.5)
  assert.equal(wordMatch('That’s mine.', "That's mine."), 1)
  assert.equal(wordMatch('You’re not faster than me.', "you're not faster than me."), 1)
  assert.equal(wordMatch('Mine.', 'Mine swept'), 0.5)
})
ok('a sketch prompt names the face, framing and place', () => {
  const t = sketchPrompt({ action: 'Tess lifts a bowl.', camera: 'Medium shot, static.', place: 'Pottery studio', time: 'DAY', description: 'shelves of bowls', look: 'muted earthy colours', faces: ['Tess Marlow'] })
  assert.match(t, /^Cinematic film still, medium shot, static framing\. Tess Marlow is the person in picture 1; keep their face\. Tess lifts a bowl\. Pottery studio, day: shelves of bowls\. Look: muted earthy colours\./)
})
ok('a place is drawn empty, in its time and look', () => {
  const t = placePrompt({ place: 'Living Room', time: 'NIGHT', description: 'a worn grey sofa under a moonlit window', look: 'muted earthy colours' })
  assert.match(t, /^Cinematic film still, wide establishing shot of Living Room, night\. a worn grey sofa under a moonlit window\. Nobody in it/)
  assert.match(t, /Look: muted earthy colours\./)
})
ok('a shot with a room opens on <Picture 1> and stays in <Picture 2>', () => {
  const r = withRoom(asFirstFrame(P), { place: 'Pottery Studio', description: 'shelves of bowls, a skylight.' })
  assert.match(r, /^subject_definitions:\n<Subject 1> is the place shown in <Picture 2>: Pottery Studio, shelves of bowls, a skylight\.\n/)
  assert.match(r, /\[keyframe completion \+ reference generation\]/)
  assert.equal(r.split('<Picture 1> (from [Shot 1]) is fully referenced').length, 2)
  assert.ok(r.endsWith('non_diegetic_music:\nN/A'))
  const two = withRoom(P, { place: 'Bus stop', people: ['Theo'] })
  assert.match(two, /<Subject 2> is Theo, the person shown in <Picture 3>\./)
  assert.match(two, /Theo looks like <Picture 3>\./)
  assert.match(two, /<Subject 2>: attribute_transfer from <Picture 3>/)
})
ok('a shot filmed from its sketch opens on <Picture 1>, once', () => {
  const f = asFirstFrame(P)
  assert.ok(f.startsWith('For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description:'))
  assert.equal(asFirstFrame(f), f)
})
console.log(`${n} checks passed`)
