// The Modal account (src/service/cloud.js): signed in only when Modal's own token check names a workspace, and
// signing out takes out just the active profile.
import assert from 'node:assert/strict'
import { workspaceOf, withoutActiveProfile, Cloud, IMAGE_BUILDER } from '../src/service/cloud.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log('ok ', name))

ok('the workspace comes from `modal token info`, and nothing else counts as signed in', () => {
  assert.equal(workspaceOf('Token: ak-x\nWorkspace: matt-37887 (ac-abc)\nUser: matt-37887 (us-x)\n'), 'matt-37887')
  assert.equal(workspaceOf('Token: ak-x\r\nWorkspace: team-a (ac-1)\r\n'), 'team-a')
  // what `modal profile current` says with no token at all, and Modal's error box
  assert.equal(workspaceOf('default'), null)
  assert.equal(workspaceOf('| Token missing. Could not authenticate client. |'), null)
  assert.equal(workspaceOf(''), null)
})

ok('signing out removes the active profile and keeps the others', () => {
  const two = '[me]\ntoken_id = "a"\ntoken_secret = "b"\nactive = true\n\n[other]\ntoken_id = "c"\ntoken_secret = "d"\n'
  const r = withoutActiveProfile(two)
  assert.equal(r.removed, 'me')
  assert.ok(!r.text.includes('token_id = "a"') && r.text.includes('[other]') && r.text.includes('token_secret = "d"'))
  assert.equal(withoutActiveProfile('[solo]\ntoken_id = "a"\ntoken_secret = "b"\n').removed, 'solo')
  // two profiles and none marked active: nothing is guessed
  assert.deepEqual(withoutActiveProfile('[a]\nx = 1\n[b]\ny = 2\n'), { text: '[a]\nx = 1\n[b]\ny = 2\n', removed: null })
  const crlf = withoutActiveProfile('[x]\r\nactive = true\r\n[y]\r\nz = 1\r\n')
  assert.equal(crlf.removed, 'x')
  assert.ok(crlf.text.startsWith('[y]\r\n'))
})

// every Modal command asks for the image builder IV Studio is tested with; other programs don't get it
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivm-'))
const cloud = new Cloud({ dataDir: dir, resourcesDir: dir })
const show = ['-e', 'process.stdout.write(process.env.MODAL_IMAGE_BUILDER_VERSION || "none")']
Object.defineProperty(cloud, 'modalExe', { get: () => process.execPath, configurable: true })
assert.equal(await cloud.exec(process.execPath, show, { quiet: true }), IMAGE_BUILDER)
assert.equal(IMAGE_BUILDER, '2025.06')
Object.defineProperty(cloud, 'modalExe', { get: () => 'not-node', configurable: true })
assert.equal(await cloud.exec(process.execPath, show, { quiet: true }), 'none')
fs.rmSync(dir, { recursive: true, force: true })
n++
console.log('ok  Modal commands ask for image builder', IMAGE_BUILDER)

console.log(`\n${n} passed`)
