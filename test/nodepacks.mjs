// The node pack installer (src/service/nodepacks.js) without the network: which packs a ComfyUI needs, its
// Python, the requirements it may install, copying IV Studio's own pack, and leaving existing folders alone.
//   node test/nodepacks.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findPython, installPacks, missingPacks, requirementsFor } from '../src/service/nodepacks.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'resources', 'models.json'), 'utf8'))
let n = 0
const ok = async (name, fn) => {
  await fn()
  n++
  console.log(`ok  ${name}`)
}

await ok('every pack has a folder name, a pinned source and the feature it is for', () => {
  for (const p of manifest.node_packs) {
    assert.ok(p.dir && p.for && p.classes.length, p.label)
    assert.ok(p.bundled || p.registry || (p.git && /^[0-9a-f]{40}$/.test(p.commit)), `${p.label}: needs a registry release, a full commit or bundled`)
    if (p.registry) assert.match(p.registry, /^https:\/\/cdn\.comfy\.org\/[^/]+\/[^/]+\/\d+\.\d+\.\d+\/node\.(zip|tar\.gz)$/)
    if (p.bundled) assert.ok(fs.existsSync(path.join(ROOT, 'resources', p.bundled, '__init__.py')), p.bundled)
  }
  assert.equal(new Set(manifest.node_packs.map((p) => p.dir)).size, manifest.node_packs.length, 'folder names are unique')
})

await ok('missing packs: any absent node, and never the other OS’s pack', () => {
  const all = Object.fromEntries(manifest.node_packs.flatMap((p) => p.classes).map((c) => [c, {}]))
  assert.deepEqual(missingPacks(manifest, all), [])
  const noIv = { ...all }
  delete noIv.IVShotList
  assert.deepEqual(missingPacks(manifest, noIv).map((p) => p.dir), ['ComfyUI-IV-Studio'])
  const none = missingPacks(manifest, {}).map((p) => p.dir)
  assert.ok(none.includes('comfyui-dlss5-enhancer-v15') && !none.includes('comfyui-frame-interpolation'))
  const linux = missingPacks(manifest, {}, { linux: true }).map((p) => p.dir)
  assert.ok(!linux.includes('comfyui-dlss5-enhancer-v15') && linux.includes('comfyui-frame-interpolation'))
})

await ok('requirements keep ComfyUI’s torch and skip git+ lines without git', () => {
  const text = '# comment\ntorch\ntorchvision>=0.20\nnumpy\n\nxformers\nopencv-python\ngit+https://github.com/facebookresearch/sam2\n'
  assert.deepEqual(requirementsFor(text), { kept: ['numpy', 'opencv-python', 'git+https://github.com/facebookresearch/sam2'], skipped: ['torch', 'torchvision>=0.20', 'xformers'] })
  assert.deepEqual(requirementsFor(text, { git: false }).kept, ['numpy', 'opencv-python'])
})

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-nodes-test-'))
try {
  await ok('ComfyUI’s Python: the portable build, a venv in ComfyUI or beside it', () => {
    const portable = path.join(tmp, 'portable')
    fs.mkdirSync(path.join(portable, 'ComfyUI'), { recursive: true })
    fs.mkdirSync(path.join(portable, 'python_embeded'))
    fs.writeFileSync(path.join(portable, 'python_embeded', 'python.exe'), '')
    assert.equal(findPython(path.join(portable, 'ComfyUI'), 'win32'), path.join(portable, 'python_embeded', 'python.exe'))
    const venv = path.join(tmp, 'venv', 'ComfyUI')
    fs.mkdirSync(path.join(venv, '.venv', 'bin'), { recursive: true })
    fs.writeFileSync(path.join(venv, '.venv', 'bin', 'python'), '')
    assert.equal(findPython(venv, 'linux'), path.join(venv, '.venv', 'bin', 'python'))
    assert.equal(findPython(path.join(tmp, 'nothing'), 'win32'), null)
  })

  await ok('IV Studio’s own pack is copied in; a folder already there is left alone', async () => {
    const customNodes = path.join(tmp, 'custom_nodes')
    fs.mkdirSync(path.join(customNodes, 'rgthree-comfy'), { recursive: true })
    fs.writeFileSync(path.join(customNodes, 'rgthree-comfy', 'mine.txt'), 'keep me')
    const packs = manifest.node_packs.filter((p) => p.dir === 'ComfyUI-IV-Studio' || p.dir === 'rgthree-comfy')
    const steps = []
    const results = await installPacks(packs, { customNodes, python: null, resourcesDir: path.join(ROOT, 'resources'), onProgress: (u) => steps.push(`${u.dir}:${u.step}`) })
    assert.deepEqual(results.map((r) => [r.dir, r.status]), [['rgthree-comfy', 'skipped'], ['ComfyUI-IV-Studio', 'installed']].sort((a, b) => packs.findIndex((p) => p.dir === a[0]) - packs.findIndex((p) => p.dir === b[0])))
    assert.ok(fs.existsSync(path.join(customNodes, 'ComfyUI-IV-Studio', '__init__.py')))
    assert.equal(fs.readFileSync(path.join(customNodes, 'rgthree-comfy', 'mine.txt'), 'utf8'), 'keep me')
    assert.ok(steps.includes('ComfyUI-IV-Studio:done') && steps.includes('rgthree-comfy:skipped'))
  })
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${n} checks passed`)
