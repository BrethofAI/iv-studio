// Comfy Cloud (cloud.comfy.org): Comfy's own hosted ComfyUI, billed per run on the person's Comfy account. It runs
// ComfyUI's core nodes and a fixed set of custom node packs that Comfy maintains, with its own model library: nobody can
// add node packs there. So what IV Studio can do on it depends on what it offers today, and IV Studio asks it
// (object_info) instead of assuming: pictures and music use core nodes; shots need IV Studio's node packs.
import { Comfy, COMFY_CLOUD } from './comfy.js'

// A key is checked before it's kept: Comfy Cloud answers /api/user only for a valid key on an active plan.
export async function checkKey(key) {
  const k = String(key || '').trim()
  if (!k) throw new Error('Paste your Comfy API key first.')
  await new Comfy(COMFY_CLOUD, 'iv-studio', null, k).req('/user', { timeout: 20000 })
  return true
}

// What works there, in words for the Cloud page, from the setup check and the picture and music lists run against
// Comfy Cloud. setup: Studio.checkSetup(); images: Images.status(); music: Music.status().
export function summarise({ setup, images, music }) {
  const items = setup?.items || []
  const blocking = items.filter((i) => i.status === 'missing')
  const packs = blocking.filter((i) => i.kind === 'node_pack').map((i) => i.label)
  const models = blocking.filter((i) => i.kind === 'model').map((i) => i.label)
  const reached = items[0]?.id === 'comfyui' && items[0].status === 'ok'
  const why = [packs.length && `node packs Comfy Cloud doesn't offer (${packs.join(', ')})`, models.length && `models it doesn't have (${models.join(', ')})`].filter(Boolean).join(' and ')
  return {
    reached,
    error: reached ? null : items[0]?.detail || 'Comfy Cloud did not answer.',
    shots: { ready: reached && !!setup?.ready, note: !reached ? null : setup?.ready ? 'Shots, hunts and finishes run here.' : `Shots need ${why || 'more than Comfy Cloud has'}.` },
    pictures: (images?.families || []).map((f) => ({ id: f.id, label: f.label, ready: !!f.ready, models: f.models?.length || 0, note: f.ready ? `${f.models.length} model${f.models.length === 1 ? '' : 's'}` : f.models?.length ? `needs ${f.missing.join(', ')}` : 'no model there' })),
    music: (music?.engines || []).map((e) => ({ id: e.id, label: e.label, ready: !!e.ready, note: e.ready ? 'ready' : e.missing?.length ? `needs ${e.missing.map((m) => m.label || m).join(', ')}` : 'not there' }))
  }
}

export { COMFY_CLOUD }
