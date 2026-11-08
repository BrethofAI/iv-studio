// Cloud mode on the user's own Modal account. IV Studio installs a private copy of Modal's command-line
// client (uv-managed Python in the app data folder), lets the user sign in through Modal's own web page
// (the token stays in Modal's ~/.modal.toml, never in IV Studio), then deploys resources/cloud to their
// workspace: ComfyUI + the node packs in an image, the models in a volume, behind gate.py and a token.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const WIN = process.platform === 'win32'
// uv's own release builds, checked against the SHA-256 uv publishes next to each. The Linux and Mac ones unpack
// into a folder.
export const UV_BUILDS = {
  win32: { url: 'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-x86_64-pc-windows-msvc.zip', sha256: '088962f9e7b7bd9ea740c04c650b2a21c8928c345bd99ac24350dc924dba656c', file: 'uv.zip' },
  linux: { url: 'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-x86_64-unknown-linux-gnu.tar.gz', sha256: '1468ebd5a5541121837c5a2817b9972ba6090fa6caa3d142620850a47fb75154', file: 'uv.tar.gz', strip: 1 },
  'darwin-arm64': { url: 'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-aarch64-apple-darwin.tar.gz', sha256: 'a9c1b29002cf3c83f07fa9cd8a887a3be0107d90e23189721221e7257db8e3d6', file: 'uv.tar.gz', strip: 1 },
  'darwin-x64': { url: 'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-x86_64-apple-darwin.tar.gz', sha256: '5f44dcbde809b632f47c36fadb241cb4d6f9af71d0c8f172b5d2026d3dde742c', file: 'uv.tar.gz', strip: 1 }
}
export const UV = { version: '0.13.0', ...(UV_BUILDS[process.platform === 'darwin' ? `darwin-${process.arch}` : process.platform] || UV_BUILDS.linux) }
// A venv keeps its programs in Scripts\ (Windows) or bin/.
export const venvBin = (venv, name) => path.join(venv, WIN ? 'Scripts' : 'bin', WIN ? `${name}.exe` : name)
export const MODAL_VERSION = '1.6.2'
// The image builder IV Studio's cloud image is made and tested with. Modal gives new workspaces its newest builder
// (2026.10 in November 2026), which this client can't use ("This version of the modal client supports the following
// image builder versions..."), so every Modal command asks for this one (MODAL_IMAGE_BUILDER_VERSION wins over
// the workspace's setting).
export const IMAGE_BUILDER = '2025.06'
export const APP_NAME = 'iv-studio'
// Modal's list prices (modal.com/pricing, 2026-10-28), per hour, billed by the second.
export const GPUS = [
  { id: 'L40S', label: 'L40S · 48 GB', perHour: 1.95, note: 'Recommended: fits H3 in memory, best value' },
  { id: 'A100-80GB', label: 'A100 · 80 GB', perHour: 2.5, note: 'More memory headroom for long sequences' },
  { id: 'H100', label: 'H100 · 80 GB', perHour: 3.95, note: 'About twice as fast, twice the price' }
]

export class Cloud {
  constructor({ dataDir, resourcesDir, onLog }) {
    this.dir = path.join(dataDir, 'cloud')
    this.resourcesDir = resourcesDir
    this.onLog = onLog || (() => {})
  }

  get uvExe() {
    return path.join(this.dir, 'uv', WIN ? 'uv.exe' : 'uv')
  }
  get modalExe() {
    return venvBin(path.join(this.dir, 'venv'), 'modal')
  }
  get deployDir() {
    return path.join(this.dir, 'deploy')
  }

  toolkitReady = () => fs.existsSync(this.modalExe)

  // uv (checked against its published SHA-256), then a Python with Modal's client, all inside app data.
  async installToolkit() {
    if (this.toolkitReady()) return true
    await this.ensureUv()
    this.onLog('Setting up Python and Modal’s client…')
    const env = this.uvEnv()
    await this.exec(this.uvExe, ['venv', path.join(this.dir, 'venv'), '--python', '3.12'], { env })
    await this.exec(this.uvExe, ['pip', 'install', '--python', path.join(this.dir, 'venv'), `modal==${MODAL_VERSION}`], { env })
    return this.toolkitReady()
  }

  // uv and its Python downloads live in the cloud folder; Shinobi's engine shares them.
  uvEnv = () => ({ UV_PYTHON_INSTALL_DIR: path.join(this.dir, 'python'), UV_CACHE_DIR: path.join(this.dir, 'uv-cache') })
  async ensureUv() {
    fs.mkdirSync(path.join(this.dir, 'uv'), { recursive: true })
    if (!fs.existsSync(this.uvExe)) {
      this.onLog('Downloading uv (Python manager)…')
      const zip = path.join(this.dir, UV.file)
      const res = await fetch(UV.url)
      if (!res.ok) throw new Error(`Could not download uv (${res.status}).`)
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip))
      const sum = createHash('sha256').update(fs.readFileSync(zip)).digest('hex')
      if (sum !== UV.sha256) {
        fs.rmSync(zip, { force: true })
        throw new Error('The uv download did not match its published checksum.')
      }
      // Windows' own tar (bsdtar) unpacks zips; a GNU tar earlier on PATH (Git's) can't, and reads C: as a host
      const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
      await this.exec(tar, ['-xf', zip, '-C', path.join(this.dir, 'uv'), ...(UV.strip ? [`--strip-components=${UV.strip}`] : [])])
      if (!WIN) fs.chmodSync(this.uvExe, 0o755)
      fs.rmSync(zip, { force: true })
    }
    return this.uvExe
  }

  // The Modal workspace the client is signed in to, or null. Asked of Modal itself (`modal token info` checks the
  // token): `modal profile current` answers "default" even with no token at all, which read as signed in.
  // Kept for 30 s, because the window asks often; forget() after signing in or out.
  async workspace() {
    if (!this.toolkitReady()) return null
    if (this.ws && Date.now() - this.ws.at < 30000) return this.ws.value
    let value = null
    try {
      value = workspaceOf(await this.modal(['token', 'info'], { quiet: true }))
    } catch {}
    this.ws = { at: Date.now(), value }
    return value
  }
  forget() {
    this.ws = null
  }

  // Opens Modal's sign-in page in the browser and waits until the person has approved it. The page's address is
  // kept (signInUrl) so the window can offer it when no browser opened; cancelSignIn() stops waiting.
  async signIn() {
    if (this.signing) throw new Error('Already waiting for the Modal sign-in.')
    this.signInUrl = null
    this.cancelled = false
    try {
      await this.modal(['token', 'new'], {
        onSpawn: (p) => (this.signing = p),
        onText: (t) => (this.signInUrl ||= t.match(/https:\/\/modal\.com\/token-flow\/[\w-]+/)?.[0] || null)
      })
    } catch (err) {
      if (this.cancelled) throw new Error('Sign-in cancelled.')
      throw err
    } finally {
      this.signing = null
      this.signInUrl = null
      this.forget()
    }
    const ws = await this.workspace()
    if (!ws) throw new Error('Modal didn’t finish signing in. Try again, or sign out and sign in again.')
    return ws
  }
  cancelSignIn() {
    if (!this.signing) return false
    this.cancelled = true
    killTree(this.signing)
    return true
  }

  // Signs this PC out of Modal: takes the active profile out of Modal's config (~/.modal.toml, or MODAL_CONFIG_PATH),
  // leaving any other profiles. Modal's own tools on this PC use the same file, so they're signed out too.
  signOut() {
    const file = modalConfigPath()
    this.forget()
    if (!fs.existsSync(file)) return { removed: null }
    const { text, removed } = withoutActiveProfile(fs.readFileSync(file, 'utf8'))
    if (removed) fs.writeFileSync(file, text)
    return { removed }
  }

  // Copies the cloud files next to each other so `modal deploy` sees one folder.
  stage() {
    const d = this.deployDir
    fs.rmSync(d, { recursive: true, force: true })
    fs.mkdirSync(d, { recursive: true })
    for (const f of ['modal_app.py', 'gate.py', 'extra_model_paths.yaml', 'cloud.json']) fs.copyFileSync(path.join(this.resourcesDir, 'cloud', f), path.join(d, f))
    fs.copyFileSync(path.join(this.resourcesDir, 'models.json'), path.join(d, 'models.json'))
    fs.cpSync(path.join(this.resourcesDir, 'comfy-nodes', 'ComfyUI-IV-Studio'), path.join(d, 'ComfyUI-IV-Studio'), { recursive: true, filter: (s) => !s.includes('__pycache__') })
  }

  // Builds the image (first time ~10-15 min, then cached) and publishes ComfyUI behind the gate.
  // Returns {url, token}. A new token is made each time, so an old address stops working.
  async deploy({ gpu = 'L40S', idleSeconds = 300 } = {}) {
    this.stage()
    const token = randomBytes(24).toString('base64url')
    this.onLog('Saving the access token in your Modal workspace…')
    await this.modal(['secret', 'create', 'iv-studio-token', `IV_TOKEN=${token}`, '--force'], { quiet: true, secret: true })
    this.onLog('Building the cloud image and publishing ComfyUI (the first time takes 10–15 minutes)…')
    const out = await this.modal(['deploy', 'modal_app.py'], { env: { IV_GPU: gpu, IV_IDLE_SECONDS: String(idleSeconds), IV_APP_NAME: APP_NAME } })
    const url = out.match(/https:\/\/[\w.-]+\.modal\.run/)?.[0]
    if (!url) throw new Error('Modal did not report the app address.')
    return { url, token }
  }

  // Downloads the H3 models into the iv-studio-models volume (CPU, once; ~60 GB).
  fetchModels() {
    this.stage() // the current models.json, not the copy from the last deploy
    this.onLog('Downloading the H3 models into your cloud storage (about 60 GB, once)…')
    return this.modal(['run', 'modal_app.py::fetch_models'])
  }

  // A local file (a character LoRA or RefMod) into the models volume, at the same relative path.
  uploadModel(localFile, remotePath) {
    this.onLog(`Uploading ${path.basename(localFile)}…`)
    return this.modal(['volume', 'put', 'iv-studio-models', localFile, remotePath, '--force'])
  }

  // The containers running IV Studio's cloud app right now (each holds a GPU while it's up).
  async containers() {
    const out = await this.modal(['container', 'list', '--json'], { quiet: true })
    const list = JSON.parse(out.slice(out.indexOf('[')) || '[]')
    return list.filter((c) => c.app_name === APP_NAME).map((c) => ({ id: c.container_id, startedAt: c.start_time }))
  }

  // Shuts the cloud GPU down now instead of waiting for the idle timer. Returns how many were stopped.
  async stopGpu() {
    const running = await this.containers()
    for (const c of running) {
      this.onLog(`Shutting down cloud GPU ${c.id}…`)
      await this.modal(['container', 'stop', c.id], { quiet: true })
    }
    return { stopped: running.length }
  }

  modal(args, { env = {}, quiet = false, secret = false, onSpawn, onText } = {}) {
    return this.exec(this.modalExe, args, { cwd: this.deployDir, env: { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...env }, quiet, secret, onSpawn, onText })
  }

  // Runs a program, streams each output line to onLog (unless quiet), resolves with all output.
  exec(cmd, args, { cwd, env = {}, quiet = false, secret = false, onSpawn, onText } = {}) {
    return new Promise((resolve, reject) => {
      if (cwd) fs.mkdirSync(cwd, { recursive: true })
      const builder = cmd === this.modalExe ? { MODAL_IMAGE_BUILDER_VERSION: IMAGE_BUILDER } : {}
      const p = spawn(cmd, args, { cwd, env: { ...process.env, ...builder, ...env }, windowsHide: true })
      onSpawn?.(p)
      let out = ''
      const take = (buf) => {
        const text = buf.toString()
        out += text
        onText?.(out)
        if (!quiet) for (const line of text.split(/\r?\n/)) if (line.trim()) this.onLog(line.trim())
      }
      p.stdout.on('data', take)
      p.stderr.on('data', take)
      p.on('error', reject)
      p.on('close', (code) => {
        if (code === 0) return resolve(out)
        const tail = out.trim().split(/\r?\n/).slice(-6).join('\n')
        reject(new Error(`${path.basename(cmd)} ${secret ? args[0] : args.join(' ')} failed:\n${tail}`))
      })
    })
  }
}

// Modal's config file: MODAL_CONFIG_PATH, else ~/.modal.toml.
export const modalConfigPath = () => process.env.MODAL_CONFIG_PATH || path.join(os.homedir(), '.modal.toml')

// The workspace in `modal token info`'s answer ("Workspace: name (ac-...)"), or null.
export function workspaceOf(text) {
  return String(text || '').match(/^\s*Workspace:\s*([^\s(]+)/m)?.[1] || null
}

// Modal's config without its active profile: the [section] marked active = true, or the only one there is.
// Other profiles and anything outside a section are kept as they are.
export function withoutActiveProfile(text) {
  const lines = String(text).split(/\r?\n/)
  const nl = /\r\n/.test(text) ? '\r\n' : '\n'
  const sections = []
  let cur = { name: null, lines: [] }
  for (const line of lines) {
    const m = line.match(/^\s*\[\s*["']?([^"'\]]+?)["']?\s*\]\s*$/)
    if (m) {
      sections.push(cur)
      cur = { name: m[1], lines: [line] }
    } else cur.lines.push(line)
  }
  sections.push(cur)
  const named = sections.filter((x) => x.name)
  const active = named.find((x) => x.lines.some((l) => /^\s*active\s*=\s*true\b/i.test(l))) || (named.length === 1 ? named[0] : null)
  if (!active) return { text, removed: null }
  const kept = sections.filter((x) => x !== active).flatMap((x) => x.lines)
  return { text: kept.join(nl).replace(/(\r?\n){3,}/g, nl + nl), removed: active.name }
}

// Stops a process and everything it started (Modal's client starts a helper on Windows).
function killTree(p) {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true })
    else p.kill('SIGTERM')
  } catch {}
}
