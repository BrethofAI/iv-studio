// The Modal account (src/service/cloud.js): signed in only when Modal's own token check names a workspace, and
// signing out takes out just the active profile.
import assert from 'node:assert/strict'
import { workspaceOf, withoutActiveProfile } from '../src/service/cloud.js'

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

console.log(`\n${n} passed`)
