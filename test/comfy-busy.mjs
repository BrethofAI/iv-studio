// A ComfyUI that is running but slow to answer is not "not running" (a Reddit report: "ComfyUI did not answer
// /system_stats within 5s", and Install missing node packs saying to start a ComfyUI that was already up).
// Stand-ins only: a server that takes connections and never replies (busy), one that answers like ComfyUI on another
// port, and a closed port.
//   node test/comfy-busy.mjs
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Comfy } from '../src/service/comfy.js'
import { comfyState, comfyUp, findComfyElsewhere } from '../src/service/comfylauncher.js'
import { whyUnreached } from '../src/service/setup.js'
import { Studio } from '../src/service/studio.js'

let pass = 0
let fail = 0
const ok = (cond, what) => (cond ? (pass++, console.log(`  ok   ${what}`)) : (fail++, console.log(`  FAIL ${what}`)))
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)))

const held = []
const busy = net.createServer((s) => held.push(s)) // takes the connection, never answers
const comfyLike = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(req.url === '/system_stats' ? { system: { os: process.platform, comfyui_version: '0.42.5' }, devices: [] } : {}))
})
const closed = net.createServer()
const busyPort = await listen(busy)
const comfyPort = await listen(comfyLike)
const closedPort = await listen(closed)
await new Promise((r) => closed.close(r)) // a port nothing listens on
const at = (p) => `http://127.0.0.1:${p}`

try {
  ok((await comfyState(at(comfyPort))) === 'up', 'a ComfyUI that answers is up')
  ok((await comfyState(at(busyPort), 800)) === 'busy', 'one that takes the connection but doesn’t answer is busy')
  ok((await comfyState(at(closedPort))) === 'down', 'a closed port is down')
  ok((await comfyUp(at(busyPort), 800)) === true, 'busy counts as up, so IV Studio never starts a second ComfyUI over it')

  const slow = new Comfy(at(busyPort))
  let err = await slow.systemStats({ timeout: 800 }).catch((e) => e)
  ok(err.busy && /running at .* but didn’t answer/.test(err.message) && !/not running/.test(err.message), 'a slow answer says ComfyUI is running but busy')
  const why = await whyUnreached(slow, err, { ports: [] })
  ok(why.busy && why.status === 'warn', 'Setup marks it busy (a warning, not missing)')

  const gone = new Comfy(at(closedPort))
  err = await gone.systemStats().catch((e) => e)
  ok(err.down && /not running/.test(err.message), 'nothing listening says not running')
  ok((await findComfyElsewhere(at(closedPort), { ports: [closedPort, comfyPort] })) === at(comfyPort), 'a ComfyUI on another usual port is found')
  ok((await findComfyElsewhere(at(closedPort), { ports: [busyPort], timeoutMs: 600 })) === null, 'a port that doesn’t answer like ComfyUI isn’t taken for one')
  ok((await findComfyElsewhere('http://192.168.1.20:8188', { ports: [comfyPort] })) === null, 'another machine’s address is left alone')
  const moved = await whyUnreached(gone, err, { ports: [comfyPort] })
  ok(moved.address === at(comfyPort) && /Nothing answers at/.test(moved.detail), 'Setup names the address that answers')

  ok(new Comfy(at(comfyPort)).remote === false && (await new Comfy(at(comfyPort)).systemStats()).system.comfyui_version === '0.42.5', 'a ComfyUI that answers still reads as before')

  // Install missing node packs: busy is "wait", gone is "start it"
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-busy-'))
  const studio = new Studio({ dataDir, resourcesDir: path.resolve('resources'), comfyUrl: at(busyPort) })
  studio.comfy.objectInfo = () => studio.comfy.req('/object_info', { timeout: 800 })
  err = await studio.installNodePacks({}).catch((e) => e)
  ok(/busy/.test(err.message) && !/Start ComfyUI first/.test(err.message), 'node packs on a busy ComfyUI: wait, not "start ComfyUI"')
  const studio2 = new Studio({ dataDir, resourcesDir: path.resolve('resources'), comfyUrl: at(closedPort) })
  err = await studio2.installNodePacks({}).catch((e) => e)
  ok(/Start ComfyUI first|Nothing answers at/.test(err.message), 'node packs with no ComfyUI: start it, or the address that answers')
  console.log('    ', err.message)
  fs.rmSync(dataDir, { recursive: true, force: true })
} finally {
  held.forEach((s) => s.destroy())
  busy.close()
  comfyLike.close()
}
console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
