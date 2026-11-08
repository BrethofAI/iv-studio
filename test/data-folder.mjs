// Where IV Studio's data folder is (src/service/paths.js: IV_STUDIO_DATA, the portable "data" folder beside
// IV Studio.exe, a moved folder's pointer, the default) and moving it (src/service/datafolder.js: copy, links,
// path rewriting, the check, the pointer, removing the old copy). Works in temporary folders; touches nothing else.
//   node test/data-folder.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { contentDir, dataDir, dataLocation, incognitoDir, POINTER_FILE, readSettings, writeSettings } from '../src/service/paths.js'
import { chooseTarget, copyData, discardCopy, movableEntries, oldCopy, removeOldCopy, rewritePaths, verifyCopy, writePointer } from '../src/service/datafolder.js'

let pass = 0
let fail = 0
const ok = (cond, what) => (cond ? (pass++, console.log(`  ok   ${what}`)) : (fail++, console.log(`  FAIL ${what}`)))
const throws = async (fn, re, what) => {
  try {
    await fn()
    ok(false, `${what} (didn't throw)`)
  } catch (err) {
    ok(re.test(err.message), `${what}: ${err.message}`)
  }
}
const write = (p, text = '') => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, text))
const WIN = process.platform === 'win32'
const same = (a, b) => (WIN ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b))

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-data-folder-'))
try {
  // ---------- dataDir() ----------
  console.log('where the data folder is')
  const appdata = path.join(root, 'AppData', 'Roaming')
  const env = { APPDATA: appdata, HOME: path.join(root, 'home') }
  const def = path.join(appdata, 'IV Studio')
  const install = path.join(root, 'Programs', 'IV Studio')
  const exe = path.join(install, 'IV Studio.exe')
  write(exe)

  let loc = dataLocation({ env, execPath: exe, platform: 'win32' })
  ok(loc.source === 'default' && loc.dir === def, `default: %APPDATA%\\IV Studio (${loc.dir})`)
  ok(dataDir({ env, execPath: exe, platform: 'win32' }) === def, 'dataDir() gives the same folder')
  ok(dataLocation({ env: { HOME: '/Users/m' }, execPath: '/x/IV Studio', platform: 'darwin' }).dir === path.join('/Users/m', 'Library', 'Application Support', 'IV Studio'), 'default on a Mac: ~/Library/Application Support/IV Studio')

  // portable: a "data" folder beside IV Studio.exe
  fs.mkdirSync(path.join(install, 'data'))
  loc = dataLocation({ env, execPath: exe, platform: 'win32' })
  ok(loc.source === 'portable' && loc.dir === path.join(install, 'data'), 'portable: the data folder beside IV Studio.exe')
  ok(dataLocation({ env, execPath: path.join(install, 'iv-studio'), platform: 'linux' }).source === 'portable', 'portable: the Linux binary name counts too')
  const dev = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
  write(dev)
  fs.mkdirSync(path.join(path.dirname(dev), 'data'))
  ok(dataLocation({ env, execPath: dev, platform: 'win32' }).source === 'default', 'not portable: a "data" folder beside electron.exe (a dev copy) is ignored')
  ok(dataLocation({ env, execPath: path.join(root, 'nodejs', 'node.exe'), platform: 'win32' }).source === 'default', 'not portable: plain Node (an MCP run in development)')
  fs.rmSync(path.join(install, 'data'), { recursive: true })
  fs.writeFileSync(path.join(install, 'data'), 'not a folder')
  ok(dataLocation({ env, execPath: exe, platform: 'win32' }).source === 'default', 'not portable: a file called "data" isn’t a data folder')
  fs.rmSync(path.join(install, 'data'))

  // moved: the pointer in the default folder
  const moved = path.join(root, 'D', 'IV Studio Data')
  fs.mkdirSync(moved, { recursive: true })
  write(path.join(def, POINTER_FILE), JSON.stringify({ dir: moved }))
  loc = dataLocation({ env, execPath: exe, platform: 'win32' })
  ok(loc.source === 'moved' && loc.dir === moved && !loc.missing, 'moved: the folder the pointer names')
  fs.rmSync(moved, { recursive: true })
  loc = dataLocation({ env, execPath: exe, platform: 'win32' })
  ok(loc.source === 'moved' && loc.missing === true && loc.dir === moved, 'moved, drive unplugged: still that folder, marked missing (the app asks)')
  write(path.join(def, POINTER_FILE), JSON.stringify({ dir: 'relative\\path' }))
  ok(dataLocation({ env, execPath: exe, platform: 'win32' }).source === 'default', 'a pointer without an absolute path is ignored')
  write(path.join(def, POINTER_FILE), '{ not json')
  ok(dataLocation({ env, execPath: exe, platform: 'win32' }).source === 'default', 'a broken pointer is ignored')
  write(path.join(def, POINTER_FILE), JSON.stringify({ dir: moved }))
  fs.mkdirSync(moved, { recursive: true })

  // order: IV_STUDIO_DATA beats portable beats moved
  fs.mkdirSync(path.join(install, 'data'))
  ok(dataLocation({ env, execPath: exe, platform: 'win32' }).source === 'portable', 'portable beats a moved folder')
  const forced = path.join(root, 'forced')
  loc = dataLocation({ env: { ...env, IV_STUDIO_DATA: forced }, execPath: exe, platform: 'win32' })
  ok(loc.source === 'env' && loc.dir === forced, 'IV_STUDIO_DATA beats everything')
  fs.rmSync(path.join(install, 'data'), { recursive: true })
  fs.rmSync(path.join(def, POINTER_FILE))
  fs.rmSync(moved, { recursive: true })

  // ---------- moving ----------
  console.log('moving the data folder')
  // a data folder as the app leaves it: Electron's files, IV Studio's, Incognito with its junctions, paths inside
  const from = def
  for (const n of ['Cache/data_0', 'Local Storage/leveldb/1.log', 'Preferences', 'lockfile', '.updaterId']) write(path.join(from, n), 'electron')
  writeSettings({ comfyFolder: 'E:\\ComfyUI_windows_portable', incognito: false }, from)
  write(path.join(from, 'projects', 'p1', 'project.json'), JSON.stringify({ name: 'One', still: path.join(from, 'media', 'a.png'), comfy: 'E:\\ComfyUI\\output\\x.mp4' }, null, 2))
  write(path.join(from, 'media', 'a.png'), 'PNGDATA')
  write(path.join(from, 'voiceengine', 'venv', 'pyvenv.cfg'), `home = ${path.join(from, 'cloud', 'python', 'cpython-3.12')}\nversion_info = 3.12.10\n`)
  write(path.join(from, 'voiceengine', 'models', 'big.bin'), Buffer.alloc(20 * 1024 * 1024, 7))
  write(path.join(from, 'cloud', 'python', 'cpython-3.12', 'python.exe'), 'py')
  write(path.join(from, 'shinobi', 'venv', 'pyvenv.cfg'), 'home = C:\\Python312\n')
  write(path.join(from, 'shinobi', 'installed.json'), '{"commit":"abc"}')
  write(path.join(from, 'characters.json'), '[]')
  write(path.join(from, 'loras', 'x.json'), '{}')
  // a folder whose name starts with the data folder's (must not be rewritten)
  write(path.join(from, 'notes.json'), JSON.stringify({ other: from + ' Old\\thing', exact: from }))
  writeSettings({ incognito: true }, from)
  const inc = incognitoDir(from) // makes Incognito's junctions to the shared tools
  ok(fs.lstatSync(path.join(inc, 'voiceengine')).isSymbolicLink(), 'Incognito links the shared tools (before the move)')
  write(path.join(inc, 'projects', 'secret', 'project.json'), JSON.stringify({ still: path.join(inc, 'media', 's.png') }))
  writeSettings({ incognito: false }, from)

  const entries = movableEntries(from)
  ok(!entries.some((e) => ['cache', 'local storage', 'preferences', 'lockfile', '.updaterid', POINTER_FILE].includes(e.toLowerCase())), `Electron’s own files stay (${entries.join(', ')})`)
  ok(entries.includes('projects') && entries.includes('incognito') && entries.includes('settings.json'), 'IV Studio’s files move')

  // where it goes
  const drive = path.join(root, 'D')
  fs.mkdirSync(drive, { recursive: true })
  ok(same(chooseTarget(path.join(drive, 'Fresh'), { from, defaultDir: def }), path.join(drive, 'Fresh')), 'a new folder: used as is')
  write(path.join(drive, 'Busy', 'stuff.txt'), 'x')
  ok(same(chooseTarget(path.join(drive, 'Busy'), { from, defaultDir: def }), path.join(drive, 'Busy', 'IV Studio')), 'a folder with files in it: a new "IV Studio" folder inside')
  write(path.join(drive, 'Busy', 'IV Studio', 'x.txt'), 'x')
  await throws(() => chooseTarget(path.join(drive, 'Busy'), { from, defaultDir: def }), /already has files/, 'refused: its IV Studio folder has files too')
  await throws(() => chooseTarget(from, { from, defaultDir: def }), /already/, 'refused: the folder in use')
  await throws(() => chooseTarget(path.join(from, 'projects'), { from, defaultDir: def }), /outside/, 'refused: inside the folder in use')
  await throws(() => chooseTarget(def, { from: path.join(drive, 'Elsewhere'), defaultDir: def }), /old copy/, 'refused: back to the default while it still has IV Studio’s files')

  // the copy
  const to = chooseTarget(path.join(drive, 'IV Data'), { from, defaultDir: def })
  const phases = new Set()
  let lastDone = 0
  const copied = await copyData(from, to, { onProgress: (p) => (phases.add(p.phase), (lastDone = p.done)) })
  ok(phases.has('counting') && phases.has('copied') && lastDone === copied.bytes, `progress reported (${[...phases].join(', ')}), ${copied.bytes} bytes`)
  ok(fs.readFileSync(path.join(to, 'media', 'a.png'), 'utf8') === 'PNGDATA' && fs.statSync(path.join(to, 'voiceengine', 'models', 'big.bin')).size === 20 * 1024 * 1024, 'files copied, big ones too')
  ok(!fs.existsSync(path.join(to, 'Cache')) && !fs.existsSync(path.join(to, 'lockfile')), 'Electron’s files not copied')
  const proj = JSON.parse(fs.readFileSync(path.join(to, 'projects', 'p1', 'project.json'), 'utf8'))
  ok(proj.still === path.join(to, 'media', 'a.png') && proj.comfy === 'E:\\ComfyUI\\output\\x.mp4', 'paths into the data folder now point at the copy; ComfyUI’s don’t change')
  ok(fs.readFileSync(path.join(to, 'voiceengine', 'venv', 'pyvenv.cfg'), 'utf8').includes(`home = ${path.join(to, 'cloud', 'python', 'cpython-3.12')}\n`), 'a Python env on IV Studio’s own Python points at the copy')
  ok(fs.readFileSync(path.join(to, 'shinobi', 'venv', 'pyvenv.cfg'), 'utf8') === 'home = C:\\Python312\n', 'a Python env on the system Python is left alone')
  const notes = JSON.parse(fs.readFileSync(path.join(to, 'notes.json'), 'utf8'))
  ok(notes.other === from + ' Old\\thing' && notes.exact === to, 'only whole folder names are rewritten')
  ok(readSettings(to).comfyFolder === 'E:\\ComfyUI_windows_portable', 'settings copied (the ComfyUI folder kept)')
  ok(JSON.parse(fs.readFileSync(path.join(from, 'projects', 'p1', 'project.json'), 'utf8')).still === path.join(from, 'media', 'a.png'), 'the original is untouched')

  // Incognito's junctions point into the copy, and incognitoDir still works there
  const link = path.join(to, 'incognito', 'voiceengine')
  ok(fs.lstatSync(link).isSymbolicLink() && same(fs.readlinkSync(link).replace(/^\\\\\?\\/, ''), path.join(to, 'voiceengine')), 'Incognito’s junctions point into the copy, not the old folder')
  ok(fs.existsSync(path.join(to, 'incognito', 'voiceengine', 'models', 'big.bin')), 'and reach the copied voice engine')
  ok(same(fs.readlinkSync(path.join(to, 'incognito', 'shinobi', 'venv')).replace(/^\\\\\?\\/, ''), path.join(to, 'shinobi', 'venv')), 'the nested Shinobi venv junction too')
  writeSettings({ incognito: true }, to)
  ok(same(contentDir(to), path.join(to, 'incognito')) && fs.existsSync(path.join(to, 'incognito', 'cloud', 'python', 'cpython-3.12', 'python.exe')), 'Incognito works on the moved folder')
  writeSettings({ incognito: false }, to)
  ok(JSON.parse(fs.readFileSync(path.join(to, 'incognito', 'projects', 'secret', 'project.json'), 'utf8')).still === path.join(to, 'incognito', 'media', 's.png'), 'Incognito’s own files moved and rewritten')

  // the check
  ok(await verifyCopy(to, copied), 'the copy checks out')
  fs.truncateSync(path.join(to, 'media', 'a.png'), 3)
  await throws(() => verifyCopy(to, copied), /didn’t check out.*a\.png/, 'a short file fails the check')
  fs.writeFileSync(path.join(to, 'media', 'a.png'), 'PNGDATA')
  fs.writeFileSync(path.join(to, 'projects', 'p1', 'project.json'), '{ broken')
  await throws(() => verifyCopy(to, copied), /project\.json/, 'a rewritten file that isn’t JSON fails the check')
  fs.writeFileSync(path.join(to, 'projects', 'p1', 'project.json'), JSON.stringify(proj))

  // a failed move is cleaned up
  const failed = path.join(drive, 'Failed')
  await copyData(from, failed, { entries: ['media', 'characters.json'] })
  await discardCopy(failed, ['media', 'characters.json'])
  ok(!fs.existsSync(failed), 'a failed copy is removed (and its new folder)')

  // the pointer, then the app's view from the next start
  writePointer(def, { to, from, entries: copied.entries })
  loc = dataLocation({ env, execPath: exe, platform: 'win32' })
  ok(loc.source === 'moved' && loc.dir === to, 'after the move: the next start uses the new folder')
  const old = oldCopy(def, to)
  ok(old && old.dir === from && old.entries.includes('projects'), 'the old copy is known')

  // removing the old copy: only IV Studio's files, never through a junction, Electron's stay
  const target = path.join(to, 'voiceengine', 'models', 'big.bin')
  await removeOldCopy(def, to)
  ok(!fs.existsSync(path.join(from, 'projects')) && !fs.existsSync(path.join(from, 'incognito')) && !fs.existsSync(path.join(from, 'settings.json')), 'old copy removed')
  ok(fs.existsSync(path.join(from, 'Cache', 'data_0')) && fs.existsSync(path.join(from, 'Preferences')), 'Electron’s files in the default folder stay')
  ok(fs.existsSync(target) && fs.existsSync(path.join(to, 'projects', 'p1', 'project.json')), 'the new copy is untouched')
  loc = dataLocation({ env, execPath: exe, platform: 'win32' })
  ok(loc.source === 'moved' && loc.dir === to && !oldCopy(def, to), 'still pointed at the new folder; no old copy left')

  // and back to the default folder
  ok(same(chooseTarget(def, { from: to, defaultDir: def }), def), 'moving back to the (now empty) default folder is allowed')
  const back = await copyData(to, def)
  await verifyCopy(def, back)
  writePointer(def, { to: def, from: to, entries: back.entries })
  ok(dataLocation({ env, execPath: exe, platform: 'win32' }).dir === def && JSON.parse(fs.readFileSync(path.join(def, 'projects', 'p1', 'project.json'), 'utf8')).still === path.join(def, 'media', 'a.png'), 'moved back, paths point home again')
  await removeOldCopy(def, def)
  ok(!fs.existsSync(to) && !fs.existsSync(path.join(def, POINTER_FILE)) && dataLocation({ env, execPath: exe, platform: 'win32' }).source === 'default', 'old copy gone, pointer gone: plain default again')

  ok(rewritePaths('"C:\\\\Users\\\\m\\\\AppData\\\\Roaming\\\\IV Studio\\\\x"', 'C:\\Users\\m\\AppData\\Roaming\\IV Studio', 'D:\\IV') === '"D:\\\\IV\\\\x"', 'JSON-escaped Windows paths are rewritten')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
