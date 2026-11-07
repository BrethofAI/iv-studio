// Create → Advanced's sampler and scheduler: the defaults are the graph's own (so graph-parity holds), a choice
// lands on the preview pass's KSamplerSelect (12) and BasicScheduler (13) only, and odd names are refused.
//   node test/sampler-choice.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildPrompt } from '../src/service/graph.js'
import { DEFAULTS, planPreviews } from '../src/service/plan.js'

const template = JSON.parse(fs.readFileSync('resources/workflows/iv_studio_api.json', 'utf8'))
const meta = JSON.parse(fs.readFileSync('resources/workflows/iv_studio_api.groups.json', 'utf8'))
let n = 0
const ok = (cond, name) => (assert.ok(cond, name), n++, console.log('ok', name))
const base = { mode: 'text', prompt: 'A test shot.', character: 'none' }

ok(DEFAULTS.sampler === template['12'].inputs.sampler_name && DEFAULTS.scheduler === template['13'].inputs.scheduler, 'defaults are the graph’s own (er_sde, beta)')
const p = planPreviews({ ...base, sampler: 'euler_ancestral', scheduler: 'simple' }, [])
const g = buildPrompt(template, meta, p.groups, p.values)
ok(g['12'].inputs.sampler_name === 'euler_ancestral' && g['13'].inputs.scheduler === 'simple', 'a choice reaches the preview sampler and scheduler')
ok(!Object.keys(p.values).some((k) => /^(24|25)(\.|$)/.test(k)) && template['24'].inputs.sampler_name === 'er_sde' && template['25'].inputs.scheduler === 'linear_quadratic', 'the 2 MP finish keeps its own refine settings')
const d = buildPrompt(template, meta, planPreviews(base, []).groups, planPreviews(base, []).values)
ok(d['12'].inputs.sampler_name === 'er_sde' && d['13'].inputs.scheduler === 'beta', 'left alone, a shot renders as before')
assert.throws(() => planPreviews({ ...base, sampler: 'er sde; rm -rf' }, []), /Unknown sampler/)
assert.throws(() => planPreviews({ ...base, scheduler: '' }, []), /Unknown scheduler/)
n++
console.log('ok odd names are refused')
console.log(`sampler-choice: ${n} checks passed`)
