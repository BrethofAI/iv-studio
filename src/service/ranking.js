// Ranks a previews job's takes (agentY's output checks, done IV Studio's way): each take is scored on what can be
// measured and the best is marked, with the reasons in words.
//   words     every spoken line heard back (the voice engine's Whisper), when the prompt has lines; squared,
//             because a take that drops part of its line is rarely usable however good it looks
//   likeness  the picked character's face against its face picture (InsightFace through Shinobi's Python)
//   motion    no frozen stretches (ffmpeg freezedetect)
//   sharpness the least blurred of the takes (ffmpeg blurdetect), relative to the others
// Picks teach it: each part's weight moves towards what the person keeps choosing (rank-weights.json).
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

export const DEFAULT_WEIGHTS = { words: 4, likeness: 2, motion: 1.5, sharpness: 1 }
const PARTS = Object.keys(DEFAULT_WEIGHTS)

// Numbers as words, so "20 minutes" (Whisper) matches "twenty minutes" (the prompt), up to 9999.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
export function numberWords(n) {
  if (n < 20) return ONES[n]
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`
  return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`
}
const words = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\d+/g, (d) => (d.length <= 4 ? ` ${numberWords(Number(d))} ` : d))
    .replace(/\ba (hundred|thousand)\b/g, 'one $1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && w !== 'and')
// How much of the wanted words were heard (0..1), lightly marked down when much more was said than written.
export function heardScore(want, heard) {
  const w = words(want)
  const got = words(heard)
  if (!w.length) return null
  const left = [...got]
  let n = 0
  for (const x of w) {
    const i = left.indexOf(x)
    if (i >= 0) (n++, left.splice(i, 1))
  }
  const extra = Math.max(0, got.length - w.length * 1.5) / Math.max(1, w.length)
  return Math.max(0, n / w.length - Math.min(0.3, extra * 0.15))
}
export const spokenLines = (prompt) => [...String(prompt || '').matchAll(/<d>\s*(?:\[[^\]]+\])?\s*([\s\S]*?)<\/d>/g)].map((m) => m[1].trim()).filter(Boolean)

// The parts -> one score, over the parts that could be measured; with the best take's reasons.
export function combine(takes, weights = DEFAULT_WEIGHTS) {
  const scored = takes.map((t) => {
    let sum = 0
    let wsum = 0
    for (const p of PARTS) if (t.parts[p] != null) (sum += t.parts[p] * weights[p], (wsum += weights[p]))
    return { ...t, score: wsum ? +(sum / wsum).toFixed(3) : null }
  })
  // the best only when it stands out: takes within 0.02 of each other are a tie, and a tie has no winner
  const [best, next] = scored.filter((t) => t.score != null).sort((a, b) => b.score - a.score)
  const clear = best && (!next || best.score - next.score >= 0.02)
  return scored.map((t) => ({ ...t, best: !!clear && t.candidate === best.candidate && scored.length > 1 }))
}

// Sharpness relative to the other takes: the sharpest 1, the softest 0 (all 1 when they barely differ).
export function relativeSharpness(blurs) {
  const known = blurs.filter((b) => b != null)
  if (!known.length) return blurs.map(() => null)
  const lo = Math.min(...known)
  const hi = Math.max(...known)
  return blurs.map((b) => (b == null ? null : hi - lo < 0.15 * hi || hi === 0 ? 1 : +(1 - (b - lo) / (hi - lo)).toFixed(3)))
}

function reasons(t, all) {
  const out = []
  const p = t.parts
  const r = t.raw
  if (p.words != null) out.push(r.coverage >= 0.95 ? 'says every word' : r.coverage >= 0.7 ? `misses some words (heard "${r.heard.slice(0, 50)}")` : `the line comes out wrong (heard "${r.heard.slice(0, 50)}")`)
  if (p.likeness != null) out.push(r.likeness >= 0.6 ? `clearly ${r.name} (${r.likeness.toFixed(2)})` : r.likeness >= 0.4 ? `looks like ${r.name} (${r.likeness.toFixed(2)})` : `doesn't look much like ${r.name} (${r.likeness.toFixed(2)})`)
  if (p.motion != null && r.frozen >= 0.5) out.push(`freezes for ${r.frozen.toFixed(1)} s`)
  if (p.sharpness != null && all.filter((x) => x.parts.sharpness != null).length > 1) {
    if (p.sharpness === 1 && all.some((x) => x.parts.sharpness < 1)) out.push('the sharpest')
    else if (p.sharpness === 0) out.push('the softest')
  }
  return out
}

export class Ranker {
  // studio: () => the Studio (jobs, characters, face pictures); voices / shinobi: () => the service or null
  constructor({ studio, voices = () => null, shinobi = () => null, ffmpeg, dataDir }) {
    this.studio = studio
    this.voices = voices
    this.shinobi = shinobi
    this.ffmpeg = ffmpeg
    this.dataDir = dataDir
    this.busy = new Set()
  }
  weightsFile = () => path.join(this.dataDir, 'rank-weights.json')
  weights() {
    try {
      return { ...DEFAULT_WEIGHTS, ...JSON.parse(fs.readFileSync(this.weightsFile(), 'utf8')).weights }
    } catch {
      return { ...DEFAULT_WEIGHTS }
    }
  }

  run(args) {
    return new Promise((resolve) => {
      const p = spawn(this.ffmpeg, args, { windowsHide: true })
      let err = ''
      p.stderr.on('data', (d) => (err += d))
      p.on('error', () => resolve(''))
      p.on('close', () => resolve(err))
    })
  }
  // Mean blur (0 sharp .. higher softer) over a few frames a second, and the seconds the picture freezes.
  async measure(file) {
    const log = await this.run(['-hide_banner', '-v', 'info', '-i', file, '-vf', 'fps=4,blurdetect=block_width=32:block_height=32,freezedetect=n=0.002:d=0.75,metadata=print', '-an', '-f', 'null', '-'])
    const blurs = [...log.matchAll(/lavfi\.blur=([\d.]+)/g)].map((m) => Number(m[1]))
    const frozen = [...log.matchAll(/freeze_duration:\s*([\d.]+)/g)].reduce((n, m) => n + Number(m[1]), 0)
    const open = /freeze_start:\s*([\d.]+)(?![\s\S]*freeze_end)/.exec(log)
    const dur = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(log)?.slice(1).reduce((s, x, i) => s + Number(x) * [3600, 60, 1][i], 0)) || 0
    const tail = open ? Math.max(0, dur - Number(open[1])) : 0
    return { blur: blurs.length ? blurs.reduce((a, b) => a + b, 0) / blurs.length : null, frozen: frozen + tail, duration: dur }
  }

  // Scores a previews job's takes and saves them on the job (job.ranking). Parts that can't be measured are left out.
  async rank(jobId) {
    if (this.busy.has(jobId)) return null
    this.busy.add(jobId)
    try {
      const job = this.studio().getJob(jobId, { refresh: false })
      if (job.kind !== 'previews' || job.status !== 'success') return null
      const req = job.plan?.request || {}
      const takes = job.outputs.filter((o) => o.kind === 'preview' && o.path && fs.existsSync(o.path))
      if (!takes.length) return null
      const lines = spokenLines(req.prompt).join(' ')
      const ch = req.character && req.character !== 'none' ? this.studio().characters().find((c) => c.id === req.character) : null
      const face = ch ? this.studio().facePicture(ch, this.studio().resourcesDir) : null

      const measured = await Promise.all(takes.map((t) => this.measure(t.path)))
      let likeness = []
      const sh = this.shinobi()
      if (face && sh?.faceModelsReady?.()) likeness = await sh.likeness(face, takes.map((t) => t.path)).catch(() => [])
      const heard = []
      const v = this.voices()
      if (lines && v?.engine?.installed?.()) for (const t of takes) heard.push(await v.transcribe(t.path).catch(() => null))

      const sharp = relativeSharpness(measured.map((m) => m.blur))
      const raw = takes.map((t, i) => {
        const like = likeness.find((x) => x.file === t.path)?.score ?? null
        const coverage = lines && heard[i] != null ? heardScore(lines, heard[i]) : null
        return {
          candidate: t.candidate,
          seed: t.seed,
          raw: { heard: heard[i] ?? '', coverage, likeness: like, name: ch?.name.split(/\s+/)[0], frozen: measured[i].frozen, blur: measured[i].blur },
          parts: {
            words: coverage == null ? null : +(coverage * coverage).toFixed(3),
            likeness: like == null ? null : +Math.min(1, Math.max(0, (like - 0.2) / 0.5)).toFixed(3),
            motion: measured[i].duration ? +Math.max(0, 1 - (2 * measured[i].frozen) / measured[i].duration).toFixed(3) : null,
            sharpness: sharp[i]
          }
        }
      })
      const ranked = combine(raw, this.weights()).map((t, _, all) => ({ ...t, reasons: reasons(t, all) }))
      const ranking = { at: new Date().toISOString(), takes: ranked, measured: PARTS.filter((p) => ranked.some((t) => t.parts[p] != null)) }
      this.studio().updateJob(jobId, { ranking })
      return ranking
    } finally {
      this.busy.delete(jobId)
    }
  }

  // The person picked a take: each part's weight leans towards what set it apart from the others.
  learn(jobId, candidate) {
    const job = this.studio().getJob(jobId, { refresh: false })
    const takes = job.ranking?.takes || []
    const picked = takes.find((t) => t.candidate === candidate)
    if (!picked || takes.length < 2) return this.weights()
    const others = takes.filter((t) => t !== picked)
    const w = this.weights()
    for (const p of PARTS) {
      const mine = picked.parts[p]
      const rest = others.map((t) => t.parts[p]).filter((x) => x != null)
      if (mine == null || !rest.length) continue
      const mean = rest.reduce((a, b) => a + b, 0) / rest.length
      if (Math.abs(mine - mean) < 0.05) continue
      w[p] = +Math.min(5, Math.max(0.3, w[p] * (mine > mean ? 1.08 : 0.94))).toFixed(3)
    }
    let picks = 0
    try {
      picks = JSON.parse(fs.readFileSync(this.weightsFile(), 'utf8')).picks || 0
    } catch {}
    fs.writeFileSync(this.weightsFile(), JSON.stringify({ weights: w, picks: picks + 1 }, null, 2))
    return w
  }
}
