// Freefield's apps (github.com/neuregex/freefield, MIT, Sammir Femat), run by IV Studio. Each app is a ComfyUI API
// workflow with a manifest that says which node and field each input fills (resources/workflows/freefield/<app>/,
// copied unchanged at the commit in COMMIT). IV Studio fills them in from its own windows (the editor's right-click,
// Workflows → Effects) and its MCP tools, swaps in this PC's own builds of models it already has under other names,
// runs the job and copies the results into the data folder.
import fs from 'node:fs'
import path from 'node:path'
import { comboOptions } from './setup.js'
import { resolveModel } from './setup.js'

// What IV Studio offers, and which Freefield app each runs.
export const CLIP_FX = {
  reshoot: { app: 'reshoot', label: 'New angle', what: 'The same clip filmed from another angle (MiniMax H3 + MoGe + CrossView)', media: 'video' },
  dub: { app: 'dub', label: 'Dub', what: 'The person says new words, in any language, with new lip movement (LTX-2.5 + DubIt)', media: 'video' },
  cleanplate: { app: 'vfx-clean-plate', label: 'Clean plate', what: 'People and moving things taken out, the background rebuilt (LTX-2.5)', media: 'video' },
  night: { app: 'vfx-day-to-night', label: 'Day to night', what: 'The same shot at night (LTX-2.5)', media: 'video' },
  water: { app: 'vfx-water', label: 'Add water', what: 'Simulated water that follows the scene (LTX-2.5)', media: 'video' },
  hdr: { app: 'sdr-hdr', label: 'SDR to HDR', what: 'A 10-bit HLG HDR master and a tone-mapped preview (LTX-2.5)', media: 'video' },
  removebg: { app: 'video-remove-bg', label: 'Remove background', what: 'The subject over a solid colour, and its matte (BiRefNet)', media: 'video' },
  smooth: { app: 'smooth', label: 'Smooth or slow motion', what: 'In-between frames: smoother at the same length, or real slow motion (FILM)', media: 'video' },
  effects: { app: 'effects', label: 'Effects', what: 'A photo becomes a 5-second effect clip (Wan 2.1 + effect LoRAs)', media: 'image' },
  morph: { app: 'morph', label: 'Transformations', what: 'A photo morphs into a new version of itself, keeping the face (Flux 3 Klein + LTX-2.5)', media: 'image' },
  transitions: { app: 'transitions', label: 'Transition', what: 'A first frame morphs into a last frame (LTX-2.5)', media: 'image' }
}

// Freefield's model files that this PC may have as another build: the manifest id IV Studio resolves it through.
const SAME_AS = [
  [/^qwen3vl_32b_minimax_h3_/, 'text_encoder'],
  [/^minimax_h3_video_vae_/, 'video_vae'],
  [/^minimax_h3_audio_vae_/, 'audio_vae'],
  [/^minimax_h3_ref2va_/, 'ref2va'],
  [/^minimax_h3_fl2va_/, 'fl2va']
]
// and ones matched by a pattern against what ComfyUI lists (Flux 3 Klein's int8 or fp8 builds)
const SAME_LIKE = [
  [/^qwen3vl_4b_/, /^qwen3vl_4b_/i],
  [/^flux3-image-klein/, /flux3.*klein/i]
]
const MODEL_FILE = /\.(safetensors|gguf|pt|pth|ckpt|bin|onnx)$/i
const base = (p) => String(p).replace(/\\/g, '/').split('/').pop()

export function loadApp(resourcesDir, id) {
  const dir = path.join(resourcesDir, 'workflows', 'freefield', id)
  const app = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'))
  const graph = JSON.parse(fs.readFileSync(path.join(dir, app.workflow || 'workflow.api.json'), 'utf8'))
  return { app, graph }
}

// Fill a workflow from values { inputId: value }: each input's bind sets node.field (a template puts it into a
// sentence: "crossview. {prompt}"). Select inputs take one of their options' values. Seeds of -1 become random.
export function fillGraph(app, graph, values = {}) {
  const g = JSON.parse(JSON.stringify(graph))
  for (const input of app.inputs || []) {
    let v = values[input.id] !== undefined ? values[input.id] : input.default
    if (v === undefined) continue
    if (input.type === 'seed' && (v === -1 || v === '' || v == null)) v = Math.floor(Math.random() * 2 ** 31)
    if (input.type === 'select' && input.options && !input.options.some((o) => o.value === v)) throw new Error(`${input.label || input.id} is one of: ${input.options.map((o) => o.label || o.value).join(', ')}.`)
    if (input.type === 'slider' && (Number(v) < input.min || Number(v) > input.max)) throw new Error(`${input.label || input.id} is ${input.min} to ${input.max}.`)
    for (const b of input.bind || []) {
      const node = g[b.node]
      if (!node) throw new Error(`${app.id}: no node ${b.node} for ${input.id}`)
      let val = input.type === 'slider' || input.type === 'seed' ? Number(v) : v
      if (b.template) val = b.template.replace(/\{(\w+)\}/g, (_, k) => (k === input.id ? String(v) : String(values[k] ?? app.inputs.find((i) => i.id === k)?.default ?? '')))
      node.inputs[b.field] = val
    }
  }
  return g
}

// Every model file a workflow names that this ComfyUI doesn't list, swapped for this PC's build of the same model
// where IV Studio knows one. Returns { graph, missing: [file] }.
export function swapModels(graph, info, manifest) {
  const g = JSON.parse(JSON.stringify(graph))
  const missing = []
  for (const node of Object.values(g)) {
    for (const [field, v] of Object.entries(node.inputs || {})) {
      if (typeof v !== 'string' || !MODEL_FILE.test(v)) continue
      const opts = comboOptions(info, node.class_type, field)
      if (!opts) continue
      if (opts.includes(v) || opts.some((o) => base(o) === base(v))) {
        node.inputs[field] = opts.includes(v) ? v : opts.find((o) => base(o) === base(v))
        continue
      }
      const id = SAME_AS.find(([re]) => re.test(base(v)))?.[1]
      const m = id && manifest.models.find((x) => x.id === id)
      const r = m && resolveModel(m, opts)
      const like = SAME_LIKE.find(([re]) => re.test(base(v)))?.[1]
      const alt = r?.file || (like && opts.find((o) => like.test(base(o))))
      if (alt) node.inputs[field] = alt
      else missing.push(base(v))
    }
  }
  return { graph: g, missing: [...new Set(missing)] }
}

const slug = (s) => String(s || 'clip').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'clip'

export class FreefieldApps {
  // studio: () => Studio. resourcesDir: the app's resources folder.
  constructor({ resourcesDir, dataDir, studio }) {
    this.resourcesDir = resourcesDir
    this.dir = path.join(dataDir, 'clipfx')
    this.studio = studio
  }

  runsFile = () => path.join(this.dir, 'runs.json')
  runs() {
    try {
      return JSON.parse(fs.readFileSync(this.runsFile(), 'utf8'))
    } catch {
      return []
    }
  }
  record(r) {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(this.runsFile(), JSON.stringify([r, ...this.runs().filter((x) => x.id !== r.id)].slice(0, 500), null, 1))
  }
  deleteRun(id) {
    const r = this.runs().find((x) => x.id === id)
    if (!r) throw new Error(`No run ${id}.`)
    for (const f of r.files || []) fs.rmSync(f.file, { force: true })
    fs.writeFileSync(this.runsFile(), JSON.stringify(this.runs().filter((x) => x.id !== id), null, 1))
    return { deleted: id }
  }

  meta(fx) {
    const spec = CLIP_FX[fx]
    if (!spec) throw new Error(`Unknown effect "${fx}". One of: ${Object.keys(CLIP_FX).join(', ')}.`)
    const { app } = loadApp(this.resourcesDir, spec.app)
    return { fx, ...spec, name: app.name, summary: app.summary, inputs: app.inputs, outputs: app.outputs, models: app.models, nodes: (app.custom_nodes || []).map((n) => n.repo) }
  }

  // Whether this ComfyUI can run it: missing node classes and model files.
  async status(fx) {
    const spec = CLIP_FX[fx]
    const studio = this.studio()
    if (studio.comfy.remote && !studio.comfy.hosted) return { fx, ready: false, remote: true }
    const info = await studio.comfy.objectInfo()
    const { graph } = loadApp(this.resourcesDir, spec.app)
    const missingNodes = [...new Set(Object.values(graph).map((n) => n.class_type).filter((c) => !info[c]))]
    const { missing } = swapModels(graph, info, studio.manifest)
    return { fx, ready: !missingNodes.length && !missing.length, missingNodes, missingModels: missing }
  }

  async statusAll() {
    const out = {}
    for (const fx of Object.keys(CLIP_FX)) out[fx] = await this.status(fx).catch((err) => ({ fx, ready: false, error: err.message }))
    return out
  }

  // Runs one: file (a video or a picture on this PC), last (transitions: the last frame), values (the app's inputs).
  // Resolves when ComfyUI finishes, with { files: [{ label, file, kind }] } copied into clipfx/.
  async run({ fx, file, last = null, values = {}, name, onProgress = () => {} }) {
    const spec = CLIP_FX[fx]
    if (!spec) throw new Error(`Unknown effect "${fx}".`)
    if (!file || !fs.existsSync(file)) throw new Error(spec.media === 'image' ? 'Pick a picture.' : 'Pick a clip.')
    const studio = this.studio()
    if (studio.comfy.remote) throw new Error(`${spec.label} runs on this PC’s ComfyUI.`)
    const { app, graph } = loadApp(this.resourcesDir, spec.app)
    const info = await studio.comfy.objectInfo()
    const missingNodes = [...new Set(Object.values(graph).map((n) => n.class_type).filter((c) => !info[c]))]
    if (missingNodes.length) throw new Error(`${spec.label} needs ComfyUI nodes this one doesn’t have (${missingNodes.slice(0, 4).join(', ')}). Install missing node packs on Setup, then restart ComfyUI.`)
    // the media inputs: the first video or image input takes the file, a second image input the last frame
    const vals = { ...values }
    const media = (app.inputs || []).filter((i) => i.type === 'video' || i.type === 'image')
    if (!media.length) throw new Error(`${spec.label} takes no picture or clip.`)
    vals[media[0].id] = await studio.comfy.upload(file, 'iv_studio/clipfx')
    if (media[1]) {
      if (!last || !fs.existsSync(last)) throw new Error(`${spec.label} needs a ${media[1].label?.toLowerCase() || 'second picture'} too.`)
      vals[media[1].id] = await studio.comfy.upload(last, 'iv_studio/clipfx')
    }
    const filled = fillGraph(app, graph, vals)
    const { graph: g, missing } = swapModels(filled, info, studio.manifest)
    if (missing.length) throw new Error(`${spec.label} needs ${missing.join(', ')}. Download on Setup.`)
    const stamp = Date.now().toString(36)
    const title = String(name || '').trim() || `${spec.label} · ${path.basename(file).replace(/\.[^.]+$/, '')}`.slice(0, 60)
    // every Save node writes under IV Studio's own folder in ComfyUI's output
    for (const n of Object.values(g)) if (n.inputs && 'filename_prefix' in n.inputs) n.inputs.filename_prefix = `iv_studio/clipfx/${slug(title)}_${stamp}`
    const job = await studio.submitGraph({ kind: `clipfx:${fx}`, graph: g, name: title, plan: { clipfx: { fx, app: spec.app, from: file, outputs: app.outputs } } })
    const run = { id: `${fx}_${stamp}`, fx, label: spec.label, title, from: file, ...(last ? { last } : {}), values, jobId: job.id, status: 'running', files: [], createdAt: new Date().toISOString() }
    this.record(run)
    let j = job
    for (const end = Date.now() + 60 * 60e3; Date.now() < end; await new Promise((r) => setTimeout(r, 3000))) {
      j = await studio.refreshJob(job.id)
      onProgress(j)
      if (['success', 'error', 'cancelled'].includes(j.status)) break
    }
    if (j.status !== 'success') {
      this.record({ ...run, status: 'error', error: j.error || j.status })
      throw new Error(j.error || `${spec.label} ${j.status || 'took too long'}.`)
    }
    fs.mkdirSync(this.dir, { recursive: true })
    const files = []
    for (const o of j.outputs || []) {
      const src = await studio.localCopy(o, path.join(this.dir, '_comfy'))
      if (!src || !fs.existsSync(src)) continue
      const label = app.outputs?.find((x) => String(x.node) === String(o.node))?.label || (o.kind === 'image' ? 'Picture' : 'Video')
      const dest = path.join(this.dir, `${slug(title)}_${stamp}_${slug(label)}${path.extname(src)}`)
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
      if (path.dirname(src) === path.join(this.dir, '_comfy')) fs.rmSync(src, { force: true })
      files.push({ label, file: dest, kind: /\.(png|jpe?g|webp)$/i.test(dest) ? 'image' : 'video' })
    }
    if (!files.length) throw new Error(`${spec.label} finished but saved nothing.`)
    // the app's first output is the result; others (a matte, a warp guide) follow
    const order = (app.outputs || []).map((x) => x.label)
    files.sort((a, b) => (order.indexOf(a.label) + 99) % 99 - (order.indexOf(b.label) + 99) % 99)
    this.record({ ...run, status: 'success', files, seconds: j.seconds, finishedAt: new Date().toISOString() })
    return { fx, id: run.id, title, jobId: job.id, files }
  }
}
