// MiniMax's H3 prompt guide in the writer: the prompt shapes assemble() gives each mode, and the guide's download.
//   node test/prompt-guide.mjs          (the download check fetches ~40 KB from GitHub and Hugging Face)
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assemble, firstLastLine, FIRST_FRAME_LINE, outputSchema, systemPrompt } from '../src/service/prompter.js'
import { loadGuide, GUIDE_FILES } from '../src/service/h3guide.js'

let n = 0
const ok = async (name, fn) => {
  await fn()
  n++
  console.log(`ok  ${name}`)
}

const two = {
  style: 'Live-action, cinematic',
  shots: [
    { start_seconds: 0, description: 'A baker opens the shutters.' },
    {
      start_seconds: 5,
      description: 'The camera cuts to steam rising from bread.'
    }
  ],
  soundscape: 'Shutters scrape.',
  music: 'N/A'
}

await ok('text: the three fields, the style opening [Shot 1], shots on one line', () => {
  const t = assemble(two, { mode: 'text', seconds: 8 })
  assert.equal(
    t,
    'integrated_multimodal_description: [Shot 1] Live-action, cinematic. A baker opens the shutters. [Shot 2] At 00:05.000, the camera cuts to steam rising from bread.\n\noverall_soundscape: Shutters scrape.\n\nnon_diegetic_music: N/A'
  )
})
await ok('field names, shot labels and cut times the writer repeats are taken out', () => {
  const t = assemble(
    {
      ...two,
      shots: [
        {
          start_seconds: 0,
          description: 'integrated_multimodal_description: [Shot 1] A baker opens the shutters.'
        },
        {
          start_seconds: 5,
          description: '[Shot 2] At 00:05.000, the camera cuts to bread.'
        }
      ],
      soundscape: 'overall_soundscape: Shutters scrape.'
    },
    { seconds: 8 }
  )
  assert.ok(!/\[Shot 1\] (?:integrated|\[Shot)/.test(t) && !/At 00:05\.000, at 00:05/i.test(t) && !/overall_soundscape: overall_soundscape/.test(t), t)
  assert.match(t, /\[Shot 2\] At 00:05\.000, the camera cuts to bread\./)
})
await ok('frames with one picture: the I2VA line', () => {
  const t = assemble(two, { mode: 'frames', seconds: 8 })
  assert.ok(t.startsWith(`${FIRST_FRAME_LINE}\n\nintegrated_multimodal_description: [Shot 1] `))
})
await ok('frames with a last picture: the FL2VA line at H3 length, one shot', () => {
  // 5 s -> 124 frames on the 17n+5 grid -> 5.17 s
  assert.equal(
    firstLastLine(5),
    'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 5.17-second mark of the target video.'
  )
  const t = assemble(two, { mode: 'frames', seconds: 5, lastFrame: true })
  assert.ok(t.startsWith(`${firstLastLine(5)}\n\nintegrated_multimodal_description: [Shot 1] `))
  assert.ok(!t.includes('[Shot 2]'), 'a second shot is folded into the one continuous shot')
})
await ok('frames mode answers in three parts, assembled into one shot', () => {
  assert.deepEqual(outputSchema({ mode: 'frames', lastFrame: true }).required, ['direction', 'style', 'opening', 'motion', 'ending', 'soundscape', 'music'])
  const t = assemble(
    {
      style: 'Live-action',
      opening: 'She smiles in the studio',
      motion: 'She unties her apron and walks out',
      ending: '[Shot 1] She sits at the wheel of a car',
      soundscape: 'Rain.',
      music: 'N/A'
    },
    { mode: 'frames', seconds: 5, lastFrame: true }
  )
  assert.match(t, /\n\nintegrated_multimodal_description: \[Shot 1\] Live-action\. She smiles in the studio\. She unties her apron and walks out\. She sits at the wheel of a car\.\n\n/)
})
await ok('reference mode asks for a subject per picture or video', () => {
  assert.equal(outputSchema({ mode: 'reference', refs: 2 }).properties.subjects.minItems, 2)
})
await ok('reference: the six sections, shots listed, markers kept to the guide', () => {
  const t = assemble(
    {
      ...two,
      style: 'The target video is a warm, realistic kitchen scene',
      subjects: [
        {
          definition: 'the bakery kitchen in <Picture 1>, with a flour-dusted counter'
        },
        {
          definition: '<Subject 2> is the young woman in <Picture 2>, with dark hair'
        }
      ],
      summary: '[reference generation] <Subject 2> bakes in <Subject 1>.',
      retention: [
        {
          subject: 1,
          shots: [1, 2],
          relation: 'fully preserved',
          carries: 'the counter and light'
        },
        {
          subject: 2,
          shots: [9],
          relation: 'attribute transfer',
          carries: 'her face'
        }
      ]
    },
    { mode: 'reference', seconds: 8 }
  )
  assert.match(
    t,
    /^subject_definitions:\n<Subject 1> is the bakery kitchen in <Picture 1>, with a flour-dusted counter\.\n<Subject 2> is the young woman in <Picture 2>, with dark hair\.\n\nsummary:\n\[reference generation\] <Subject 2> bakes in <Subject 1>\.\n\nretention_analysis:\n/
  )
  assert.match(t, /\n<Subject 1> \(appears in \[Shot 1\], \[Shot 2\]\): fully_preserved - the counter and light\n/)
  assert.match(t, /\n<Subject 2> \(appears in \[Shot 1\], \[Shot 2\]\): attribute_transfer - her face\n/, 'a shot that does not exist falls back to every shot')
  assert.match(t, /\n\ndetailed_description:\nThe target video is a warm, realistic kitchen scene\.\n\[Shot 1\] A baker opens the shutters\.\n\[Shot 2\] At 00:05\.000, /)
  assert.match(t, /\n\noverall_soundscape:\nShutters scrape\.\n\nnon_diegetic_music:\nN\/A$/)
})
await ok('reference with audio: its definition, marker and the task types', () => {
  const t = assemble(
    {
      ...two,
      subjects: [{ definition: 'the woman in <Picture 1>' }],
      summary: 'She speaks.',
      retention: [
        {
          subject: 1,
          shots: [1],
          relation: 'fully_preserved',
          carries: 'her face'
        }
      ],
      audio: [
        {
          label: '<Audio 1>',
          role: 'the voice-timbre reference for <Subject 1> (S1)',
          relation: 'reference',
          carries: 'her timbre'
        }
      ]
    },
    { mode: 'reference', seconds: 8 }
  )
  assert.match(t, /\n<Audio 1> is the voice-timbre reference for <Subject 1> \(S1\)\.\n/)
  assert.match(t, /\n<Audio 1>: reference - her timbre\n/)
  assert.match(t, /\[reference generation \+ audio reference\] She speaks\./)
})
await ok('the system prompt carries the guide after IV Studio rules, and the frames rule fits the pictures', () => {
  const guide = { base: 'BASE GUIDE TEXT', ref: 'REF GUIDE TEXT' }
  const pics = [
    { kind: 'picture', file: 'a.png' },
    { kind: 'picture', file: 'b.png' }
  ]
  const s = systemPrompt({ mode: 'frames', seconds: 5, media: pics, guide })
  assert.ok(s.indexOf('BASE GUIDE TEXT') > s.indexOf('DIRECTING RULES') && !s.includes('REF GUIDE TEXT'))
  assert.match(s, /FL2VA/)
  assert.match(
    systemPrompt({
      mode: 'frames',
      seconds: 5,
      media: pics.slice(0, 1),
      guide
    }),
    /I2VA/
  )
  assert.ok(
    systemPrompt({
      mode: 'reference',
      seconds: 5,
      media: pics,
      guide
    }).includes('REF GUIDE TEXT')
  )
  assert.ok(!systemPrompt({ mode: 'text', seconds: 5 }).includes('MINIMAX'), 'no guide: IV Studio rules only')
})
await ok('the guide downloads once, pinned, and a changed file is refused', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-guide-'))
  assert.equal(await loadGuide({ root, download: false }), null)
  const g = await loadGuide({ root })
  assert.ok(g && g.base.startsWith('# Video Prompt Writing Guide') && g.ref.startsWith('# Full-Reference Mode'), 'downloaded')
  for (const f of Object.keys(GUIDE_FILES)) assert.ok(fs.existsSync(path.join(g.dir, f)))
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-guide-'))
  fs.cpSync(g.dir, path.join(other, 'minimax-h3-guide'), { recursive: true })
  fs.appendFileSync(path.join(other, 'minimax-h3-guide', 'base-en.txt'), '\nEdited.')
  assert.equal(await loadGuide({ root: other, download: false }), null)
  for (const d of [root, other]) fs.rmSync(d, { recursive: true, force: true })
})
console.log(`${n} checks passed`)
