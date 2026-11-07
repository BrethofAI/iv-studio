import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Characters as RefMods: a RefMod is a small file of H3 reference tokens (pictures and, optionally, a voice) made by
// the ComfyUI-MiniMaxH3Mod pack (MIT, Luisa) and saved under ComfyUI's models/refmods. A RefMod character goes into
// a shot as RefMod 1 (plan.js) instead of loading a character LoRA, and {char} becomes its name.
//
// Making one is Matt's "RefMod Creator" workflow as IV Studio's own graph: up to six pictures (and a voice clip of
// up to 15 seconds) through "Create H3 RefMod Master" with the settings his notes give for a character (Full
// Reference, 768 px, pool 8×8, one latent frame for pictures, 100 refinement steps, 2048 tokens), saved as one
// bundle: models/refmods/characters/<name>.safetensors. On a 4090 a one-picture RefMod takes about 13 seconds.
export const REFMOD_FOLDER = 'characters'
export const MAX_PICTURES = 6
export const MAX_AUDIO_SECONDS = 15
const DONE = ['success', 'error', 'cancelled']
const VIDEO_VAES = [/^minimax_h3_video_vae_fp16/i, /^minimax_h3_video_vae/i]
const AUDIO_VAES = [/^minimax_h3_audio_vae/i]

export const slugName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'character'

// What the RefMod stores as its prompt hint (the workflow's subject definition, for the person's description).
export const subjectHint = (who) =>
  `subject_definitions:\n<Subject 1> is ${String(who || 'a person').trim()}, defined by <RefMod 1>\n<RefMod 1> provides the complete visual identity, appearance, face, body, clothing${'{voice}'} for <Subject 1>.`

// The graph: LoadImage per picture, the H3 video VAE, an optional voice through the audio VAE, and the master
// node, which saves the bundle itself. Node ids are plain numbers, as in every IV Studio graph.
export function refmodGraph({ name, subfolder = REFMOD_FOLDER, pictures, audio = null, description = '', vae, audioVae = null }) {
  if (!pictures?.length) throw new Error('A RefMod needs at least one picture.')
  const g = {}
  pictures.slice(0, MAX_PICTURES).forEach((p, i) => (g[String(i + 1)] = { class_type: 'LoadImage', inputs: { image: p } }))
  g['10'] = { class_type: 'VAELoader', inputs: { vae_name: vae } }
  const master = {
    vae: ['10', 0],
    name,
    mode: 'Full Reference',
    concept_type: 'identity',
    background_retention: 0,
    ref_resolution: 768,
    pool_h: 8,
    pool_w: 8,
    latent_frames: 1,
    identity: 100,
    merge: false,
    motion_only: false,
    multiplier: 1,
    max_tokens: 2048,
    description: description.replace('{voice}', audio ? ', voice timbre and accent' : ''),
    save: true,
    audio_max_seconds: MAX_AUDIO_SECONDS,
    audio_max_tokens: 2048,
    audio_budget_policy: 'truncate',
    audio_concept_type: 'voice',
    max_total_tokens: 0,
    extraction_preset: 'manual',
    subfolder,
    budget_policy: 'truncate',
    save_layout: 'bundle'
  }
  pictures.slice(0, MAX_PICTURES).forEach((_, i) => (master[`refs_image.ref_image_${i}`] = [String(i + 1), 0]))
  if (audio) {
    if (!audioVae) throw new Error('A voice needs the H3 audio VAE in ComfyUI.')
    g['20'] = { class_type: 'LoadAudio', inputs: { audio } }
    g['21'] = { class_type: 'VAELoader', inputs: { vae_name: audioVae } }
    master.audio = ['20', 0]
    master.audio_vae = ['21', 0]
  }
  g['30'] = { class_type: 'MiniMaxH3RefModMasterExtract', inputs: master }
  return g
}

const comboOf = (info, cls, input) => {
  const spec = info?.[cls]?.input?.required?.[input] || info?.[cls]?.input?.optional?.[input]
  return (Array.isArray(spec?.[0]) ? spec[0] : spec?.[1]?.options) || []
}

export class RefMods {
  // studio: the Studio (its ComfyUI, jobs and characters). dataDir: IV Studio's data folder (faces are kept there).
  constructor({ studio, dataDir }) {
    this.studio = studio
    this.dir = path.join(dataDir, 'faces')
    this.making = new Map() // id -> { name, startedAt, status }
  }

  // Every RefMod ComfyUI can load, as the loader names them ("characters/tess_visual").
  async list() {
    return (await this.studio.choices()).refmods || []
  }

  // Whether this ComfyUI can make RefMods, and with which VAEs.
  async ready() {
    const info = await this.studio.comfy.objectInfo().catch(() => null)
    if (!info?.MiniMaxH3RefModMasterExtract) return { ready: false, why: 'This ComfyUI has no "Create H3 RefMod Master" node. Install the ComfyUI-MiniMaxH3Mod pack from Settings → Setup.' }
    const vaes = comboOf(info, 'VAELoader', 'vae_name')
    const vae = VIDEO_VAES.map((rx) => vaes.find((v) => rx.test(v.split(/[\\/]/).pop()))).find(Boolean)
    const audioVae = AUDIO_VAES.map((rx) => vaes.find((v) => rx.test(v.split(/[\\/]/).pop()))).find(Boolean) || null
    if (!vae) return { ready: false, why: 'ComfyUI has no MiniMax H3 video VAE. Download it from Settings → Setup.' }
    return { ready: true, vae, audioVae }
  }

  // Makes a RefMod from pictures (and an optional voice clip) and saves it as a character. who: a few words for
  // the person ("a woman in her thirties"), kept as the RefMod's prompt hint. Waits for ComfyUI (seconds to a
  // couple of minutes) and returns { character, refmod, seconds }.
  async make({ name, pictures = [], audio = null, who = '', consent = false, onStatus } = {}) {
    if (!String(name || '').trim()) throw new Error('Give the character a name.')
    if (!consent) throw new Error('Tick that these are your own pictures, an invented person, or someone who agreed to it.')
    const pics = pictures.filter(Boolean)
    if (!pics.length) throw new Error('Add at least one picture of the person.')
    if (pics.length > MAX_PICTURES) throw new Error(`At most ${MAX_PICTURES} pictures.`)
    for (const p of [...pics, audio].filter(Boolean)) if (!fs.existsSync(p)) throw new Error(`No file at ${p}.`)
    const can = await this.ready()
    if (!can.ready) throw new Error(can.why)
    if (audio && !can.audioVae) throw new Error('A voice needs the H3 audio VAE in ComfyUI (Settings → Setup).')

    const id = randomUUID().slice(0, 6)
    const file = `${slugName(name)}_${id}`
    const status = (s) => (this.making.set(id, { name, startedAt: this.making.get(id)?.startedAt || Date.now(), status: s }), onStatus?.(s))
    status('Uploading the pictures')
    const uploaded = []
    for (const p of pics) uploaded.push(await this.studio.comfy.upload(p, 'iv_studio/refmods'))
    const voice = audio ? await this.studio.comfy.upload(audio, 'iv_studio/refmods') : null
    const graph = refmodGraph({ name: file, pictures: uploaded, audio: voice, description: subjectHint(who), vae: can.vae, audioVae: can.audioVae })
    const project = this.studio.createProject(`RefMod · ${name}`, null, null, 'refmod')
    status('Making the RefMod')
    const job = await this.studio.submitGraph({ kind: 'refmod', graph, projectId: project.id, name, plan: { refmod: true, request: { prompt: '' } } })
    const t0 = Date.now()
    let j = job
    while (!DONE.includes(j.status)) {
      if (Date.now() - t0 > 20 * 60 * 1000) throw new Error('The RefMod took over 20 minutes; check ComfyUI.')
      await new Promise((r) => setTimeout(r, 1500))
      j = await this.studio.refreshJob(job.id)
      if (j.status === 'queued' && j.queuePosition) status(`Waiting · ${j.queuePosition} in ComfyUI's queue`)
      else if (j.status === 'running') status('Making the RefMod')
    }
    this.making.delete(id)
    if (j.status !== 'success') throw new Error(j.error || `The RefMod ${j.status}.`)
    const refmod = `${REFMOD_FOLDER}/${file}`
    // the loader lists the refmods folder each time ComfyUI is asked, so the new one should be there now
    const names = await this.list().catch(() => [])
    if (names.length && !names.includes(refmod)) throw new Error(`ComfyUI made the RefMod but its loader doesn't list ${refmod} yet. Restart ComfyUI, then add it on Characters with "Add from a LoRA or RefMod".`)

    // the character: its face is the first picture, kept in IV Studio's data
    fs.mkdirSync(this.dir, { recursive: true })
    const face = path.join(this.dir, `${file}${path.extname(pics[0]) || '.png'}`)
    fs.copyFileSync(pics[0], face)
    const character = { id: `char${Date.now().toString(36)}`, name: String(name).trim(), refmod, strength: 1, trigger: '', picture: face, who: String(who || '').trim() }
    this.studio.saveCharacters([...this.studio.characters(), character])
    return { character, refmod, seconds: Math.round((Date.now() - t0) / 1000) }
  }
}
