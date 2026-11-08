// Moving IV Studio's data folder to another drive (Settings → Data folder). The data folder holds everything
// IV Studio makes and installs for itself: projects, edits, voices and lines, trainings, the voice engine's
// Python, Shinobi and its models. ComfyUI's models, LoRAs and renders aren't in it; they live in ComfyUI.
//
// A move copies everything to the new folder (the original is left untouched), checks the copy, then writes
// a small pointer in the default folder (data-folder.json, see paths.js) and IV Studio restarts on the new
// folder. The old copy stays until the person removes it from Settings.
//
// Electron keeps the window's own files (caches, local storage) in the default folder too; those stay put.
// Links inside the folder (Incognito's junctions to the shared tools) are made again pointing into the new
// folder, never followed. Paths to the old folder inside settings and project files (.json) and Python
// environments (pyvenv.cfg) are rewritten to the new one in the copy.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { POINTER_FILE, readPointer } from './paths.js'

const WIN = process.platform === 'win32'
// Chromium's files in Electron's user data folder (the default data folder), lower case. They stay where they are.
const BROWSER = new Set(
  [
    'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GPUPersistentCache', 'GrShaderCache', 'ShaderCache',
    'Local State', 'Local Storage', 'Session Storage', 'Network', 'Preferences', 'Shared Dictionary', 'SharedStorage', 'VideoDecodeStats',
    'blob_storage', 'shared_proto_db', 'DIPS', 'DIPS-wal', 'DIPS-journal', 'DevToolsActivePort', 'lockfile', 'IndexedDB', 'WebStorage',
    'Service Worker', 'databases', 'Partitions', 'Crashpad', 'Cookies', 'Cookies-journal', 'Trust Tokens', 'Trust Tokens-journal',
    'TransportSecurity', 'Dictionaries', 'Network Persistent State', 'Origin Trials', 'declarative_performance_observer.db',
    'declarative_performance_observer.db-journal', '.updaterId', POINTER_FILE
  ].map((n) => n.toLowerCase())
)
const REWRITE = (name) => /\.json$/i.test(name) || name.toLowerCase() === 'pyvenv.cfg'
const REWRITE_LIMIT = 50 * 1024 * 1024

const norm = (p) => {
  const r = path.resolve(p)
  return WIN ? r.toLowerCase() : r
}
const same = (a, b) => norm(a) === norm(b)
// Is `p` inside `dir` (or `dir` itself)?
export function inside(p, dir) {
  const rel = path.relative(norm(dir), norm(p))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// The top-level names in `dir` that belong to IV Studio (everything but Chromium's files and the pointer).
export function movableEntries(dir) {
  try {
    return fs.readdirSync(dir).filter((n) => !BROWSER.has(n.toLowerCase()))
  } catch {
    return []
  }
}

// Every file and link under `entries` of `dir`, without following links: [{ rel, size, link }].
export async function listData(dir, entries = movableEntries(dir)) {
  const out = []
  async function walk(rel) {
    const abs = path.join(dir, rel)
    const st = await fsp.lstat(abs)
    if (st.isSymbolicLink()) return out.push({ rel, size: 0, link: true })
    if (st.isDirectory()) {
      out.push({ rel, size: 0, dir: true })
      for (const name of await fsp.readdir(abs)) await walk(path.join(rel, name))
      return
    }
    if (st.isFile()) out.push({ rel, size: st.size })
  }
  for (const e of entries) await walk(e)
  return out
}

const isEmptyDir = (p) => {
  try {
    return fs.readdirSync(p).length === 0
  } catch {
    return false
  }
}

// The folder a move copies into, from the folder the person picked: the picked folder itself when it is empty
// (or doesn't exist yet), else a new "IV Studio" folder inside it. The default folder qualifies when it holds
// no IV Studio files (only Electron's), which is moving back. Throws with a plain reason when it can't be used.
export function chooseTarget(picked, { from, defaultDir }) {
  if (!picked || !path.isAbsolute(picked)) throw new Error('Pick a folder.')
  const resolved = path.resolve(picked)
  if (same(resolved, from)) throw new Error('That is already IV Studio’s data folder.')
  if (inside(resolved, from)) throw new Error('Pick a folder outside IV Studio’s current data folder.')
  if (inside(from, resolved) && !same(resolved, defaultDir)) throw new Error('Pick a folder that isn’t around IV Studio’s current data folder.')
  if (defaultDir && same(resolved, defaultDir)) {
    if (movableEntries(resolved).length) throw new Error('The default folder still has an old copy of IV Studio’s data. Remove the old copy first.')
    return resolved
  }
  if (!fs.existsSync(resolved) || isEmptyDir(resolved)) return resolved
  const sub = path.join(resolved, 'IV Studio')
  if (!fs.existsSync(sub) || isEmptyDir(sub)) return sub
  throw new Error(`${sub} already has files in it. Pick an empty folder.`)
}

// Free bytes on the drive that will hold `dir` (null when the system won't say).
export function freeBytes(dir) {
  let p = path.resolve(dir)
  while (!fs.existsSync(p) && path.dirname(p) !== p) p = path.dirname(p)
  try {
    const s = fs.statfsSync(p)
    return Number(s.bavail) * Number(s.bsize)
  } catch {
    return null
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Paths to `from` in a file's text, made to point at `to`: as written, JSON-escaped (doubled backslashes) and
// with forward slashes. Only whole folder names match (D:\IV Studio doesn't match D:\IV Studio Old).
export function rewritePaths(text, from, to) {
  const variants = new Map()
  const add = (a, b) => a && !variants.has(a) && variants.set(a, b)
  add(from, to)
  add(JSON.stringify(from).slice(1, -1), JSON.stringify(to).slice(1, -1))
  add(from.replace(/\\/g, '/'), to.replace(/\\/g, '/'))
  let out = text
  // longest first, so the JSON form (\\) isn't half-matched by the plain one
  for (const [a, b] of [...variants].sort((x, y) => y[0].length - x[0].length)) {
    // a path ends at a separator, a quote or the end of a line (a space may be part of a folder name)
    const re = new RegExp(escapeRe(a) + '(?=[\\\\/"\'\\r\\n]|$)', WIN ? 'gim' : 'gm')
    out = out.replace(re, () => b)
  }
  return out
}

// Where a link copied from `from` should point in `to`: into the copy when it pointed inside the old folder.
function linkTarget(target, linkAbs, from, to) {
  target = target.replace(/^\\\\\?\\/, '') // Windows may give a junction's target as \\?\C:\...
  const absolute = path.isAbsolute(target) ? target : path.resolve(path.dirname(linkAbs), target)
  if (!inside(absolute, from)) return target
  return path.join(to, path.relative(from, absolute))
}

async function copyFile(src, dst, size, onBytes) {
  // small files in one go (the OS copies them fastest); big ones streamed so the bar moves
  if (size < 16 * 1024 * 1024) {
    await fsp.copyFile(src, dst)
    onBytes(size)
    return
  }
  const count = new Transform({
    transform(chunk, _enc, cb) {
      onBytes(chunk.length)
      cb(null, chunk)
    }
  })
  await pipeline(fs.createReadStream(src), count, fs.createWriteStream(dst))
  const st = await fsp.stat(src)
  await fsp.utimes(dst, st.atime, st.mtime).catch(() => {})
}

// Copies IV Studio's data from `from` into `to`. onProgress({ phase, done, total, file }) in bytes.
// Returns { entries, files: [{ rel, size, link, rewritten }], bytes }; the original is never changed.
export async function copyData(from, to, { onProgress = () => {}, entries = movableEntries(from) } = {}) {
  onProgress({ phase: 'counting', done: 0, total: 0 })
  const items = await listData(from, entries)
  const total = items.reduce((n, i) => n + i.size, 0)
  const free = freeBytes(to)
  if (free != null && free < total + 512 * 1024 * 1024) throw new Error(`Not enough space there: IV Studio’s data is ${gb(total)} and the drive has ${gb(free)} free.`)
  await fsp.mkdir(to, { recursive: true })
  let done = 0
  let last = 0
  const tick = (file) => {
    const now = Date.now()
    if (now - last > 200) {
      last = now
      onProgress({ phase: 'copying', done, total, file })
    }
  }
  const files = []
  for (const item of items) {
    const src = path.join(from, item.rel)
    const dst = path.join(to, item.rel)
    if (item.dir) {
      await fsp.mkdir(dst, { recursive: true })
      continue
    }
    await fsp.mkdir(path.dirname(dst), { recursive: true })
    if (item.link) {
      const target = await fsp.readlink(src)
      const next = linkTarget(target, src, from, to)
      let type = 'file'
      try {
        type = fs.statSync(src).isDirectory() ? (WIN ? 'junction' : 'dir') : 'file'
      } catch {
        type = WIN ? 'junction' : 'dir'
      }
      if (inside(next, to) && type !== 'file') await fsp.mkdir(next, { recursive: true })
      await fsp.symlink(next, dst, type)
      files.push({ rel: item.rel, size: 0, link: true, target: next })
      continue
    }
    tick(item.rel)
    await copyFile(src, dst, item.size, (n) => {
      done += n
      tick(item.rel)
    })
    let rewritten = false
    if (REWRITE(path.basename(item.rel)) && item.size <= REWRITE_LIMIT) {
      const text = await fsp.readFile(dst, 'utf8')
      const next = rewritePaths(text, from, to)
      if (next !== text) {
        await fsp.writeFile(dst, next)
        rewritten = true
      }
    }
    files.push({ rel: item.rel, size: item.size, rewritten })
  }
  onProgress({ phase: 'copied', done: total, total })
  return { entries, files, bytes: total }
}

// Checks the copy against what was copied: every file there at its size (rewritten files: there and, for
// .json, still valid JSON), every link a link to its new target. Throws listing the first problems.
export async function verifyCopy(to, copied, { onProgress = () => {} } = {}) {
  const bad = []
  let n = 0
  for (const f of copied.files) {
    const abs = path.join(to, f.rel)
    if (++n % 500 === 0) onProgress({ phase: 'checking', done: n, total: copied.files.length })
    try {
      const st = await fsp.lstat(abs)
      if (f.link) {
        if (!st.isSymbolicLink()) bad.push(`${f.rel} is not a link`)
        else if (!same((await fsp.readlink(abs)).replace(/^\\\\\?\\/, ''), f.target)) bad.push(`${f.rel} points elsewhere`)
      } else if (f.rewritten) {
        if (/\.json$/i.test(f.rel)) JSON.parse(await fsp.readFile(abs, 'utf8'))
      } else if (st.size !== f.size) bad.push(`${f.rel} is ${st.size} bytes, not ${f.size}`)
    } catch (err) {
      bad.push(`${f.rel}: ${err.code === 'ENOENT' ? 'missing' : err.message}`)
    }
    if (bad.length >= 5) break
  }
  onProgress({ phase: 'checked', done: copied.files.length, total: copied.files.length })
  if (bad.length) throw new Error(`The copy didn’t check out, so IV Studio keeps using the old folder: ${bad.join('; ')}`)
  return true
}

// Points IV Studio at `to` from next start, remembering where the old copy is so it can be removed later.
export function writePointer(defaultDir, { to, from, entries }) {
  fs.mkdirSync(defaultDir, { recursive: true })
  const file = path.join(defaultDir, POINTER_FILE)
  fs.writeFileSync(file + '.tmp', JSON.stringify({ dir: to, from, entries, movedAt: new Date().toISOString() }, null, 2))
  fs.renameSync(file + '.tmp', file)
}

// The old copy left by a move, if any of it is still there: { dir, entries }.
export function oldCopy(defaultDir, current) {
  const p = readPointer(defaultDir)
  if (!p?.from || !Array.isArray(p.entries) || same(p.from, current)) return null
  const left = p.entries.filter((e) => fs.existsSync(path.join(p.from, e)) || isLink(path.join(p.from, e)))
  return left.length ? { dir: p.from, entries: left } : null
}
const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

// Deletes a tree without following links (a junction is removed, never what it points to).
async function removeTree(p) {
  let st
  try {
    st = await fsp.lstat(p)
  } catch {
    return
  }
  if (st.isSymbolicLink()) {
    await fsp.unlink(p).catch(() => fsp.rmdir(p))
    return
  }
  if (st.isDirectory()) {
    for (const name of await fsp.readdir(p)) await removeTree(path.join(p, name))
    await fsp.rmdir(p)
    return
  }
  await fsp.unlink(p)
}

// Removes the old copy a move left behind: only the names it copied, only from the old folder, and never while
// it is the folder in use. Then forgets it (the pointer goes when IV Studio is back in the default folder).
export async function removeOldCopy(defaultDir, current) {
  const old = oldCopy(defaultDir, current)
  if (!old) return { removed: 0 }
  if (inside(current, old.dir) && !same(old.dir, defaultDir)) throw new Error('The old copy holds the data folder in use; it can’t be removed.')
  for (const e of old.entries) {
    if (BROWSER.has(e.toLowerCase()) || e.includes('/') || e.includes('\\') || e === '..') continue
    await removeTree(path.join(old.dir, e))
  }
  // the old folder itself, when nothing else is left in it (not the default folder: Electron's files are there)
  if (!same(old.dir, defaultDir) && isEmptyDir(old.dir)) await fsp.rmdir(old.dir).catch(() => {})
  const file = path.join(defaultDir, POINTER_FILE)
  if (same(current, defaultDir)) fs.rmSync(file, { force: true })
  else fs.writeFileSync(file, JSON.stringify({ dir: current, movedAt: readPointer(defaultDir)?.movedAt }, null, 2))
  return { removed: old.entries.length }
}

export const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`)

// Undoes a move that failed part way: removes what it copied into `to` (only those names), and `to` itself
// when that leaves it empty. The original folder was never changed.
export async function discardCopy(to, entries, { keepDir = false } = {}) {
  for (const e of entries || []) if (!BROWSER.has(e.toLowerCase())) await removeTree(path.join(to, e)).catch(() => {})
  if (!keepDir && isEmptyDir(to)) await fsp.rmdir(to).catch(() => {})
}
