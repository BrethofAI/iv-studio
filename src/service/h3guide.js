// MiniMax's own H3 prompt-writing guide (skills/h3-prompt-writing in github.com/MiniMax-AI/MiniMax-H3), which the
// local writer follows. It is part of H3's Documentation under the MiniMax H3 Community License, whose territory
// rule keeps IV Studio from shipping it: it's fetched from MiniMax on first use, with that licence beside it, into
// the app data. Pinned to one commit and checked by SHA-256; anything else is refused and the writer falls back to
// IV Studio's own rules.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './paths.js'

export const GUIDE_COMMIT = 'a107547fa669c509b8e6363fe18378d46ab3066c'
const RAW = `https://raw.githubusercontent.com/MiniMax-AI/MiniMax-H3/${GUIDE_COMMIT}/skills/h3-prompt-writing`
export const GUIDE_FILES = {
  'base-en.txt': {
    url: `${RAW}/references/base-en.txt`,
    sha256: '2cfebc096a6e08370f288d468d90b60f7f9bcb938f94bf090816e910e48e75fc'
  },
  'ref-en.txt': {
    url: `${RAW}/references/ref-en.txt`,
    sha256: '1e574f356716ad55612247ffb7bbccbcdb484ad96599d63c7dca1af186b1fab7'
  },
  LICENSE: {
    url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/42ed227ee7df40d41602854ae760620d6eb651fe/LICENSE',
    sha256: '59b99642b95ea21630e311198ddbfffbfe05aadba0c2f5d884cbdf4efcc90f44'
  }
}
export const GUIDE_SOURCE = `MiniMax's H3 prompt-writing guide (github.com/MiniMax-AI/MiniMax-H3, skills/h3-prompt-writing, commit ${GUIDE_COMMIT.slice(0, 7)}), under the MiniMax H3 Community License`

export const guideDir = (root = dataDir()) => path.join(root, 'minimax-h3-guide')
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

function readChecked(dir, name) {
  try {
    const buf = fs.readFileSync(path.join(dir, name))
    return sha256(buf) === GUIDE_FILES[name].sha256 ? buf.toString('utf8') : null
  } catch {
    return null
  }
}

const cache = new Map()
let failedAt = 0

// { base, ref } from the app data, downloaded first if missing; null when it can't be had (offline, a changed file).
// A failed download isn't retried for ten minutes, so an offline writer doesn't wait on it every time.
export async function loadGuide({ root, download = true } = {}) {
  const dir = guideDir(root)
  if (cache.get(dir)) return cache.get(dir)
  const have = () => {
    const base = readChecked(dir, 'base-en.txt')
    const ref = readChecked(dir, 'ref-en.txt')
    const found = base && ref && readChecked(dir, 'LICENSE') ? { base, ref, dir } : null
    if (found) cache.set(dir, found)
    return found
  }
  if (have() || !download || Date.now() - failedAt < 600000) return cache.get(dir) || null
  try {
    fs.mkdirSync(dir, { recursive: true })
    for (const [name, f] of Object.entries(GUIDE_FILES)) {
      if (readChecked(dir, name)) continue
      const r = await fetch(f.url, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      if (sha256(buf) !== f.sha256) throw new Error(`${name} doesn't match the pinned copy`)
      fs.writeFileSync(path.join(dir, name), buf)
    }
    fs.writeFileSync(path.join(dir, 'SOURCE.txt'), `${GUIDE_SOURCE}.\nDownloaded by IV Studio from MiniMax; IV Studio does not distribute these files.\n`)
  } catch (e) {
    failedAt = Date.now()
    console.warn(`H3 prompt guide not downloaded: ${e.message}`)
  }
  return have()
}
