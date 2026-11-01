// Cut-outs: the mask graphs for a picture and a video.   node test/cutout.mjs
import assert from 'node:assert/strict'
import { cutoutGraph } from '../src/service/cutout.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
ok('a picture: SAM 3 detection from the words, its mask saved as a picture', () => {
  const g = cutoutGraph({ kind: 'image', source: 'iv_studio/keeper.png', what: 'the old man', prefix: 'iv_studio/cutouts/k_mask' })
  assert.equal(g.words.inputs.text, 'the old man')
  assert.deepEqual(g.find.inputs.conditioning, ['words', 0])
  assert.equal(g.find.class_type, 'SAM3_Detect')
  assert.equal(g.mask.class_type, 'SaveImage')
  assert.equal(g.sam.inputs.ckpt_name, 'sam3.1_multiplex_fp16.safetensors')
})
ok('a video: SAM 3 tracking at up to 1008 px, every object joined, the mask saved as a video at the clip rate', () => {
  const g = cutoutGraph({ kind: 'video', source: 'C:/clips/a.mp4', what: 'person', prefix: 'p', fps: 30 })
  assert.equal(g.load.class_type, 'VHS_LoadVideoPath')
  assert.equal(g.load.inputs.force_rate, 0, 'every frame of the clip')
  assert.equal(g.small.inputs.largest_size, 1008)
  assert.equal(g.masks.inputs.object_indices, '', 'all tracked objects')
  assert.equal(g.mask.inputs.frame_rate, 30)
  assert.deepEqual(g.mask.inputs.images, ['img', 0])
})
console.log(`${n} checks passed`)
