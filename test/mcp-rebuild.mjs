// Rebuild over MCP, the way an agent drives it, on a generated three-shot video in a temporary data folder, up
// to the first cut with every shot kept (no GPU). Needs `npm run build` first.   node test/mcp-rebuild.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import ffmpegStatic from 'ffmpeg-ffprobe-static'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-rebuild-'))
let failures = 0
const expect = (label, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!cond) failures++
}

// red 2 s, blue 1.5 s, green 2 s with a white box in the bottom fifth from 4.5 s, over a 1 kHz tone
const video = path.join(temp, 'three.mp4')
const made = spawnSync(ffmpegStatic.ffmpegPath, ['-y', '-v', 'error',
  '-f', 'lavfi', '-i', 'color=red:s=480x854:d=2:r=24',
  '-f', 'lavfi', '-i', 'color=blue:s=480x854:d=1.5:r=24',
  '-f', 'lavfi', '-i', 'color=0x2f7a3a:s=480x854:d=2:r=24',
  '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=5.5',
  '-filter_complex', "[2]drawbox=x=40:y=720:w=400:h=90:color=white:t=fill:enable='gte(t,1)'[g];[0][1][g]concat=n=3:v=1:a=0,format=yuv420p[v]",
  '-map', '[v]', '-map', '3', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', video])
if (made.status !== 0) throw new Error(`couldn't make the test video: ${made.stderr}`)

const transport = new StdioClientTransport({ command: path.resolve('node_modules/electron/dist/electron.exe'), args: [path.resolve('out/main/mcp.js')], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', IV_STUDIO_DATA: temp } })
const c = new Client({ name: 'rebuild-test', version: '1' })
await c.connect(transport)
const call = async (name, args = {}) => {
  const r = await c.callTool({ name, arguments: args })
  return { error: r.isError ? r.content.at(-1).text : null, value: r.structuredContent, images: r.content.filter((x) => x.type === 'image').length }
}

const { tools } = await c.listTools()
const names = ['rebuild_read', 'view_rebuild_shot', 'save_rebuild_reading', 'save_rebuild_plan', 'approve_rebuild_plan', 'make_rebuild_frames', 'approve_rebuild_frames', 'make_rebuild_shots', 'rebuild_first_cut', 'get_rebuild', 'list_rebuilds', 'delete_rebuild']
expect('the rebuild tools are there', names.every((n) => tools.some((t) => t.name === n)), names.filter((n) => !tools.some((t) => t.name === n)).join(', '))

const noRights = await call('rebuild_read', { file: video })
expect('rebuild_read without rights -> refused', !!noRights.error && /rights: true/.test(noRights.error), noRights.error)

const read = await call('rebuild_read', { file: video, name: 'Three', rights: true })
const id = read.value?.id
expect('rebuild_read with rights -> 3 shots and a picture', !read.error && read.value.shots.length === 3 && read.images === 1 && !!read.value.rightsConfirmedAt, read.error || read.value.shots.map((s) => `${s.start}-${s.end}`).join(' '))
expect('the caption box is noticed in shot 3', read.value?.shots[2].bandBottom.length === 1, String(read.value?.shots[2].bandBottom))

const view = await call('view_rebuild_shot', { rebuildId: id, index: 2 })
expect('view_rebuild_shot -> two pictures', !view.error && view.images === 2, view.error || '')

const reading = await call('save_rebuild_reading', { rebuildId: id, shots: [1, 2, 3].map((index) => ({ index, kind: 'code_graphics', why: 'flat colour fields', description: 'A flat colour fills the frame.', captions: index === 3 ? [{ text: 'HELLO', from: 1, to: 2, where: 'bottom' }] : [] })) })
expect('save_rebuild_reading -> planning', !reading.error && reading.value.status === 'planning' && reading.value.shots.every((s) => s.suggested === 'keep'), reading.error || reading.value.status)

const noPrompt = await call('save_rebuild_plan', { rebuildId: id, plan: { shots: [{ index: 1, route: 'h3' }, { index: 2, route: 'keep' }, { index: 3, route: 'keep' }] } })
expect('an h3 shot without a prompt -> error naming shot 1', !!noPrompt.error && /Shot 1/.test(noPrompt.error), noPrompt.error)

const plan = await call('save_rebuild_plan', { rebuildId: id, plan: { shots: [1, 2, 3].map((index) => ({ index, route: 'keep' })) } })
expect('an all-keep plan saves', !plan.error && plan.value.planApprovedAt === null, plan.error || '')

const early = await call('make_rebuild_frames', { rebuildId: id })
expect('frames before the plan is approved -> refused', !!early.error && /OK/.test(early.error), early.error)

const approved = await call('approve_rebuild_plan', { rebuildId: id })
expect('approve_rebuild_plan', !approved.error && !!approved.value.planApprovedAt)

const cut = await call('rebuild_first_cut', { rebuildId: id })
expect('rebuild_first_cut', !cut.error && !!cut.value.editId, cut.error || JSON.stringify(cut.value))
if (cut.value?.editId) {
  const e = (await call('get_edit', { editId: cut.value.editId })).value
  const v1 = e.tracks.V1
  const end = v1.length ? v1.at(-1).end : 0
  expect('V1 has a clip per shot, to the end of the video', v1.length === 3 && Math.abs(end - 5.5) <= 0.05, `${v1.length} clips, ends at ${end.toFixed(3)}`)
  expect('V1 is muted, A1 is the guide', v1.every((x) => x.muted) && e.tracks.A1.length === 1, `A1 ends at ${e.tracks.A1[0]?.end}`)
  // kept footage already carries its caption, so it isn't titled again
  expect('no titles over original footage', e.tracks.T1.length === 0, JSON.stringify(e.tracks.T1.map((x) => [x.title.content, x.start])))
  expect('the format is vertical', e.settings.format === 'vertical' && e.settings.fps === 24)
  expect('warnings name the guide track and the kept shots', cut.value.warnings.some((w) => /guide/.test(w)) && cut.value.kept.length === 3)
}

const list = await call('list_rebuilds')
expect('list_rebuilds has it', !list.error && list.value.items.some((x) => x.id === id && x.status === 'editing'))

const del = await call('delete_rebuild', { rebuildId: id })
expect('delete_rebuild', !del.error && (await call('list_rebuilds')).value.items.length === 0)

await c.close()
fs.rmSync(temp, { recursive: true, force: true })
console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
