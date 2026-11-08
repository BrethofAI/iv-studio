// A song's key, guessed from its sound: how strongly each of the 12 pitch classes sounds over the whole song
// (Goertzel filters on every note from C2 to B6), matched against key profiles. Used by Remix to fill in the key
// ACE-Step is told; the person can change it. Mono samples in, no FFT needed.
// On 24 of IV Studio's own ACE songs, against the key each was asked for: Temperley 16 exact (7 a fifth off),
// Albrecht-Shanahan 14, Krumhansl-Kessler 13. Temperley is the default.
export const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const PROFILES = {
  krumhansl: { major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] },
  temperley: { major: [5, 2, 3.5, 2, 4.5, 4, 2, 4.5, 2, 3.5, 1.5, 4], minor: [5, 2, 3.5, 4.5, 2, 4, 2, 4.5, 3.5, 2, 1.5, 4] },
  albrecht: { major: [0.238, 0.006, 0.111, 0.006, 0.137, 0.094, 0.016, 0.214, 0.009, 0.08, 0.008, 0.081], minor: [0.22, 0.006, 0.104, 0.123, 0.019, 0.103, 0.012, 0.214, 0.062, 0.022, 0.061, 0.052] }
}

// Each pitch class's share of the song (sums to 1). Frames quieter than a fiftieth of the loudest are skipped.
export function chromaOf(samples, rate, { frame = 4096, hop = 4096, low = 36, high = 95 } = {}) {
  const notes = []
  for (let m = low; m <= high; m++) {
    const f = 440 * 2 ** ((m - 69) / 12)
    if (f < rate / 2) notes.push({ pc: m % 12, c: 2 * Math.cos((2 * Math.PI * f) / rate) })
  }
  const win = Float32Array.from({ length: frame }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1)))
  const frames = []
  let loudest = 0
  for (let at = 0; at + frame <= samples.length; at += hop) {
    let e = 0
    for (let i = 0; i < frame; i += 8) e += samples[at + i] * samples[at + i]
    frames.push([at, e])
    loudest = Math.max(loudest, e)
  }
  const chroma = new Float64Array(12)
  const buf = new Float32Array(frame)
  for (const [at, e] of frames) {
    if (!loudest || e < loudest / 50) continue
    for (let i = 0; i < frame; i++) buf[i] = samples[at + i] * win[i]
    const here = new Float64Array(12)
    for (const { pc, c } of notes) {
      let s1 = 0
      let s2 = 0
      for (let i = 0; i < frame; i++) {
        const s0 = buf[i] + c * s1 - s2
        s2 = s1
        s1 = s0
      }
      here[pc] += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))
    }
    // each frame counts the same however loud it is
    const sum = here.reduce((a, b) => a + b, 0)
    if (sum > 0) for (let k = 0; k < 12; k++) chroma[k] += here[k] / sum
  }
  const total = chroma.reduce((a, b) => a + b, 0)
  return Array.from(chroma, (v) => (total ? v / total : 0))
}

const corr = (a, b) => {
  const ma = a.reduce((s, v) => s + v, 0) / a.length
  const mb = b.reduce((s, v) => s + v, 0) / b.length
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

// The best-matching key ("D minor"), its score (-1..1) and how far ahead of the runner-up it is.
export function keyOf(chroma, profile = 'temperley') {
  const { major, minor } = PROFILES[profile]
  const scores = []
  for (let k = 0; k < 12; k++) {
    const turn = (p) => p.map((_, i) => p[(i - k + 12) % 12])
    scores.push({ key: `${PITCHES[k]} major`, score: corr(chroma, turn(major)) })
    scores.push({ key: `${PITCHES[k]} minor`, score: corr(chroma, turn(minor)) })
  }
  scores.sort((a, b) => b.score - a.score)
  return { key: scores[0].key, score: +scores[0].score.toFixed(3), margin: +(scores[0].score - scores[1].score).toFixed(3) }
}

export const estimateKey = (samples, rate) => keyOf(chromaOf(samples, rate))
