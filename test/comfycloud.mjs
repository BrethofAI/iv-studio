// Comfy Cloud (src/service/comfycloud.js, comfy.js with an apiKey) against a stand-in for cloud.comfy.org: the X-API-Key
// header, its /api routes and history_v2, its error codes in words, and the "what works there" summary. No network.
//   node test/comfycloud.mjs
import assert from 'node:assert/strict'
import http from 'node:http'
import { Comfy, COMFY_CLOUD } from '../src/service/comfy.js'
import { summarise } from '../src/service/comfycloud.js'

let n = 0
const ok = async (name, fn) => {
  await fn()
  n++
  console.log(`ok  ${name}`)
}

const seen = []
const server = http.createServer((req, res) => {
  seen.push({ url: req.url, key: req.headers['x-api-key'], auth: req.headers.authorization })
  const send = (code, body) => (res.writeHead(code, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(body)))
  const key = req.headers['x-api-key']
  if (key === 'broke') return send(402, { code: 'insufficient_credits', message: 'no credits' })
  if (key === 'lapsed') return send(429, { code: 'inactive', message: 'inactive subscription' })
  if (key !== 'good') return send(401, { code: 'unauthorized', message: 'bad key' })
  if (req.url === '/api/user') return send(200, { id: 'u1' })
  if (req.url === '/api/history_v2/p1') return send(200, { p1: { outputs: { 9: { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } }, status: { status_str: 'success', completed: true } } })
  if (req.url === '/api/system_stats') return send(200, { system: { os: 'posix', comfyui_version: '0.42' }, devices: [{ name: 'cuda:0 RTX 6000 Pro', type: 'cuda', vram_total: 96 * 1024 ** 3 }] })
  send(404, { code: 'not_found' })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/api`

await ok('the address is cloud.comfy.org/api', () => assert.equal(COMFY_CLOUD, 'https://cloud.comfy.org/api'))

await ok('a key makes it remote and hosted, sent as X-API-Key with no Bearer header', async () => {
  const c = new Comfy(base, 'iv-studio', null, 'good')
  assert.equal(c.remote, true)
  assert.equal(c.hosted, true)
  await c.req('/user')
  const last = seen.at(-1)
  assert.deepEqual([last.url, last.key, last.auth], ['/api/user', 'good', undefined])
  // a gate token (Modal, RunPod) is remote but not hosted
  const gate = new Comfy(base, 'iv-studio', 'tok')
  assert.deepEqual([gate.remote, gate.hosted, gate.headers().Authorization], [true, false, 'Bearer tok'])
})

await ok('history comes from history_v2 in ComfyUI’s shape; system stats from /api', async () => {
  const c = new Comfy(base, 'iv-studio', null, 'good')
  const h = await c.history('p1')
  assert.equal(h.p1.outputs[9].images[0].filename, 'a.png')
  assert.equal(seen.at(-1).url, '/api/history_v2/p1')
  assert.equal((await c.systemStats()).system.os, 'posix')
  assert.match(c.viewUrl({ filename: 'a.png' }), /\/api\/view\?filename=a\.png/)
})

await ok('free memory asks nothing of Comfy Cloud', async () => {
  const before = seen.length
  await new Comfy(base, 'iv-studio', null, 'good').freeMemory()
  assert.equal(seen.length, before)
})

await ok('its error codes say what to do', async () => {
  await assert.rejects(new Comfy(base, 'x', null, 'nope').req('/user'), /refused the API key/)
  await assert.rejects(new Comfy(base, 'x', null, 'broke').req('/user'), /credits have run out/)
  await assert.rejects(new Comfy(base, 'x', null, 'lapsed').req('/user'), /active paid subscription/)
})

await ok('the summary: shots blocked by missing packs, pictures and music by family', () => {
  const setup = {
    ready: false,
    items: [
      { id: 'comfyui', status: 'ok' },
      { id: 'pack:IV Studio', label: 'IV Studio', status: 'missing', kind: 'node_pack' },
      { id: 'model:h3', label: 'MiniMax H3', status: 'missing', kind: 'model' },
      { id: 'pack:SeedVR2', label: 'SeedVR2', status: 'warn', kind: 'node_pack' }
    ]
  }
  const images = { families: [{ id: 'sdxl', label: 'SDXL', ready: true, models: ['a', 'b'], missing: [] }, { id: 'flux2', label: 'Flux.2 Klein', ready: false, models: [], missing: [] }] }
  const music = { engines: [{ id: 'ace', label: 'ACE-Step', ready: false, missing: [{ label: 'ACE-Step 1.5' }] }] }
  const s = summarise({ setup, images, music })
  assert.equal(s.reached, true)
  assert.equal(s.shots.ready, false)
  assert.match(s.shots.note, /node packs Comfy Cloud doesn't offer \(IV Studio\) and models it doesn't have \(MiniMax H3\)/)
  assert.deepEqual(s.pictures.map((p) => [p.id, p.ready, p.note]), [['sdxl', true, '2 models'], ['flux2', false, 'no model there']])
  assert.equal(s.music[0].note, 'needs ACE-Step 1.5')
  const down = summarise({ setup: { ready: false, items: [{ id: 'comfyui', status: 'missing', detail: 'refused' }] } })
  assert.deepEqual([down.reached, down.error, down.shots.note], [false, 'refused', null])
})

server.close()
console.log(`\n${n} checks passed`)
