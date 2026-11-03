// Starting ComfyUI (src/service/comfylauncher.js): which launchers are found, in what order, and that only a
// ComfyUI on this PC can be started. Builds a fake home folder; starts nothing.
//   node test/comfylauncher.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findLaunchers, isComfyFolder, isLocalUrl, launch, launchersIn } from '../src/service/comfylauncher.js'

let pass = 0
let fail = 0
const ok = (cond, what) => (cond ? (pass++, console.log(`  ok   ${what}`)) : (fail++, console.log(`  FAIL ${what}`)))
const touch = (p) => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, ''))

ok(isLocalUrl('http://127.0.0.1:8188') && isLocalUrl('http://localhost:8188/') && isLocalUrl('http://[::1]:8188'), 'this PC: 127.0.0.1, localhost and ::1')
ok(!isLocalUrl('http://192.168.1.20:8188') && !isLocalUrl('https://pod-8189.proxy.runpod.net') && !isLocalUrl('not a url'), 'not this PC: another machine, the cloud, nonsense')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-launcher-'))
const env = { USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'), PUBLIC: path.join(home, 'Public') }
try {
  ok(findLaunchers({ env, drives: [] }).length === 0, 'nothing installed: nothing found')
  touch(path.join(home, 'ComfyUI_windows_portable', 'run_nvidia_gpu.bat'))
  touch(path.join(home, 'ComfyUI_windows_portable', 'run_cpu.bat'))
  touch(path.join(env.LOCALAPPDATA, 'Programs', '@comfyorgcomfyui-electron', 'ComfyUI.exe'))
  touch(path.join(home, 'Desktop', 'ComfyUI.lnk'))
  touch(path.join(home, 'Desktop', 'notes.txt'))
  touch(path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ComfyUI', 'ComfyUI.lnk'))
  const found = findLaunchers({ env, drives: [] })
  const names = found.map((f) => path.relative(home, f.path))
  console.log('    found:', names.join(' | '))
  ok(found[0].path.endsWith(path.join('Desktop', 'ComfyUI.lnk')), 'a desktop shortcut comes first (it carries the person’s own flags)')
  ok(found.some((f) => f.kind === 'desktop app') && found.some((f) => f.kind === 'portable'), 'the ComfyUI Desktop app and a portable install are found too')
  ok(names.indexOf(path.join('ComfyUI_windows_portable', 'run_nvidia_gpu.bat')) < names.indexOf(path.join('ComfyUI_windows_portable', 'run_cpu.bat')), 'the GPU .bat before the CPU one')
  ok(!names.some((n) => n.endsWith('notes.txt')), 'only things that can start ComfyUI')
  let refused = 0
  for (const bad of [path.join(home, 'missing.bat'), path.join(home, 'Desktop', 'notes.txt')]) {
    try {
      launch(bad)
    } catch {
      refused++
    }
  }
  ok(refused === 2, 'a missing file or a non-launcher is refused, not run')

  // a picked ComfyUI folder (Settings → ComfyUI → ComfyUI folder)
  const portable = path.join(home, 'ComfyUI_windows_portable')
  touch(path.join(portable, 'ComfyUI', 'main.py'))
  touch(path.join(portable, 'run_nvidia_gpu_seedhunter.bat'))
  touch(path.join(portable, 'README_VERY_IMPORTANT.txt'))
  const app = path.join(env.LOCALAPPDATA, 'Programs', '@comfyorgcomfyui-electron')
  ok(isComfyFolder(portable) && isComfyFolder(app) && !isComfyFolder(path.join(home, 'Desktop')), 'a portable install and the Desktop app’s folder count as ComfyUI; the desktop doesn’t')
  const inFolder = launchersIn(portable).map((f) => f.label)
  console.log('    in the folder:', inFolder.join(' | '))
  ok(inFolder[0] === 'run_nvidia_gpu.bat' && inFolder[1] === 'run_nvidia_gpu_seedhunter.bat' && inFolder.at(-1) === 'run_cpu.bat' && !inFolder.some((n) => n.endsWith('.txt')), 'its start files: run_nvidia_gpu.bat, then GPU variants, CPU last, nothing else')
} finally {
  fs.rmSync(home, { recursive: true, force: true })
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
