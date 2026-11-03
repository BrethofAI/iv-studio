// Starting ComfyUI from IV Studio (Settings → ComfyUI, the title bar's Start button, and on launch when
// "Start ComfyUI when IV Studio opens" is on). IV Studio doesn't install or own ComfyUI: it starts the
// person's own launcher, the same thing they'd double-click, and waits until ComfyUI answers.
// A launcher is a shortcut (.lnk), a portable install's .bat, or the ComfyUI Desktop app's .exe.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LAUNCHABLE = /\.(lnk|bat|cmd|exe)$/i

// Only a ComfyUI on this PC can be started from here.
export function isLocalUrl(url) {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

const list = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

// The launchers on this PC, best first: shortcuts on the desktop or in the Start menu (how most people
// start it, with their own flags), the ComfyUI Desktop app, then portable installs' run_nvidia_gpu.bat.
export function findLaunchers({ env = process.env, drives = ['C', 'D', 'E', 'F', 'G', 'H'] } = {}) {
  const found = []
  const add = (p, kind) => {
    if (fs.existsSync(p) && !found.some((f) => f.path.toLowerCase() === p.toLowerCase())) found.push({ path: p, kind, label: path.basename(p) })
  }
  const home = env.USERPROFILE || os.homedir()
  const desktops = [path.join(home, 'Desktop'), env.OneDrive && path.join(env.OneDrive, 'Desktop'), env.PUBLIC && path.join(env.PUBLIC, 'Desktop')].filter(Boolean)
  const startMenus = [env.APPDATA && path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), env.ProgramData && path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')].filter(Boolean)
  for (const dir of desktops) for (const e of list(dir)) if (e.isFile() && /comfy/i.test(e.name) && LAUNCHABLE.test(e.name)) add(path.join(dir, e.name), 'shortcut')
  for (const dir of startMenus) {
    for (const e of list(dir)) {
      if (e.isFile() && /comfy/i.test(e.name) && LAUNCHABLE.test(e.name)) add(path.join(dir, e.name), 'shortcut')
      if (e.isDirectory() && /comfy/i.test(e.name)) for (const f of list(path.join(dir, e.name))) if (f.isFile() && /comfy/i.test(f.name) && /\.lnk$/i.test(f.name)) add(path.join(dir, e.name, f.name), 'shortcut')
    }
  }
  if (env.LOCALAPPDATA) for (const sub of ['@comfyorgcomfyui-electron', 'ComfyUI']) add(path.join(env.LOCALAPPDATA, 'Programs', sub, 'ComfyUI.exe'), 'desktop app')
  // portable installs: a ComfyUI folder at the top of a drive or in the home folder, one or two levels down
  const roots = [...drives.map((d) => `${d}:\\`), home, path.join(home, 'Downloads')]
  for (const root of roots) {
    for (const e of list(root)) {
      if (!e.isDirectory() || !/comfy/i.test(e.name)) continue
      const dir = path.join(root, e.name)
      for (const bat of ['run_nvidia_gpu.bat', 'run_cpu.bat']) add(path.join(dir, bat), 'portable')
    }
  }
  return found
}

// A ComfyUI folder the person picked (Settings → ComfyUI): a portable install (ComfyUI\main.py beside its
// run_*.bat files), a plain ComfyUI checkout (main.py), or the Desktop app's folder (ComfyUI.exe).
export function isComfyFolder(dir) {
  return ['ComfyUI/main.py', 'main.py', 'ComfyUI.exe'].some((f) => fs.existsSync(path.join(dir, f)))
}

// The things in that folder that start ComfyUI, best first: GPU .bat files (run_nvidia_gpu.bat before its
// variants), then other .bat/.cmd files, ComfyUI.exe, and CPU-only last.
export function launchersIn(dir) {
  const rank = (name) => (/^run_nvidia_gpu\.bat$/i.test(name) ? 0 : /gpu/i.test(name) ? 1 : /cpu/i.test(name) ? 4 : /\.exe$/i.test(name) ? 2 : 3)
  return list(dir)
    .filter((e) => e.isFile() && (/\.(bat|cmd)$/i.test(e.name) || /^ComfyUI\.exe$/i.test(e.name)))
    .map((e) => e.name)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((name) => ({ path: path.join(dir, name), kind: 'folder', label: name }))
}

// Starts a launcher as a double-click would, in its own window, so ComfyUI keeps running when IV Studio
// closes. Through PowerShell's Start-Process (the Windows shell), not as IV Studio's child: a child process
// inherits IV Studio's open sockets and keeps them after IV Studio quits. A .bat or .exe starts in its own
// folder (portable installs use paths relative to it); a shortcut keeps its own "Start in" folder.
// (explorer.exe <file> is not an option: it starts a .bat in C:\Windows\System32.)
export function launch(file) {
  if (!file || !fs.existsSync(file)) throw new Error('That ComfyUI launcher no longer exists. Pick it again in Settings → ComfyUI.')
  if (!LAUNCHABLE.test(file)) throw new Error('Pick a shortcut, a .bat file or ComfyUI.exe to start ComfyUI with.')
  if (process.platform !== 'win32') {
    spawn(file, [], { cwd: path.dirname(file), detached: true, stdio: 'ignore' }).unref()
    return
  }
  const q = (s) => `'${s.replace(/'/g, "''")}'`
  const where = /\.lnk$/i.test(file) ? '' : ` -WorkingDirectory ${q(path.dirname(file))}`
  // not detached: a detached (console-less) PowerShell starts nothing. It exits as soon as Start-Process
  // returns, and ComfyUI, started by the shell, outlives it and IV Studio.
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath ${q(file)}${where}`], { stdio: 'ignore', windowsHide: true }).unref()
}

// True when ComfyUI answers at url.
export async function comfyUp(url, timeoutMs = 3000) {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/system_stats`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

// Waits until ComfyUI answers (a first start with custom nodes can take a few minutes).
export async function waitUp(url, { timeoutMs = 6 * 60 * 1000, every = 2000 } = {}) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await comfyUp(url)) return { seconds: Math.round((Date.now() - t0) / 1000) }
    await new Promise((r) => setTimeout(r, every))
  }
  throw new Error('ComfyUI didn’t answer within 6 minutes. Check its window for errors.')
}
