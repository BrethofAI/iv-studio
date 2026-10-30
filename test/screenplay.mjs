// The screenplay parser (src/service/screenplay.js): headings, action, dialogue, Fountain bits.   node test/screenplay.mjs
import assert from 'node:assert/strict'
import { parseScript, sceneText } from '../src/service/screenplay.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log('ok ', name))

const script = `Title: The Last Bowl
Author: Test

FADE IN:

INT. POTTERY STUDIO - DAY

Rain taps the skylight. TESS (30s, clay to the elbows) pulls a bowl off the wheel.

TESS
(to herself)
That's the one.

THEO (O.S.)
You said that about the last six.

EXT. PARKING LOT - CONTINUOUS

Tess runs to her car, the bowl wrapped in a towel.

CUT TO:

.MONTAGE OF BOWLS

Bowls. Bowls everywhere.
`
const p = parseScript(script)
ok('title page', () => assert.equal(p.title, 'The Last Bowl'))
ok('three scenes, forced heading included', () => assert.deepEqual(p.scenes.map((s) => s.heading), ['INT. POTTERY STUDIO - DAY', 'EXT. PARKING LOT - CONTINUOUS', 'MONTAGE OF BOWLS']))
ok('location and time from the heading', () => assert.deepEqual([p.scenes[0].location, p.scenes[0].time], ['Pottery Studio', 'Day']))
ok('action, dialogue with parenthetical, off-screen voice', () => {
  const e = p.scenes[0].elements
  assert.equal(e[0].type, 'action')
  assert.deepEqual(e[1], { type: 'dialogue', who: 'Tess', text: "That's the one.", paren: 'to herself' })
  assert.deepEqual(e[2], { type: 'dialogue', who: 'Theo', text: 'You said that about the last six.' })
})
ok('transitions are dropped', () => assert.ok(!p.scenes.flatMap((s) => s.elements).some((e) => /CUT TO|FADE IN/.test(e.text))))
ok('speakers', () => assert.deepEqual(p.speakers, ['Tess', 'Theo']))
ok('a script with no headings is one scene', () => {
  const q = parseScript('A man walks into a bar.\n\nBARTENDER\nWhat will it be?')
  assert.equal(q.scenes.length, 1)
  assert.equal(q.scenes[0].heading, 'SCENE 1')
  assert.equal(q.scenes[0].elements[1].who, 'Bartender')
})
ok('a line in capitals that ends a sentence is action, not a cue', () => {
  const q = parseScript('INT. ROOM - NIGHT\n\nSILENCE.\nThen a knock.')
  assert.equal(q.scenes[0].elements[0].type, 'action')
})
ok('sceneText round trip', () => assert.match(sceneText(p.scenes[0]), /^INT\. POTTERY STUDIO - DAY\n.*\nTESS \(to herself\): That's the one\./))
console.log(`${n} checks passed`)
