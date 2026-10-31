// Projects: a shot's spoken line always reaches its H3 prompt.   node test/productions.mjs
import assert from 'node:assert/strict'
import { shotName } from '../src/service/studio.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Productions, asFirstFrame, beatOf, heading, placePrompt, scriptText, sketchPrompt, spokenWords, withLine, withRoom, withSilence, wordMatch } from '../src/service/productions.js'
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
  assert.match(r, /^subject_definitions:\n<Picture 1> is the first frame of \[Shot 1\], the storyboard sketch of this shot\.\n<Subject 1> is the place in <Picture 2>: Pottery Studio, shelves of bowls, a skylight\.\n/)
  assert.match(r, /\n\nsummary:\n\[keyframe completion \+ reference generation\] /)
  assert.match(r, /\n<Picture 1> \(\[Shot 1\] first frame\): fully_preserved - /)
  assert.match(r, /\n<Subject 1> \(appears in \[Shot 1\]\): fully_preserved - /)
  assert.ok(!r.includes('is fully referenced') && !r.includes('integrated_multimodal_description'))
  assert.match(r, /\n\ndetailed_description:\nThe shot begins from <Picture 1>[^\n]*\n\[Shot 1\] Medium static shot: \{char\} lifts a bowl\. She smiles\.\n\noverall_soundscape:\nRain taps\.\n\nnon_diegetic_music:\nN\/A$/)
  // the writer's one-line layout: two shots on one line each get their own line
  const inline = withRoom('integrated_multimodal_description: [Shot 1] A. [Shot 2] At 00:03.000, B.\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: N/A', { place: 'Bus stop', people: ['Theo'] })
  assert.match(inline, /\n\[Shot 1\] A\.\n\[Shot 2\] At 00:03\.000, B\.\n\noverall_soundscape:\nWind\./)
  assert.match(inline, /<Subject 2> is Theo, the person in <Picture 3>\./)
  assert.match(inline, /Theo is <Subject 2>\./)
  assert.match(inline, /<Subject 2> \(appears in \[Shot 1\], \[Shot 2\]\): fully_preserved - Theo's face/)
})
ok('a shot filmed from its sketch opens on <Picture 1>, once', () => {
  const f = asFirstFrame(P)
  assert.ok(f.startsWith('For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description:'))
  assert.equal(asFirstFrame(f), f)
})
ok('a moving staged shot: its previs is <Video 1>, with or without a sketch and a room', () => {
  const stage = { people: [{ name: 'Tess', x: -1, y: 1, facing: 90 }, { name: 'Theo', x: 1, y: 1, facing: -90 }], camera: { x: 0, y: -3, facing: 0, lens: 'normal', move: 'arc-left', height: 'eye' } }
  const all = withRoom(asFirstFrame(P), { place: 'Pottery Studio', people: ['Theo'], previs: stage })
  assert.match(all, /<Subject 2> is Theo, the person in <Picture 3>\./)
  assert.match(all, /Its camera move and blocking follow <Video 1>\./)
  assert.match(all, /\n<Video 1> \(camera movement and blocking\): partially_preserved - /)
  assert.match(all, /detailed_description:\nThe shot begins from <Picture 1> and takes place in <Subject 1>, the place in <Picture 2>, throughout\.\n<Video 1> is a grey previs/)
  const bare = withRoom(P, { people: ['Theo'], sketch: false, room: false, previs: stage })
  assert.ok(!/<Picture 2>|<Subject 2>|place in/.test(bare), 'no sketch and no room: Theo is <Subject 1>, <Picture 1>')
  assert.match(bare, /<Subject 1> is Theo, the person in <Picture 1>\./)
  assert.match(bare, /^subject_definitions:\n<Subject 1> is Theo/)
  assert.match(bare, /\[reference generation\] The target video is one shot\. Theo is <Subject 1>\. Its camera move/)
  assert.match(bare, /detailed_description:\n<Video 1> is a grey previs/)
  const sketchOnly = withRoom(asFirstFrame(P), { room: false, previs: stage })
  assert.match(sketchOnly, /detailed_description:\nThe shot begins from <Picture 1>\.\n<Video 1>/)
})
ok('a new shot is named from its first shot, not its field names', () => {
  const ref = ['subject_definitions:', '<Subject 1> is {char} (S1).', '', 'retention_analysis:', '<Subject 1> (appears in [Shot 1]): fully_preserved - x', '', 'detailed_description:', '[Shot 1] Live-action, cinematic. Full shot of {char} (S1) on a rooftop at dusk with water towers.'].join('\n')
  assert.equal(shotName(ref, { name: 'Tess Marlow' }), 'Full shot of Tess on a rooftop at dusk…')
  assert.equal(shotName('integrated_multimodal_description: [Shot 1] A dog runs.', null), 'A dog runs.')
})
ok('a sketch drawn before the shot changed is set aside until it is redrawn', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-prod-'))
  const films = new Productions({ dataDir: dir, studio: () => null })
  const p = films.create({ name: 'Stale' })
  films.patch(p.id, (q) => (q.scenes = [{ id: 's1', heading: 'EXT. BUS STOP - NIGHT', shots: [{ id: 'a', action: 'They sit.', seconds: 5, sketch: 'C:/x.png' }, { id: 'b', action: 'Rain.', seconds: 5 }] }]))
  films.editShot(p.id, 's1', 'a', { seconds: 6, line: '' })
  assert.ok(!films.find(films.get(p.id), 'a').sh.sketchStale, 'length and words leave the sketch alone')
  films.editShot(p.id, 's1', 'a', { action: 'They sit.' })
  assert.ok(!films.find(films.get(p.id), 'a').sh.sketchStale, 'the same action again changes nothing')
  films.editShot(p.id, 's1', 'a', { stage: { people: [{ name: 'Tess', x: 0, y: 1, facing: 0 }], camera: { x: 0, y: -3, facing: 0, move: 'arc-left' } } })
  assert.equal(films.find(films.get(p.id), 'a').sh.sketchStale, true, 'a new board does')
  films.editShot(p.id, 's1', 'b', { action: 'Heavy rain.' })
  assert.ok(!films.find(films.get(p.id), 'b').sh.sketchStale, 'a shot with no sketch has nothing to set aside')
  fs.rmSync(dir, { recursive: true, force: true })
})
console.log(`${n} checks passed`)
