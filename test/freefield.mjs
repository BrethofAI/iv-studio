// Freefield's apps as IV Studio runs them (src/service/freefield.js): every vendored app loads, its inputs bind to
// real nodes, filling sets the values (templates, random seeds, select checks), and model files this PC has as
// another build are swapped in.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CLIP_FX, fillGraph, loadApp, swapModels } from '../src/service/freefield.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log('ok ', name))
const RES = new URL('../resources', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const manifest = JSON.parse(fs.readFileSync(`${RES}/models.json`, 'utf8'))

ok('every effect has its Freefield app, and every input binds to a node in it', () => {
  for (const [fx, spec] of Object.entries(CLIP_FX)) {
    const { app, graph } = loadApp(RES, spec.app)
    assert.equal(app.id, spec.app, fx)
    for (const input of app.inputs) for (const b of input.bind || []) assert.ok(graph[b.node], `${spec.app}: ${input.id} binds to missing node ${b.node}`)
    assert.ok((app.inputs || []).some((i) => i.type === spec.media || (spec.media === 'image' && i.type === 'image')), `${fx} takes a ${spec.media}`)
  }
  assert.ok(fs.existsSync(`${RES}/licenses/Freefield-MIT.txt`), 'Freefield’s licence ships with the app')
})

ok('filling: values, templates, random seeds, and select and slider checks', () => {
  const { app, graph } = loadApp(RES, 'reshoot')
  const g = fillGraph(app, graph, { clip: 'iv_studio/clipfx/a.mp4', azimuth: 45, prompt: 'a calm street', seed: -1 })
  assert.equal(g['1'].inputs.file, 'iv_studio/clipfx/a.mp4')
  assert.equal(g['5'].inputs.azimuth, 45)
  assert.equal(g['20'].inputs.prompt, 'crossview. a calm street')
  assert.ok(Number.isInteger(g['30'].inputs.noise_seed) && g['30'].inputs.noise_seed >= 0, 'a random seed')
  assert.equal(graph['1'].inputs.file === 'iv_studio/clipfx/a.mp4', false, 'the vendored graph itself is untouched')
  assert.throws(() => fillGraph(app, graph, { azimuth: 400 }), /-90 to 90/)
  const fx = loadApp(RES, 'effects')
  const effect = fx.app.inputs.find((i) => i.id === 'effect')
  assert.throws(() => fillGraph(fx.app, fx.graph, { effect: 'no-such-effect' }), /one of/)
  assert.doesNotThrow(() => fillGraph(fx.app, fx.graph, { effect: effect.options[0].value }))
})

ok('model files this PC has as another build are swapped in; the rest are reported', () => {
  const { app, graph } = loadApp(RES, 'reshoot')
  const te = Object.values(graph).find((nd) => /qwen3vl_32b_minimax_h3/.test(JSON.stringify(nd.inputs)))
  const field = Object.entries(te.inputs).find(([, v]) => /qwen3vl_32b/.test(v))[0]
  const ivTe = manifest.models.find((m) => m.id === 'text_encoder').match
  const info = {}
  // a ComfyUI that lists only IV Studio's own H3 text encoder for that loader, and nothing else for any loader
  for (const nd of Object.values(graph)) {
    for (const [f, v] of Object.entries(nd.inputs || {})) {
      if (typeof v !== 'string' || !/\.(safetensors|gguf)$/i.test(v)) continue
      info[nd.class_type] ||= { input: { required: {} } }
      const list = (info[nd.class_type].input.required[f] ||= [[]])[0]
      list.push(nd === te && f === field ? ivTe : v)
    }
  }
  const r = swapModels(fillGraph(app, graph, {}), info, manifest)
  assert.deepEqual(r.missing, [])
  assert.equal(Object.values(r.graph).find((nd) => nd.class_type === te.class_type && nd.inputs[field]).inputs[field], ivTe, 'the int8 encoder is swapped for IV Studio’s')
  info[te.class_type].input.required[field] = [['something_else.safetensors']]
  assert.ok(swapModels(graph, info, manifest).missing.some((m) => /qwen3vl_32b/.test(m)), 'nothing to swap in: reported missing')
})

console.log(`\n${n} passed`)
