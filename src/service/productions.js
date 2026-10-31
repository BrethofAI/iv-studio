// Projects: a short film from script to rough cut. (Called "productions" in the code: a "project" already means
// one shot's renders, see Studio.createProject.) A production holds:
//   brief    name, logline, aspect, target length, look (style LoRAs, notes)
//   assets   cast (character presets, each with its voice), locations and props (descriptions, pictures)
//   script   screenplay text (plain or Fountain), parsed into scenes by screenplay.js
//   scenes   each with shots: what we see, the camera, who's in it, a spoken line, seconds and an H3 prompt.
//            Each shot renders as an ordinary IV Studio shot (shot.projectId), so it also shows in Shots.
//   sketches a still per shot for the storyboard (shot.sketch), made by Images and kept out of its gallery
//   cut      an Edit with every shot in script order (editId)
// step is where the person is in the Projects wizard (idea, story, cast, board, film, watch).
// Breaking the script down uses the local writer: one call per scene for the shot list, then one per shot
// for its H3 prompt. Rendering, picking and finishing are Studio's own.
import { previsWords, stageFields } from './staging.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ASPECTS } from './plan.js'
import { DEFAULT_LOCAL_MODEL, ollamaJson, writeHarness, writeLocal } from './prompter.js'
import { parseScript, sceneText } from './screenplay.js'
import { applyOps } from './timeline.js'

const now = () => new Date().toISOString()
const id6 = () => randomUUID().slice(0, 6)
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
const STEPS = ['idea', 'story', 'cast', 'board', 'film', 'watch']
const FORMAT_FOR = { '16:9': '1080p', '9:16': 'vertical', '1:1': 'square' }
const DONE = ['success', 'error', 'cancelled']

const SHOT_RULES = `You are a film director breaking one scene of a screenplay into shots for an AI video model. Each shot is one continuous camera take of 3 to 10 seconds with native sound.
- Keep the scene's order. Cover its action within the seconds you are given for the scene: when there's more than fits, keep the moments that tell the story and every spoken line.
- Every line of dialogue appears in exactly one shot, word for word, and a shot has at most one speaker. A long speech can be split over shots, each with its own part.
- Open with a shot that shows where we are, then go closer when people talk or do something small.
- action: what we see, present tense, one or two concrete sentences: who, where, what they do and how. Name people by their names. No camera words here.
- A shot never cuts. Something like "close-up on her hand, then cut to a wide shot" is two shots: write them as two.
- staging: where each person is at the start of the shot by screen side (screen-left is the viewer's left, not the character's), which way they face, who they look at and how far apart they are, and where they move. With two people, keep the camera on one side of the line between them for the whole scene, so they stay on the same sides of the frame.
- camera: one shot size and the camera's movement (e.g. "Wide, slow push in", "Close-up, handheld"), never two sizes with an arrow. Choose the framing that shows the action: hands and the object for a small action, enough body and floor for a movement, the face for a reaction.
- ends: how the shot leaves things: where each person is and which way they face, where their hands and the important props are, who they look at and which way anyone is moving. The next shot starts from exactly that, unless the scene says otherwise.
- characters: the names of the people on screen (from the cast list, or as the script names them).
- speaker and line: who speaks in this shot and their exact words, or "" for both.
- seconds: 3 to 10. A spoken line needs about 1 second per 2.5 words plus 1 second.
- Don't add lines, people, props or camera moves the script doesn't have. A quiet reaction can carry a moment.`
const SHOT_SCHEMA = {
  type: 'object',
  properties: {
    shots: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: { action: { type: 'string' }, staging: { type: 'string' }, camera: { type: 'string' }, characters: { type: 'array', items: { type: 'string' } }, speaker: { type: 'string' }, line: { type: 'string' }, seconds: { type: 'number' }, ends: { type: 'string' } },
        required: ['action', 'staging', 'camera', 'characters', 'speaker', 'line', 'seconds', 'ends']
      }
    }
  },
  required: ['shots']
}

// The writer sometimes leaves a shot's line out of its prompt. Without its <d> tag H3 makes up its own words,
// so a missing line goes at the end of the last [Shot] paragraph.
export function withLine(prompt, who, line) {
  const words = String(line || '').trim()
  if (!words) return prompt
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const tags = [...prompt.matchAll(/<d>(?:\[[^\]]*\])?([\s\S]*?)<\/d>/g)].map((m) => norm(m[1]))
  if (tags.some((t) => t && (t.includes(norm(words)) || norm(words).includes(t)))) return prompt
  const said = `${who || 'They'} says: <d>[English] ${words.replace(/^["“]|["”]$/g, '')}</d>`
  const cut = prompt.search(/\n\s*\noverall_soundscape:/)
  return cut < 0 ? `${prompt.trimEnd()} ${said}` : `${prompt.slice(0, cut).trimEnd()} ${said}${prompt.slice(cut)}`
}

// A shot with no line says so, or H3 may give someone words ("Thank you.") of its own. Speaker tags go too.
export function withSilence(prompt) {
  if (/<d>/.test(prompt) || /nobody speaks/i.test(prompt)) return prompt
  const quiet = String(prompt).replace(/\s*\(S\d+\)/g, '')
  const said = 'Nobody speaks in this shot: no dialogue, only the sounds of the place.'
  const cut = quiet.search(/\n\s*\noverall_soundscape:/)
  return cut < 0 ? `${quiet.trimEnd()} ${said}` : `${quiet.slice(0, cut).trimEnd()} ${said}${quiet.slice(cut)}`
}

// How well a spoken take matches its line (0 to 1): its words found, in any order, against the longer of the two,
// so a dropped word and an added one ("Mine." heard as "Mine swept") both count against it.
export function wordMatch(line, heard) {
  const words = (t) => String(t || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  const want = words(line)
  const got = words(heard)
  if (!want.length) return 1
  const total = Math.max(want.length, got.length)
  let n = 0
  for (const w of want) {
    const i = got.indexOf(w)
    if (i >= 0) (n++, got.splice(i, 1))
  }
  return n / total
}

const SCRIPT_RULES = `You write short films for an AI video model that films one 3 to 10 second shot at a time, with sound and spoken lines.
- Write the film the person describes, in plain, concrete, visual English. Show, don't explain.
- Keep the idea's own events, twist and ending exactly as given. Never swap them for a different or simpler story: if the idea says a puzzle is finished and then an extra piece turns up, the puzzle is finished and the piece is extra.
- Keep where people are and what they hold consistent from beat to beat: someone sitting on the floor doesn't push back a chair.
- Keep it small: few places, few people, simple physical actions the camera can see, short spoken lines.
- Use the cast's names for the people in it. Don't invent more than one extra person unless the idea needs them.
- Every scene happens in one place at one time. place is a short name ("Pottery studio"), time is DAY, NIGHT, MORNING or EVENING, inside is true for interiors, and looks is one sentence on what the place looks like (the room, the light, the colours).
- beats run in order. An action beat fills only action: one short sentence of what we see. A line beat fills speaker (a cast name), delivery (two or three words on how it's said, or "") and words: only what they say out loud, with no name, no quote marks and no "she says". Lines are short: one sentence.
- Write exactly the number of beats you are given, and end on a clear final image or line.
Example of three beats:
{"kind":"action","action":"Tess lifts a finished bowl off the wheel and turns it in the light.","speaker":"","delivery":"","words":""}
{"kind":"line","action":"","speaker":"Tess","delivery":"to herself","words":"That's the one."}
{"kind":"action","action":"She sets it on a shelf crowded with a dozen almost identical bowls.","speaker":"","delivery":"","words":""}`
// Lengths are capped so a small writer can't run one string on and on (Ollama holds it to the schema).
function scriptSchema(beats) {
  const str = (n) => ({ type: 'string', maxLength: n })
  return {
    type: 'object',
    properties: {
      title: str(60),
      scenes: {
        type: 'array',
        minItems: 1,
        maxItems: Math.max(1, Math.ceil(beats / 3)),
        items: {
          type: 'object',
          properties: {
            place: str(40),
            time: { type: 'string', enum: ['DAY', 'NIGHT', 'MORNING', 'EVENING'] },
            inside: { type: 'boolean' },
            looks: str(240),
            beats: { type: 'array', minItems: 1, maxItems: beats, items: { type: 'object', properties: { kind: { type: 'string', enum: ['action', 'line'] }, action: str(220), speaker: str(30), delivery: str(40), words: str(160) }, required: ['kind', 'action', 'speaker', 'delivery', 'words'] } }
          },
          required: ['place', 'time', 'inside', 'looks', 'beats']
        }
      }
    },
    required: ['title', 'scenes']
  }
}

// Only the words said out loud. The writer sometimes wraps a line as prose: Theo: "It's mine," he says.
const QUOTED = /["“]([^"“”]+)["”]/g
const SAYS = /\b(?:he|she|they|[A-Z][a-z]+)\s+(?:says|said|asks|asked|whispers|whispered|mutters|muttered|shouts|shouted|replies|replied|adds|added|calls|snaps)\b/
export function spokenWords(text) {
  let t = String(text || '').trim().replace(/^[A-Z][\w'.-]*(?: [A-Z][\w'.-]*)?\s*(?:\([^)]*\))?\s*:\s*/, '')
  const quoted = [...t.matchAll(QUOTED)].map((m) => m[1].trim().replace(/,$/, '.'))
  if (quoted.length && (/^["“]/.test(t) || SAYS.test(t.replace(QUOTED, '')))) t = quoted.join(' ')
  const single = t.match(/^['‘](.+)['’]$/)
  if (single) t = single[1]
  return t.replace(/^["“]|["”]$/g, '').trim()
}

// One beat from the writer, put right when it fills the wrong fields: the words in delivery, "Tess (quiet)" as the
// words, or a line with nobody saying anything. Takes the older { text, who, how } shape too.
export function beatOf(b) {
  let kind = b.kind === 'line' ? 'line' : 'action'
  let action = String(b.action ?? (kind === 'action' ? b.text : '') ?? '').trim()
  const speaker = String(b.speaker ?? b.who ?? '').trim()
  let delivery = String(b.delivery ?? b.how ?? '').trim().replace(/^\(|\)$/g, '').trim()
  let words = String(b.words ?? (kind === 'line' ? b.text : '') ?? '').trim()
  const first = speaker.split(/\s+/)[0].toLowerCase()
  if (words && first && new RegExp(`^${first.replace(/[^\w]/g, '')}\\b[^.!?]*$`, 'i').test(words.replace(/\([^)]*\)/g, '').trim()) && words.split(/\s+/).length <= 3) words = ''
  if (!words && delivery.split(/\s+/).length >= 3) [words, delivery] = [delivery, '']
  words = spokenWords(words)
  if (kind === 'line' && !words) kind = 'action'
  if (kind === 'action' && !action && words && speaker) kind = 'line'
  return kind === 'line' ? { kind, speaker, delivery, words } : { kind, action: action || words }
}

// A scene heading's place and time from the writer's, which can come as "Bus stop – rainy afternoon" + "AFTERNOON".
const TIMES = [
  ['NIGHT', /night|midnight|\b\d{1,2}\s*a\.?m\b|late/i],
  ['MORNING', /morning|dawn|sunrise/i],
  ['EVENING', /evening|dusk|sunset|twilight/i],
  ['DAY', /day|noon|afternoon/i]
]
export function heading(place, time) {
  const [name, ...rest] = String(place || 'Somewhere').split(/\s+[-–—]\s+/)
  const said = [time, ...rest].filter(Boolean).join(' ')
  return { place: name.trim() || 'Somewhere', time: TIMES.find(([, re]) => re.test(said))?.[0] || 'DAY' }
}

// The writer's film as screenplay text, which parseScript reads back.
export function scriptText(out) {
  const parts = out.title ? [`Title: ${out.title.trim()}`, ''] : []
  for (const sc of out.scenes || []) {
    const { place, time } = heading(sc.place, sc.time)
    parts.push(`${sc.inside === false ? 'EXT.' : 'INT.'} ${place.toUpperCase()} - ${time}`, '')
    for (const raw of sc.beats || []) {
      const b = beatOf(raw)
      if (b.kind === 'line' && b.speaker) parts.push(b.speaker.toUpperCase(), ...(b.delivery ? [`(${b.delivery})`] : []), b.words, '')
      else if (b.kind === 'line' || b.action) parts.push(b.kind === 'line' ? b.words : b.action, '')
    }
  }
  return parts.join('\n').trim() + '\n'
}

// A shot's text prompt as a Frames prompt: H3 opens on <Picture 1> (the shot's sketch) when the prompt says so.
const FIRST_FRAME = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.'
export function asFirstFrame(prompt) {
  const body = String(prompt || '').trim()
  return body.startsWith(FIRST_FRAME) ? body : `${FIRST_FRAME}\n\n${body}`
}

// A shot that opens on its sketch (<Picture 1>) and stays in the place's picture (<Picture 2>), for reference to video:
// the sketch fixes the first frame and the place carries its room, light and colours through the whole take.
// Anyone else on screen (people) comes as the next pictures: their face carries into the shot. With previs (the
// shot's staging board plan) its grey previs clip is <Video 1>, for the camera move and the blocking; sketch or
// room false leaves that picture out (and renumbers the rest).
// Written in the full-reference format of MiniMax's H3 guide; the text prompt's three fields become its last three.
export function withRoom(prompt, { place, description, people = [], sketch = true, room = true, previs = null }) {
  const body = String(prompt || '').trim().replace(`${FIRST_FRAME}\n\n`, '')
  const field = (name) => (body.match(new RegExp(`${name}:\\s*([\\s\\S]*?)(?=\\n\\s*\\n\\s*(?:overall_soundscape|non_diegetic_music):|$)`)) || [])[1]?.trim()
  const shots = (field('integrated_multimodal_description') ?? body).replace(/\s+(\[Shot \d+\])/g, '\n$1')
  const inShots = Array.from({ length: (shots.match(/\[Shot \d+\]/g) || ['']).length }, (_, i) => `[Shot ${i + 1}]`).join(', ')
  let k = 0
  const sk = sketch ? ++k : 0
  const rm = room ? ++k : 0
  const face = people.map(() => ++k)
  const subject = (i) => i + 1 + (room ? 1 : 0)
  const opens = [sk && `begins from <Picture ${sk}>`, rm && 'stays in <Subject 1> for the whole shot'].filter(Boolean).join(' and ')
  const where = [sk && `The shot begins from <Picture ${sk}>`, rm && `takes place in <Subject 1>, the place in <Picture ${rm}>, throughout`].filter(Boolean).join(' and ')
  return [
    'subject_definitions:',
    ...(sk ? [`<Picture ${sk}> is the first frame of [Shot 1], the storyboard sketch of this shot.`] : []),
    ...(rm ? [`<Subject 1> is the place in <Picture ${rm}>: ${place || 'the set'}${description ? `, ${description.replace(/[.\s]+$/, '')}` : ''}.`] : []),
    ...people.map((name, i) => `<Subject ${subject(i)}> is ${name}, the person in <Picture ${face[i]}>.`),
    '',
    'summary:',
    `[${sk ? 'keyframe completion + ' : ''}reference generation] The target video ${opens || 'is one shot'}.${people.length ? ` ${people.map((name, i) => `${name} is <Subject ${subject(i)}>`).join(' and ')}.` : ''}${previs ? ' Its camera move and blocking follow <Video 1>.' : ''}`,
    '',
    'retention_analysis:',
    ...(sk ? [`<Picture ${sk}> ([Shot 1] first frame): fully_preserved - the shot begins from it at 0.00 seconds.`] : []),
    ...(rm ? [`<Subject 1> (appears in ${inShots}): fully_preserved - the room, its furniture, light and colours, wherever the camera looks; the framing is newly directed.`] : []),
    ...people.map((name, i) => `<Subject ${subject(i)}> (appears in ${inShots}): fully_preserved - ${name}'s face and hair; pose and clothes follow the shot.`),
    ...(previs ? ['<Video 1> (camera movement and blocking): partially_preserved - its camera path, speed and framing, and where the people stand and walk; not its look.'] : []),
    '',
    'detailed_description:',
    ...[where && `${where}.`, previs && previsWords(previs, 1)].filter(Boolean),
    shots,
    '',
    `overall_soundscape:\n${field('overall_soundscape') || 'Quiet room tone.'}`,
    '',
    `non_diegetic_music:\n${field('non_diegetic_music') || 'N/A'}`
  ].join('\n')
}

// A storyboard still's prompt: a film still of the shot, in the film's look.
export function sketchPrompt({ action, camera, place, time, description, look, faces = [], staging }) {
  return [
    `Cinematic film still, ${camera ? `${camera.replace(/[.\s]+$/, '').toLowerCase()} framing` : 'medium shot'}.`,
    faces.length ? `${faces.map((f, i) => `${f} is the person in picture ${i + 1}`).join('; ')}; keep their face.` : '',
    action,
    staging ? `${staging.replace(/[.\s]+$/, '')}.` : '',
    place ? `${place}${time ? `, ${time.toLowerCase()}` : ''}${description ? `: ${description}` : ''}.` : '',
    look ? `Look: ${look}.` : 'Natural light, realistic, shallow depth of field.',
    'One single frame: no split screen, no collage, no text, no captions, no borders.'
  ]
    .filter(Boolean)
    .join(' ')
}

// The empty place, drawn once so every sketch there shares its room, light and colours.
export function placePrompt({ place, time, description, look }) {
  return [
    `Cinematic film still, wide establishing shot of ${place || 'the place'}${time ? `, ${time.toLowerCase()}` : ''}.`,
    description ? `${description}.` : '',
    'Nobody in it: an empty set, ready for the actors.',
    look ? `Look: ${look}.` : 'Natural light, realistic.',
    'One single frame: no split screen, no collage, no text, no captions, no borders.'
  ]
    .filter(Boolean)
    .join(' ')
}

export class Productions {
  // studio: () => the current Studio. voices: () => the voice engine (or null). images: () => Images (sketches).
  // edits: Edits. localCopy(file): an output as a file on this PC. onChange(id): a production changed
  // (breakdown progress, renders).
  constructor({ dataDir, studio, voices = () => null, images = () => null, previs = () => null, catalog = () => null, edits, localCopy, onChange = () => {}, model = () => DEFAULT_LOCAL_MODEL, writer = () => ({ engine: 'local' }) }) {
    this.dir = path.join(dataDir, 'productions')
    this.studio = studio
    this.voices = voices
    this.previs = previs // the staging board in motion (previs.js), for shots whose camera moves
    this.images = images
    this.catalog = catalog // the ready-made characters, for faces of presets that have none of their own
    this.edits = edits
    this.localCopy = localCopy
    this.onChange = onChange
    this.model = model // the local model, for scripts and storyboard plans
    this.writer = writer // the prompt writer chosen in Settings ({ engine, model }), for each shot's H3 prompt
    this.running = new Map() // production id -> breakdown promise
    this.writing = new Set() // production ids whose script is being written
    this.filming = new Map() // production id -> { speaking: shot id or null, waiting: Set of shot ids } while lines are said
  }

  file = (id) => path.join(this.dir, `${id}.json`)
  list() {
    if (!fs.existsSync(this.dir)) return []
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson(path.join(this.dir, f), null))
      .filter(Boolean)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((p) => {
        const shots = p.scenes.flatMap((s) => s.shots)
        return { id: p.id, name: p.name, logline: p.logline, aspect: p.aspect, step: p.step || (shots.length ? 'board' : p.scenes.length ? 'cast' : 'idea'), scenes: p.scenes.length, shots: shots.length, cover: shots.find((s) => s.sketch)?.sketch || null, updatedAt: p.updatedAt }
      })
  }
  get(id) {
    const p = readJson(this.file(id), null)
    if (!p) throw new Error(`No project ${id}`)
    return p
  }
  write(p) {
    p.updatedAt = now()
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(`${this.file(p.id)}.tmp`, JSON.stringify(p, null, 2))
    fs.renameSync(`${this.file(p.id)}.tmp`, this.file(p.id))
    return p
  }
  create({ name = 'Untitled film', logline = '', aspect = '16:9', targetSeconds = 120, script = '' } = {}) {
    if (!ASPECTS[aspect]) throw new Error(`aspect must be ${Object.keys(ASPECTS).join(', ')}.`)
    const p = { id: randomUUID().slice(0, 8), kind: 'short', name, logline, aspect, targetSeconds, step: 'idea', createdAt: now(), cast: [], locations: [], props: [], look: { notes: '', loras: [] }, script: { text: script }, scenes: [], breakdown: null, editId: null }
    if (script) Object.assign(p, this.parsed(p, script))
    return this.write(p)
  }
  remove(id) {
    fs.rmSync(this.file(id), { force: true })
    return true
  }

  // The brief and the assets: any of name, logline, aspect, targetSeconds, look, cast, locations, props, step.
  update(id, patch) {
    const p = this.get(id)
    for (const k of ['name', 'logline', 'aspect', 'targetSeconds', 'look', 'cast', 'locations', 'props', 'step']) if (patch[k] !== undefined) p[k] = patch[k]
    if (!ASPECTS[p.aspect]) throw new Error(`aspect must be ${Object.keys(ASPECTS).join(', ')}.`)
    if (!STEPS.includes(p.step || 'idea')) throw new Error(`step must be ${STEPS.join(', ')}.`)
    p.locations = (p.locations || []).map((l) => ({ id: l.id || id6(), name: l.name || 'Location', description: l.description || '', pictures: l.pictures || [] }))
    p.props = (p.props || []).map((l) => ({ id: l.id || id6(), name: l.name || 'Prop', description: l.description || '', pictures: l.pictures || [] }))
    return this.write(p)
  }

  // ---------- script ----------
  // New script text: scenes are re-read from it. Scenes that already have shots keep them when their heading
  // is unchanged, so editing one scene doesn't throw away the others.
  setScript(id, text) {
    const p = this.get(id)
    return this.write(Object.assign(p, this.parsed(p, text)))
  }
  parsed(p, text) {
    const s = parseScript(text)
    const old = new Map((p.scenes || []).map((x) => [x.heading, x]))
    const scenes = s.scenes.map((sc) => {
      const prev = old.get(sc.heading)
      const same = prev && JSON.stringify(prev.elements) === JSON.stringify(sc.elements)
      return { id: prev?.id || id6(), heading: sc.heading, location: sc.location, time: sc.time, elements: sc.elements, shots: same ? prev.shots : [], stale: !!prev && !same && prev.shots.length > 0 }
    })
    // the cast: any speaker who matches a character preset joins it, and so does a preset named in the action
    const presets = this.studio().characters()
    const cast = [...(p.cast || [])]
    const firstName = (n) => n.split(/\s+/)[0].toLowerCase()
    for (const who of s.speakers) {
      const c = presets.find((x) => firstName(x.name) === firstName(who))
      if (c && !cast.some((x) => x.characterId === c.id)) cast.push({ characterId: c.id, as: who })
    }
    const action = s.scenes.flatMap((sc) => sc.elements.filter((e) => e.type === 'action').map((e) => e.text)).join('\n')
    // (only for a first script, so someone taken out of the cast stays out when the script is edited)
    for (const c of (p.scenes || []).length ? [] : presets) {
      const name = c.name.split(/\s+/)[0]
      if (name.length > 1 && !cast.some((x) => x.characterId === c.id) && new RegExp(`\\b${name.replace(/[^\w]/g, '')}\\b`).test(action)) cast.push({ characterId: c.id, as: name })
    }
    // locations from the headings
    const locations = [...(p.locations || [])]
    for (const sc of scenes) if (sc.location && !locations.some((l) => l.name.toLowerCase() === sc.location.toLowerCase())) locations.push({ id: id6(), name: sc.location, description: '', pictures: [] })
    return { script: { text, updatedAt: now() }, scenes, cast, locations, ...(s.title && (!p.name || p.name === 'Untitled film') ? { name: s.title } : {}) }
  }

  // A first draft of the script from the idea (the logline, or idea), the cast and the target length, by the
  // local writer. It replaces the script, so the page asks before writing over one.
  async writeScript(id, opts = {}) {
    if (this.writing.has(id)) throw new Error('The script is already being written.')
    this.writing.add(id)
    this.onChange(id)
    try {
      return await this.draftScript(id, opts)
    } finally {
      this.writing.delete(id)
      this.onChange(id)
    }
  }
  async draftScript(id, { idea } = {}) {
    const p = this.get(id)
    const brief = String(idea || p.logline || '').trim()
    if (!brief) throw new Error('Say what the film is about first.')
    const castNames = p.cast.map((c) => this.character(c.characterId)?.name || c.as).filter(Boolean)
    const beats = Math.max(3, Math.round(p.targetSeconds / 4))
    const user = [
      `Idea: ${brief}`,
      p.name && p.name !== 'Untitled film' ? `Title: ${p.name}` : '',
      castNames.length ? `Cast: ${castNames.join(', ')}` : '',
      `Beats: exactly ${beats} in all, for about ${p.targetSeconds} seconds of film.`,
      p.look?.notes ? `Look: ${p.look.notes}` : ''
    ]
      .filter(Boolean)
      .join('\n')
    const out = await ollamaJson({ system: SCRIPT_RULES, user, schema: scriptSchema(beats), model: this.model(), cpu: await this.studio().gpuBusy().catch(() => false), temperature: 0.6 })
    if (p.name && p.name !== 'Untitled film') out.title = ''
    const q = this.setScript(id, scriptText(out))
    // the writer's one line on each place fills a place the person hasn't described yet
    const looks = new Map((out.scenes || []).filter((s) => s.place && s.looks?.trim()).map((s) => [String(s.place).trim().toLowerCase(), s.looks.trim()]))
    if (!q.locations.some((l) => !l.description && looks.has(l.name.toLowerCase()))) return q
    return this.write({ ...q, locations: q.locations.map((l) => (l.description ? l : { ...l, description: looks.get(l.name.toLowerCase()) || '' })) })
  }

  // ---------- breakdown ----------
  // Breaks every scene without shots (or all of them, with redo) into shots and writes each shot's H3 prompt.
  // Runs in the background; progress is in production.breakdown. Returns at once.
  breakDown(id, { redo = false, sceneIds = null, sketch = false } = {}) {
    if (this.running.has(id)) throw new Error('This project is already being broken down.')
    const p = this.get(id)
    if (!p.scenes.length) throw new Error('Add the script first.')
    const todo = p.scenes.filter((s) => (sceneIds ? sceneIds.includes(s.id) : redo || !s.shots.length || s.stale)).map((s) => s.id)
    if (!todo.length) throw new Error('Every scene already has shots. Pass redo to break them down again.')
    p.breakdown = { state: 'running', scenes: todo.length, scenesDone: 0, shots: 0, shotsDone: 0, error: null, at: now() }
    this.write(p)
    this.onChange(id)
    const run = this.runBreakdown(id, todo, { sketch })
      .catch((err) => this.patch(id, (q) => (q.breakdown = { ...q.breakdown, state: 'error', error: err.message })))
      .finally(() => this.running.delete(id))
    this.running.set(id, run)
    return this.get(id)
  }
  patch(id, fn) {
    const p = this.get(id)
    fn(p)
    this.write(p)
    this.onChange(id)
    return p
  }
  // With sketch, the new shots' storyboard stills are queued before the breakdown counts as done.
  async runBreakdown(id, sceneIds, { sketch = false } = {}) {
    const cpu = await this.studio().gpuBusy().catch(() => false)
    for (const sid of sceneIds) {
      const p = this.get(id)
      const sc = p.scenes.find((s) => s.id === sid)
      if (!sc) continue
      const castNames = p.cast.map((c) => this.character(c.characterId)?.name).filter(Boolean)
      const loc = p.locations.find((l) => l.name.toLowerCase() === (sc.location || '').toLowerCase())
      // the scene's share of the film's length, by how much script it has
      const size = (s) => sceneText(s).length
      const share = Math.max(6, Math.round((p.targetSeconds * size(sc)) / Math.max(1, p.scenes.reduce((n, s) => n + size(s), 0))))
      const user = [`Film: ${p.name}${p.logline ? `. ${p.logline}` : ''}`, castNames.length ? `Cast: ${castNames.join(', ')}` : '', loc?.description ? `${loc.name}: ${loc.description}` : '', p.look?.notes ? `Look: ${p.look.notes}` : '', `Seconds for this scene: about ${share} (${Math.max(1, Math.round(share / 6))} shots or so).`, `Scene:\n${sceneText(sc)}`].filter(Boolean).join('\n')
      const out = await ollamaJson({ system: SHOT_RULES, user, schema: SHOT_SCHEMA, model: this.model(), cpu })
      const shots = (out.shots || []).map((s) => ({
        id: id6(),
        action: String(s.action || '').trim(),
        staging: String(s.staging || '').trim(),
        camera: String(s.camera || '').trim(),
        ends: String(s.ends || '').trim(),
        characters: (s.characters || []).map(String),
        // the writer sometimes copies a cue's "(to herself)" or "(V.O.)" into the name
        speaker: String(s.speaker || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(),
        line: String(s.line || '').trim(),
        seconds: Math.min(10, Math.max(3, Math.round(Number(s.seconds) || 5))),
        prompt: '',
        character: this.mainCharacter(p, s),
        projectId: null,
        voiceLine: null
      }))
      this.patch(id, (q) => {
        const t = q.scenes.find((s) => s.id === sid)
        if (t) Object.assign(t, { shots, stale: false })
        q.breakdown.scenesDone++
        q.breakdown.shots += shots.length
      })
      for (const sh of shots) {
        await this.writeShotPrompt(id, sid, sh.id, { cpu })
        this.patch(id, (q) => q.breakdown.shotsDone++)
      }
    }
    const sketchError = sketch ? await this.sketch(id).then(() => null, (err) => err.message) : null
    this.patch(id, (q) => (q.breakdown = { ...q.breakdown, state: 'done', sketchError, at: now() }))
  }

  character(cid) {
    return this.studio().characters().find((c) => c.id === cid) || null
  }
  // The cast characters on screen in a shot that have a face picture: the shot's own character first, then anyone
  // else it names who is in the cast (two at most), as [{ ch, face }].
  onScreen(p, sh) {
    const first = (n) => String(n || '').split(/\s+/)[0].toLowerCase()
    const ids = [sh.character, ...(sh.characters || []).map((n) => p.cast.find((c) => first(c.as) === first(n) || first(this.character(c.characterId)?.name) === first(n))?.characterId)]
    return [...new Set(ids.filter(Boolean))]
      .map((cid) => ({ ch: this.character(cid), face: this.facePicture(this.character(cid)) }))
      .filter((x) => x.ch && x.face)
      .slice(0, 2)
  }
  // A character's face picture: its own, else the ready-made catalogue's.
  facePicture(ch) {
    if (!ch) return null
    const own = ch.picture && fs.existsSync(ch.picture) ? ch.picture : null
    const ready = own ? null : this.catalog()?.entries?.().find((c) => c.id === ch.id)
    const file = own || (ready?.picture ? path.join(this.catalog().dir, ready.picture) : null)
    return file && fs.existsSync(file) ? file : null
  }
  // The shot's character preset: the speaker's, else the first person on screen who is in the cast.
  mainCharacter(p, s) {
    const match = (name) => p.cast.find((c) => {
      const ch = this.character(c.characterId)
      const first = (x) => String(x || '').split(/\s+/)[0].toLowerCase()
      return ch && (first(ch.name) === first(name) || first(c.as) === first(name))
    })
    const c = match(s.speaker) || (s.characters || []).map(match).find(Boolean)
    return c?.characterId || 'none'
  }

  // One shot's H3 prompt from its description, by the local writer (with the shot's character).
  async writeShotPrompt(id, sceneId, shotId, { cpu } = {}) {
    const p = this.get(id)
    const sc = p.scenes.find((s) => s.id === sceneId)
    const sh = sc?.shots.find((s) => s.id === shotId)
    if (!sh) throw new Error('No such shot.')
    const loc = p.locations.find((l) => l.name.toLowerCase() === (sc.location || '').toLowerCase())
    const others = sh.characters.filter((n) => n.split(/\s+/)[0].toLowerCase() !== (this.character(sh.character)?.name || '').split(/\s+/)[0].toLowerCase())
    const before = sc.shots[sc.shots.findIndex((s) => s.id === shotId) - 1]
    const dot = (t) => String(t).trim().replace(/[.\s]+$/, '') + '.'
    const idea = [
      loc ? `${loc.name}${sc.time ? `, ${sc.time.toLowerCase()}` : ''}${loc.description ? `: ${loc.description}` : ''}.` : sc.heading,
      before?.ends ? `It opens as the previous shot ended: ${dot(before.ends)}` : '',
      sh.action,
      sh.staging ? `Staging: ${dot(sh.staging)}` : '',
      sh.camera ? `Camera: ${sh.camera}.` : '',
      sh.ends ? `It ends with: ${dot(sh.ends)}` : '',
      others.length ? `Also in the shot: ${others.join(', ')}.` : '',
      sh.line ? `${sh.speaker || 'They'} says exactly these words: "${sh.line}"` : 'No one speaks.',
      p.look?.notes ? `Look: ${p.look.notes}.` : ''
    ]
      .filter(Boolean)
      .join(' ')
    const ch = this.character(sh.character)
    const w = this.writer()
    const written =
      w.engine === 'claude' || w.engine === 'codex'
        ? await writeHarness({ engine: w.engine, model: w.model, idea, mode: 'text', seconds: sh.seconds, character: ch })
        : await writeLocal({ idea, mode: 'text', seconds: sh.seconds, character: ch, model: this.model(), cpu: cpu ?? (await this.studio().gpuBusy().catch(() => false)) })
    const first = (x) => String(x || '').split(/\s+/)[0].toLowerCase()
    const prompt = withLine(written, ch && first(ch.name) === first(sh.speaker) ? '{char}' : sh.speaker, sh.line)
    this.patch(id, (q) => {
      const t = q.scenes.find((s) => s.id === sceneId)?.shots.find((s) => s.id === shotId)
      if (t) t.prompt = prompt
    })
    return prompt
  }

  // ---------- shots ----------
  // Change a shot (any of action, staging, camera, ends, characters, speaker, line, seconds, prompt, character), add one after
  // another (add: { after }), remove one, or move one (move: -1 | 1).
  editShot(id, sceneId, shotId, patch = {}) {
    return this.patch(id, (p) => {
      const sc = p.scenes.find((s) => s.id === sceneId)
      if (!sc) throw new Error('No such scene.')
      const i = sc.shots.findIndex((s) => s.id === shotId)
      if (patch.remove) {
        if (i < 0) throw new Error('No such shot.')
        sc.shots.splice(i, 1)
        return
      }
      if (patch.add) {
        const sh = { id: id6(), action: patch.action || '', staging: patch.staging || '', camera: patch.camera || '', ends: patch.ends || '', characters: patch.characters || [], speaker: patch.speaker || '', line: patch.line || '', seconds: patch.seconds || 5, prompt: patch.prompt || '', character: patch.character || 'none', projectId: null, voiceLine: null }
        sc.shots.splice(i < 0 ? sc.shots.length : i + 1, 0, sh)
        return
      }
      if (i < 0) throw new Error('No such shot.')
      if (patch.move) {
        const j = i + Math.sign(patch.move)
        if (j >= 0 && j < sc.shots.length) [sc.shots[i], sc.shots[j]] = [sc.shots[j], sc.shots[i]]
        return
      }
      const sh = sc.shots[i]
      for (const k of ['action', 'staging', 'camera', 'ends', 'characters', 'speaker', 'line', 'seconds', 'prompt', 'character', 'stage']) if (patch[k] !== undefined) sh[k] = patch[k]
      // a staging board's plan becomes the shot's words, unless the words were given too
      if (patch.stage) {
        const f = stageFields(patch.stage)
        if (patch.staging === undefined) sh.staging = f.staging
        if (patch.camera === undefined) sh.camera = f.camera
      }
      if (patch.line !== undefined || patch.character !== undefined) sh.voiceLine = null
      sh.seconds = Math.min(15, Math.max(1, Number(sh.seconds) || 5))
    })
  }
  find(p, shotId) {
    for (const sc of p.scenes) {
      const sh = sc.shots.find((s) => s.id === shotId)
      if (sh) return { sc, sh }
    }
    throw new Error(`No shot ${shotId}.`)
  }

  // The shot's line in its character's voice (for lip-sync): the file becomes the shot's voice line.
  // again: a new take with fresh seeds (the voice keeps a take per seed, so the same seed gives the same take).
  async speak(id, shotId, { again = false } = {}) {
    const p = this.get(id)
    const { sh } = this.find(p, shotId)
    if (!sh.line) throw new Error('This shot has no line to say.')
    const voiceId = this.character(sh.character)?.voiceId
    if (!voiceId) throw new Error('Give this character a voice on the Characters page first.')
    const v = this.voices()
    if (!v) throw new Error('Voices need IV Studio on this PC.')
    // the voice can drop a word from a short line, so each take is read back and said again (up to 3 seeds)
    // until every word is there; the most complete take is kept
    let best = null
    const from = again ? 3000 + Math.floor(Math.random() * 1e6) : null
    for (const seed of from == null ? [null, 1001, 2002] : [from, from + 1, from + 2]) {
      const line = await v.speak({ voiceId, text: sh.line, seed })
      const heard = await v.transcribe(line.file).catch(() => null)
      const score = heard == null ? 1 : wordMatch(sh.line, heard)
      if (!best || score > best.score) best = { line, score, heard }
      if (score >= 0.99) break
    }
    const { line } = best
    this.patch(id, (q) => (this.find(q, shotId).sh.voiceLine = { file: line.file, text: line.text, duration: line.duration, heard: best.heard }))
    return line
  }

  // ---------- storyboard sketches ----------
  // A still per shot (all shots without one, or shotIds, or every shot with redo), so the board shows the film
  // before any video renders. With a face for the shot's character or a picture of the place, an editing model
  // (Flux.2 Klein, else Flux 3 Klein) keeps them in the film's frame; otherwise a generating model draws it.
  async sketch(id, { shotIds = null, redo = false } = {}) {
    const images = this.images()
    if (!images) throw new Error('Sketches need IV Studio on this PC.')
    const st = await images.status()
    if (st.remote) throw new Error('Sketches render on this PC’s ComfyUI. Switch to "This PC" on the Cloud page to make them.')
    if (st.error) throw new Error(st.error)
    const ready = (ids, edit) => ids.map((f) => st.families.find((x) => x.id === f && x.ready && x.models.length && (!edit || x.edit))).find(Boolean)
    const editor = ready(['flux2', 'flux3'], true) // they can keep the film's frame
    const drawer = ready(['flux2', 'zimage', 'flux3', 'krea2', 'qwen21', 'moss'], false)
    if (!drawer) throw new Error('Sketches need a picture model. Set one up in Settings → Setup (Flux.2 Klein or Z-Image Turbo).')
    let p = this.get(id)
    const todo = (sc) => sc.shots.filter((sh) => (shotIds ? shotIds.includes(sh.id) : redo || !(sh.sketch || sh.sketchSet)))
    // a place with no photo gets one drawn first (it shows on Cast and places), or each sketch makes up its own room
    if (editor)
      for (const sc of p.scenes) {
        const loc = p.locations.find((l) => l.name.toLowerCase() === (sc.location || '').toLowerCase())
        if (!loc || !todo(sc).length || loc.pictures.some((f) => fs.existsSync(f))) continue
        const file = await this.drawPlace(images, drawer, p, loc, sc).catch(() => null)
        if (file) p = this.patch(id, (q) => (q.locations.find((l) => l.id === loc.id).pictures = [file]))
      }
    const made = []
    for (const sc of p.scenes)
      for (const [i, sh] of sc.shots.entries()) {
        if (!todo(sc).includes(sh)) continue
        const loc = p.locations.find((l) => l.name.toLowerCase() === (sc.location || '').toLowerCase())
        const people = editor ? this.onScreen(p, sh) : []
        const place = loc?.pictures?.find((f) => fs.existsSync(f)) || null
        const refs = editor ? [...people.map((x) => x.face), place].filter(Boolean) : []
        const prompt =
          sketchPrompt({ action: sh.action, camera: sh.camera, place: loc?.name || sc.location, time: sc.time, description: loc?.description, look: p.look?.notes, faces: people.map((x) => x.ch.name), staging: sh.staging }) +
          (place && refs.length ? ` The place looks like picture ${refs.length}.` : '')
        const fam = refs.length ? editor : drawer
        const rec = await images.create({ mode: refs.length ? 'edit' : 'generate', model: fam.models[0], prompt, aspect: p.aspect, megapixels: 0.5, count: 1, refs, keepAspect: true, name: `${p.name} · ${sc.location || 'scene'} · ${i + 1}`, tag: `film:${p.id}` })
        this.patch(id, (q) => Object.assign(this.find(q, sh.id).sh, { sketchSet: rec.id, sketch: null }))
        made.push({ shot: sh.id, set: rec.id })
      }
    return made
  }
  // Draws the empty place in the film's frame and waits for it (about 20 s). Returns the picture file.
  async drawPlace(images, fam, p, loc, sc) {
    const rec = await images.create({ mode: 'generate', model: fam.models[0], prompt: placePrompt({ place: loc.name, time: sc.time, description: loc.description, look: p.look?.notes }), aspect: p.aspect, megapixels: 0.5, count: 1, name: `${p.name} · ${loc.name}`, tag: `film:${p.id}` })
    for (const end = Date.now() + 600e3; Date.now() < end; await new Promise((r) => setTimeout(r, 2000))) {
      const r = await images.get(rec.id)
      if (r.files?.length) return r.files[0]
      if (['error', 'cancelled'].includes(r.status)) throw new Error(r.error || 'The place picture failed.')
    }
    throw new Error('The place picture took too long.')
  }
  // A shot's finished sketch becomes its picture (shot.sketch); a failed one is dropped so it can be redone.
  async refreshSketches(p) {
    const images = this.images()
    if (!images) return p
    for (const sc of p.scenes)
      for (const sh of sc.shots) {
        if (!sh.sketchSet || sh.sketch) continue
        const rec = await images.get(sh.sketchSet).catch(() => null)
        if (!rec || ['error', 'cancelled'].includes(rec.status)) {
          this.patch(p.id, (q) => (this.find(q, sh.id).sh.sketchSet = null))
          sh.sketchSet = null
        } else if (rec.files?.length) {
          this.patch(p.id, (q) => (this.find(q, sh.id).sh.sketch = rec.files[0]))
          sh.sketch = rec.files[0]
        } else sh.sketching = rec.status === 'running' ? 'drawing' : 'waiting'
      }
    return p
  }

  // Hunts previews for a shot (an ordinary IV Studio shot: it shows in Shots too).
  // With voice (the default), a line its character has a voice for is said first, so the shot lip-syncs to it;
  // if the voice engine can't, the shot renders with H3's own voice. With fromSketch (the default) a shot that
  // has a sketch opens exactly on it (Frames mode), so the film keeps the storyboard's framing and faces.
  async render(id, shotId, opts = {}) {
    if (this.filming.has(id)) throw new Error('This film is already being filmed. Wait for its lines to be said.')
    const { sh } = this.find(this.get(id), shotId)
    if (!sh.prompt.trim()) throw new Error('This shot has no prompt yet. Write it first.')
    return (await this.filmShots(id, [shotId], opts))[0]
  }
  // A line its character has a voice for is said first (voice), while the shot shows "Saying the line".
  needsLine(sh, voice = true) {
    return voice && !!sh.line && !sh.voiceLine && !!this.character(sh.character)?.voiceId && !!this.voices()
  }
  // Every line is said before any shot renders: a render stops the voice engine to free the GPU, so saying
  // and rendering in turn would load the voice models again for every shot. Until then the shots show as
  // speaking or queued, and a second Film it is refused.
  async filmShots(id, shotIds, { voice = true, ...opts } = {}) {
    const run = { speaking: null, waiting: new Set(shotIds) }
    this.filming.set(id, run)
    this.onChange(id)
    try {
      for (const shotId of shotIds) {
        if (!this.needsLine(this.find(this.get(id), shotId).sh, voice)) continue
        run.speaking = shotId
        this.onChange(id)
        await this.speak(id, shotId).catch(() => {}) // without the voice engine, H3 voices the line itself
      }
      run.speaking = null
      const jobs = []
      for (const shotId of shotIds) {
        jobs.push(await this.queueShot(id, shotId, opts))
        run.waiting.delete(shotId)
      }
      return jobs
    } finally {
      this.filming.delete(id)
      this.onChange(id)
    }
  }
  async queueShot(id, shotId, { previews = 3, seed, fromSketch = true, room: useRoom = true, previs: usePrevis = true } = {}) {
    const studio = this.studio()
    const p = this.get(id)
    const { sc, sh } = this.find(p, shotId)
    let projectId = sh.projectId
    try {
      if (projectId) studio.getProject(projectId)
    } catch {
      projectId = null
    }
    if (!projectId) {
      const n = sc.shots.indexOf(sh) + 1
      const shot = studio.createProject(`${p.name} · ${sc.location || sc.heading} · ${n}`)
      projectId = shot.id
      this.patch(id, (q) => (this.find(q, shotId).sh.projectId = projectId))
    }
    const seconds = sh.voiceLine ? Math.min(15, Math.max(sh.seconds, Math.ceil(sh.voiceLine.duration + 0.5))) : sh.seconds
    const sketch = fromSketch && sh.sketch && fs.existsSync(sh.sketch) ? sh.sketch : null
    // with a picture of the place too, reference to video keeps the room the same however the camera moves
    const loc = p.locations.find((l) => l.name.toLowerCase() === (sc.location || '').toLowerCase())
    const room = sketch && useRoom ? loc?.pictures?.find((f) => fs.existsSync(f)) : null
    const said = sh.line ? sh.prompt : withSilence(sh.prompt)
    // a staged shot whose camera moves or whose people walk films from its previs: H3 follows a previs's camera
    // path and framing much better than the same move in words
    const moving = usePrevis && sh.stage?.camera && ((sh.stage.camera.move || 'static') !== 'static' || sh.stage.people?.some((x) => x.to))
    const clip = moving && this.previs() ? await this.previs().make({ stage: sh.stage, seconds, aspect: p.aspect, name: `${p.name} ${sc.shots.indexOf(sh) + 1}` }).catch(() => null) : null
    const reference = room || clip
    // the shot's character comes from its LoRA; anyone else in the cast on screen comes from their face picture
    const others = reference ? this.onScreen(p, sh).filter((x) => x.ch.id !== sh.character) : []
    const job = await studio.generatePreviews({
      projectId,
      mode: reference ? 'reference' : sketch ? 'frames' : 'text',
      prompt: reference ? withRoom(said, { place: loc?.name, description: loc?.description, people: others.map((x) => x.ch.name.split(/\s+/)[0]), sketch: !!sketch, room: !!room, previs: clip ? sh.stage : null }) : sketch ? asFirstFrame(said) : said,
      media: reference
        ? [...(sketch ? [{ kind: 'picture', file: sketch }] : []), ...(room ? [{ kind: 'picture', file: room }] : []), ...others.map((x) => ({ kind: 'picture', file: x.face })), ...(clip ? [{ kind: 'video', file: clip.file, hasAudio: false }] : [])]
        : sketch
          ? [{ kind: 'picture', file: sketch }]
          : [],
      character: sh.character || 'none',
      seconds,
      aspect: p.aspect,
      megapixels: 0.4,
      previews,
      extraLoras: p.look?.loras || [],
      voiceLine: sh.voiceLine?.file || null,
      seed: seed ?? Math.floor(Math.random() * 1e9)
    })
    this.patch(id, (q) => Object.assign(this.find(q, shotId).sh, { filmedFrom: sketch ? 'sketch' : 'prompt', previs: clip?.file || null }))
    return job
  }
  // Previews for every shot in a scene (or, with no sceneId, the whole film) that has a prompt and nothing
  // rendered yet.
  async renderScene(id, sceneId, opts = {}) {
    const p = this.get(id)
    const scenes = sceneId ? p.scenes.filter((s) => s.id === sceneId) : p.scenes
    if (!scenes.length) throw new Error('No such scene.')
    if (this.filming.has(id)) throw new Error('This film is already being filmed. Wait for its lines to be said.')
    const ids = scenes.flatMap((sc) => sc.shots.filter((sh) => sh.prompt.trim() && !sh.projectId).map((sh) => sh.id))
    return ids.length ? this.filmShots(id, ids, opts) : []
  }
  // Finishes preview n of the shot's latest hunt (2 MP; with the voice line as its sound when it has one).
  async finish(id, shotId, candidate = 1, { megapixels = 2, upscale2x = false } = {}) {
    const p = this.get(id)
    const { sh } = this.find(p, shotId)
    const st = this.shotState(sh)
    if (!st.previewsJob || st.previewsStatus !== 'success') throw new Error('Render its previews first.')
    const job = await this.studio().finishCandidate({ jobId: st.previewsJob, candidate: Number(candidate), megapixels, upscale2x, fps: 0, audio: sh.voiceLine ? 'voice' : 'pass' })
    this.onChange(id)
    return job
  }

  // Where a shot is: its newest hunt and newest finish, read from the shot's jobs.
  shotState(sh) {
    if (!sh.projectId) return { status: sh.prompt ? 'ready' : 'draft' }
    const studio = this.studio()
    let jobs = []
    try {
      jobs = studio.listJobs(sh.projectId)
    } catch {
      return { status: sh.prompt ? 'ready' : 'draft' }
    }
    const last = (kind) => jobs.filter((j) => j.kind === kind).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
    const pv = last('previews')
    const fin = last('finish')
    const out = { previewsJob: pv?.id || null, previewsStatus: pv?.status || null, finishJob: fin?.id || null, finishStatus: fin?.status || null }
    out.candidates = pv?.status === 'success' ? (pv.outputs || []).filter((o) => o.kind === 'preview').map((o) => ({ n: o.candidate, url: o.url, path: o.path })) : []
    const finalOut = fin?.status === 'success' ? (fin.outputs || []).find((o) => o.kind === 'final') || (fin.outputs || []).find((o) => /before_dlss$/.test(o.kind)) : null
    if (finalOut) out.final = { url: finalOut.url, path: finalOut.path }
    if (fin && fin.parent === pv?.id) out.picked = fin.plan?.finish?.candidate || null
    out.status = finalOut ? 'finished' : fin && !DONE.includes(fin.status) ? 'finishing' : pv && !DONE.includes(pv.status) ? 'rendering' : pv?.status === 'success' ? 'pick' : pv?.status === 'error' || fin?.status === 'error' ? 'error' : 'ready'
    out.error = fin?.status === 'error' ? fin.error : pv?.status === 'error' ? pv.error : null
    return out
  }
  // Moves unfinished jobs on (asks ComfyUI) and returns the production with each shot's state.
  async view(id) {
    const p = await this.refreshSketches(this.get(id))
    const studio = this.studio()
    for (const sc of p.scenes)
      for (const sh of sc.shots)
        if (sh.projectId)
          for (const j of studio.listJobs(sh.projectId))
            if (!DONE.includes(j.status)) await studio.refreshJob(j.id).catch(() => {})
    const run = this.filming.get(id)
    const stateOf = (sh) => (run?.speaking === sh.id ? { status: 'speaking' } : run?.waiting.has(sh.id) && !sh.projectId ? { status: 'queued' } : this.shotState(sh))
    const scenes = p.scenes.map((sc) => ({ ...sc, shots: sc.shots.map((sh) => ({ ...sh, state: stateOf(sh) })) }))
    const all = scenes.flatMap((s) => s.shots)
    const count = (st) => all.filter((s) => s.state.status === st).length
    return {
      ...p,
      step: p.step || (all.length ? 'board' : p.scenes.length ? 'cast' : 'idea'),
      writing: this.writing.has(id),
      filming: run ? { speaking: run.speaking, waiting: run.waiting.size } : null,
      scenes,
      totals: { shots: all.length, seconds: all.reduce((n, s) => n + s.seconds, 0), finished: count('finished'), pick: count('pick'), rendering: count('rendering') + count('finishing') + count('speaking') + count('queued'), speaking: count('speaking') + count('queued'), ready: count('ready'), draft: count('draft'), sketched: all.filter((s) => s.sketch).length, sketching: all.filter((s) => s.sketchSet && !s.sketch).length }
    }
  }

  // ---------- the cut ----------
  // Every shot in script order on V1 of the project's edit (made the first time; V1 is replaced on a rebuild,
  // other tracks stay): the finished take, else the picked or first preview. Returns { editId, placed, missing }.
  async roughCut(id) {
    const v = await this.view(id)
    let e
    try {
      e = v.editId ? this.edits.get(v.editId) : null
    } catch {
      e = null
    }
    if (!e) e = this.edits.create(`${v.name} · rough cut`)
    e.settings = { ...e.settings, format: FORMAT_FOR[v.aspect] || '1080p', fps: 24 }
    const media = { ...e.media }
    const ops = [...e.clips.filter((c) => c.track === 'V1').map((c) => ({ op: 'remove_clip', clip: c.id }))]
    const missing = []
    let at = 0
    let placed = 0
    for (const sc of v.scenes)
      for (const sh of sc.shots) {
        const st = sh.state
        const src = st.final || (st.candidates?.length ? st.candidates.find((c) => c.n === (st.picked || 1)) || st.candidates[0] : null)
        if (!src) {
          missing.push({ scene: sc.heading, shot: sh.id, status: st.status })
          continue
        }
        const file = await this.localCopy(src)
        let m = Object.values(media).find((x) => x.path === file)
        if (!m) {
          m = await this.edits.addMedia(file, { type: 'iv', label: `${sc.location || sc.heading} · ${sh.action.slice(0, 40)}`, production: v.id })
          media[m.id] = m
        }
        ops.push({ op: 'add_clip', media: m.id, track: 'V1', start: at, in: 0, out: m.duration })
        at += m.duration
        placed++
      }
    const r = applyOps({ ...e, media }, ops)
    Object.assign(e, { clips: r.clips, media: r.media, tracks: r.tracks, markers: r.markers })
    this.edits.write(e)
    this.patch(id, (q) => (q.editId = e.id))
    return { editId: e.id, placed, missing, seconds: +at.toFixed(2) }
  }
}
