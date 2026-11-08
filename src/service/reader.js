// The reader: any video taken apart into shots with IV Studio's own tools. ffmpeg's scene score finds the cuts;
// each shot gets its first, middle and last frame and a contact sheet of the three; a grey strip across the top
// and the bottom fifth of the picture, sampled four times a second, shows when captions come and go; Reel's beat
// finder gives the music's tempo, ffmpeg's ebur128 and silencedetect the loudness and the pauses; and when the
// voice engine is set up, Whisper hears each shot's words. Nothing here guesses what a shot *is*: that's the
// writer's job (rebuild.js), looking at the sheets.
//   <outDir>/shots/shot_NNN_{first,middle,last}.jpg, shot_NNN.jpg (the sheet), <outDir>/reading.json
// Written for IV Studio's Rebuild workflow; Same format reuses it.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { probe } from './media.js'

export const READER = { threshold: 0.28, minShot: 0.4, bandFps: 4, band: 0.22, bandWidth: 96, bandHeight: 24 }

const r3 = (v) => Math.round(v * 1000) / 1000

// ffmpeg's metadata=print output: "frame:N pts:P pts_time:T" then "lavfi.scene_score=S". A frame without a score
// line is skipped.
export function parseSceneScores(text) {
  const out = []
  let t = null
  for (const line of String(text).split(/\r?\n/)) {
    const time = /pts_time:\s*(-?[\d.]+)/.exec(line)
    if (time) {
      t = Number(time[1])
      continue
    }
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line)
    if (s && t !== null) {
      out.push({ t, score: Number(s[1]) })
      t = null
    }
  }
  return out
}

// Cut times from scene scores: a score at or above threshold, not within minShot of the start, the end or the cut
// before it; of two candidates closer than minShot, the stronger one.
export function cutsFromScores(scores, { duration, threshold = READER.threshold, minShot = READER.minShot } = {}) {
  const cands = scores.filter((s) => s.score >= threshold && s.t >= minShot && s.t <= duration - minShot).sort((a, b) => a.t - b.t)
  const kept = []
  for (const c of cands) {
    const last = kept.at(-1)
    if (last && c.t - last.t < minShot) {
      if (c.score > last.score) kept[kept.length - 1] = c
    } else kept.push(c)
  }
  return kept.map((c) => r3(c.t))
}

// Shots tiling 0..duration between the cuts.
export function shotsFrom(cuts, duration) {
  const edges = [0, ...cuts, duration]
  return edges.slice(0, -1).map((start, k) => ({ index: k + 1, start: r3(start), end: r3(edges[k + 1]), duration: r3(edges[k + 1] - start) }))
}

// When a band of the picture changes: frames are same-size grey bands sampled at fps; the change from frame k-1 to
// k is the mean absolute difference of their bytes. A change is a spike: at least threshold, and at least ratio
// times the median change around it (window samples each side), so a subtitle swapping words over a moving person
// counts and the person moving doesn't. On dual_role.mp4 a swap scored 6.2 over movement of about 2 (2026-11-08).
// Recorded at k / fps, at least minGap after the last change.
export function bandChanges(frames, { fps = READER.bandFps, threshold = 3, ratio = 2.5, window = 4, minGap = 0.3 } = {}) {
  const score = [0]
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1]
    const b = frames[k]
    let sum = 0
    for (let i = 0; i < b.length; i++) sum += Math.abs(b[i] - a[i])
    score.push(sum / b.length)
  }
  const out = []
  for (let k = 1; k < score.length; k++) {
    const around = []
    for (let j = Math.max(1, k - window); j <= Math.min(score.length - 1, k + window); j++) if (j !== k) around.push(score[j])
    around.sort((x, y) => x - y)
    const median = around.length ? around[Math.floor(around.length / 2)] : 0
    const t = k / fps
    if (score[k] >= threshold && score[k] >= ratio * median && (!out.length || t - out.at(-1) >= minGap)) out.push(r3(t))
  }
  return out
}

// ebur128's summary: the last "I: -20.1 LUFS" and "LRA: 3.2 LU".
export function parseLoudness(text) {
  const i = [...String(text).matchAll(/\bI:\s*(-?[\d.]+|-inf)\s*LUFS/g)].at(-1)
  const lra = [...String(text).matchAll(/\bLRA:\s*(-?[\d.]+)\s*LU\b/g)].at(-1)
  if (!i) return null
  return { integrated: i[1] === '-inf' ? null : Number(i[1]), range: lra ? Number(lra[1]) : null }
}

// silencedetect's report as pairs; a silence still open at the end runs to the end.
export function parseSilences(text, duration) {
  const out = []
  let open = null
  for (const line of String(text).split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line)
    const e = /silence_end:\s*([\d.]+)/.exec(line)
    if (s) open = Math.max(0, Number(s[1]))
    if (e && open !== null) {
      out.push({ start: r3(open), end: r3(Number(e[1])) })
      open = null
    }
  }
  if (open !== null) out.push({ start: r3(open), end: r3(duration) })
  return out
}

export class Reader {
  constructor({ ffmpeg, ffprobe, run, runErr, beatsOf, voices = null, onLog }) {
    Object.assign(this, { ffmpeg, ffprobe, run, runErr, beatsOf, voices })
    this.onLog = onLog || (() => {})
  }

  async read(file, outDir, { speech = true } = {}) {
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`)
    const info = await probe(this.ffprobe, file)
    if (info.kind !== 'video') throw new Error(`${path.basename(file)} isn't a video.`)
    const duration = info.duration
    const fps = info.fps || 24
    const shotDir = path.join(outDir, 'shots')
    fs.mkdirSync(shotDir, { recursive: true })

    this.onLog('Finding the cuts…')
    const meta = await this.run(['-v', 'error', '-i', file, '-an', '-vf', "scale=320:-2,select='gte(scene,0)',metadata=print:file=-", '-f', 'null', '-'])
    const shots = shotsFrom(cutsFromScores(parseSceneScores(meta.toString()), { duration }), duration)

    this.onLog('Taking frames from every shot…')
    const last = Math.max(0, duration - 1.5 / fps)
    for (const s of shots) {
      const name = `shot_${String(s.index).padStart(3, '0')}`
      const at = { first: s.start + 0.04, middle: (s.start + s.end) / 2, last: Math.max(s.start, Math.min(s.end - 0.06, last)) }
      for (const [k, t] of Object.entries(at)) s[k] = await this.frame(file, t, path.join(shotDir, `${name}_${k}.jpg`))
      s.sheet = path.join(shotDir, `${name}.jpg`)
      await this.run(['-y', '-v', 'error', '-i', s.first, '-i', s.middle, '-i', s.last, '-filter_complex', '[0]scale=320:-2[a];[1]scale=320:-2[b];[2]scale=320:-2[c];[a][b][c]hstack=inputs=3', '-frames:v', '1', '-q:v', '3', s.sheet])
    }

    this.onLog('Looking for captions…')
    const bands = await this.bands(file)
    for (const s of shots) {
      // a change in a shot's first or last moments is the cut itself (sampled four times a second, it can show up a
      // sample early), not a caption
      const inside = (t) => t >= s.start + 0.3 && t < s.end - 1 / READER.bandFps
      s.bandTop = bands.top.filter(inside)
      s.bandBottom = bands.bottom.filter(inside)
      s.words = null
    }

    let music = null
    let loudness = null
    let silences = []
    let speechState = info.hasAudio ? 'not_set_up' : 'no_sound'
    if (info.hasAudio) {
      this.onLog('Listening to the sound…')
      try {
        const b = await this.beatsOf(file)
        music = { bpm: b.bpm, beats: b.beats, strength: b.strength }
      } catch {}
      loudness = parseLoudness(await this.runErr(['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128', '-f', 'null', '-']).catch(() => ''))
      silences = parseSilences(await this.runErr(['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'silencedetect=n=-35dB:d=0.4', '-f', 'null', '-']).catch(() => ''), duration)
      if (speech && this.voices?.status?.().ready) {
        this.onLog('Hearing the words…')
        speechState = 'read'
        for (const s of shots) {
          const wav = path.join(os.tmpdir(), `iv-read-${randomUUID().slice(0, 8)}.wav`)
          try {
            await this.run(['-y', '-v', 'error', '-ss', String(s.start), '-t', String(s.duration), '-i', file, '-vn', '-ac', '1', '-ar', '16000', wav])
            s.words = (await this.voices.transcribe(wav)) || ''
          } catch {
            s.words = null
          } finally {
            fs.rmSync(wav, { force: true })
          }
        }
      }
    }

    const reading = {
      source: { file, width: info.width, height: info.height, fps: info.fps, duration, hasAudio: info.hasAudio },
      shots,
      music,
      loudness,
      silences,
      speech: speechState
    }
    fs.writeFileSync(path.join(outDir, 'reading.json'), JSON.stringify(reading, null, 2))
    return reading
  }

  // One frame as a JPEG; near the very end a seek can land past the last frame, so it steps back until one comes.
  async frame(file, t, out) {
    for (const back of [0, 0.1, 0.25, 0.5]) {
      await this.run(['-y', '-v', 'error', '-ss', Math.max(0, t - back).toFixed(3), '-i', file, '-frames:v', '1', '-q:v', '3', out]).catch(() => null)
      if (fs.existsSync(out) && fs.statSync(out).size > 0) return out
    }
    throw new Error(`Couldn't take a frame at ${t.toFixed(2)} s.`)
  }

  // The top and bottom bands as small grey pictures, READER.bandFps a second, and when each changes.
  async bands(file) {
    const { bandFps, band, bandWidth: W, bandHeight: H } = READER
    const size = W * H
    const strip = async (y) => {
      const raw = await this.run(['-v', 'error', '-i', file, '-an', '-vf', `fps=${bandFps},format=gray,crop=iw:ih*${band}:0:${y},scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'])
      const frames = []
      for (let o = 0; o + size <= raw.length; o += size) frames.push(new Uint8Array(raw.buffer, raw.byteOffset + o, size))
      return bandChanges(frames, { fps: bandFps })
    }
    return { top: await strip('0'), bottom: await strip(`ih*${(1 - band).toFixed(2)}`) }
  }
}
