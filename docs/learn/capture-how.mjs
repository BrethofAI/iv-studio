// Screenshots for Learn's "How it works" pop-ups (learnHow.js). Drives a test copy of IV Studio over DevTools
// (start it with --remote-debugging-port=<port> and --disable-backgrounding-occluded-windows on copied data),
// puts each page in the state its explanation needs, finds the controls to highlight, and saves:
//   src/renderer/src/assets/learn-shots/<id>.webp   the picture (the content column only, 1.5x)
//   src/renderer/src/learnShots.json                each picture's size and its numbered marks, in percent
// Run:  node docs/learn/capture-how.mjs <port> [id ...]
// Only use your own or IV Studio's media here: these pictures ship inside the app.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../..')
const outDir = path.join(repo, 'src/renderer/src/assets/learn-shots')
const jsonFile = path.join(repo, 'src/renderer/src/learnShots.json')
const ffmpeg = path.join(repo, 'node_modules/ffmpeg-ffprobe-static/ffmpeg.exe')
const [port = '9338', ...only] = process.argv.slice(2)
const PROMPTS = JSON.parse(readFileSync(path.join(repo, 'docs/learn/capture-prompts.json'), 'utf8')) // checker-clean sample prompts
// Media dropped into pages: a picture (IV_LEARN_PICTURE, used for frames and picture edits) and a clip with sound
// (IV_LEARN_CLIP, for Continue). Without them those items fall back to Tess's ready-made face.
const MEDIA = {
  tess: path.join(repo, 'resources/characters/tess.jpg'),
  farmer: process.env.IV_LEARN_PICTURE || path.join(repo, 'resources/characters/tess.jpg'),
  clip: process.env.IV_LEARN_CLIP || path.join(repo, 'resources/characters/tess.jpg')
}

// ---- DevTools plumbing
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let n = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) (pending.get(m.id)(m), pending.delete(m.id))
}
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (js) => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${js}})()`, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error')
  return r.result?.result?.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const W = 1280, H = 2400, DPR = 1.2
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false })

// Helpers inside the page: find an element by CSS and the text it holds (or a row by its label).
await ev(`
  window.__f = (sel, re, scope) => {
    const root = scope ? __f(...scope) : document.querySelector('.page') || document
    if (!root) return null
    const rx = re ? new RegExp(re, 'i') : null
    const els = [...root.querySelectorAll(sel)].filter((e) => !rx || rx.test(e.textContent.trim().replace(/\\s+/g, ' ')))
    return els.filter((e) => !els.some((o) => o !== e && e.contains(o)))[0] || null
  }
  window.__row = (label) => [...document.querySelectorAll('.page .row')].find((r) => new RegExp('^' + label, 'i').test(r.textContent.trim())) || null
  return 1`)

// Actions
const A = {
  go: (to) => ev(`window.dispatchEvent(new CustomEvent('iv:go', { detail: ${JSON.stringify(to)} })); await new Promise(r=>setTimeout(r,900)); return 1`),
  page: (name) => ev(`[...document.querySelectorAll('nav button, aside button, .sidebar button')].find(x=>new RegExp('^\\\\d*\\\\s*${name}$','i').test(x.textContent.trim())).click(); return 1`),
  click: (sel, re) => ev(`const e=__f(${JSON.stringify(sel)}, ${JSON.stringify(re)}); if(!e) throw new Error('no ${sel} ${re}'); e.click(); return 1`),
  type: async (sel, text, ph) => {
    await ev(`const e=[...document.querySelector('.page').querySelectorAll(${JSON.stringify(sel)})].find(x=>(x.placeholder||'').includes(${JSON.stringify(ph)})); if(!e) throw new Error('no field ${ph}'); e.focus(); const set=Object.getOwnPropertyDescriptor(e.constructor.prototype,'value').set; set.call(e, ${JSON.stringify(text)}); e.dispatchEvent(new Event('input',{bubbles:true})); return 1`)
  },
  drop: async (sel, re, file) => {
    const r = await ev(`const e=__f(${JSON.stringify(sel)}, ${JSON.stringify(re)}); e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2, y:b.y+b.height/2}`)
    const data = { items: [], files: [file], dragOperationsMask: 1 }
    for (const type of ['dragEnter', 'dragOver', 'drop']) await send('Input.dispatchDragEvent', { type, x: r.x, y: r.y, data })
  },
  scrollTop: () => ev(`(document.querySelector('.main')||document.scrollingElement).scrollTo(0,0); document.querySelectorAll('*').forEach(e=>{ if(e.scrollTop>0) e.scrollTop=0 }); return 1`),
  shot: (name) => ev(`await new Promise(r=>setTimeout(r,800)); const t=[...document.querySelectorAll('.page .tile')].find(x=>x.textContent.includes(${JSON.stringify(name)})); t.click(); return 1`),
  videos: () => ev(`const vs=[...document.querySelectorAll('.page video')]; const t0=Date.now(); while(vs.some(v=>v.readyState<2) && Date.now()-t0<20000) await new Promise(r=>setTimeout(r,300)); for (const v of vs) { try { v.currentTime = Math.min(2.5, (v.duration||3)/2) } catch {} } await new Promise(r=>setTimeout(r,800)); return vs.length`),
  wait: (ms) => wait(ms)
}

const createVideo = (mode) => [['go', { page: 'create', create: 'video', mode }], ['wait', 600]]
const charSeg = ['.segmented', 'Tess.*Theo.*None']
const SPEC = {
  text: {
    setup: [...createVideo('text'), ['click', '.segmented button', '^Tess$'], ['type', 'textarea', PROMPTS.text, 'Describe the shot'], ['wait', 600]],
    marks: [['.mode-card', '^Text'], charSeg, ['textarea', null, 'Describe the shot'], ['.segmented', '^16:9'], ['button', '^Hunt']]
  },
  frames: {
    setup: [...createVideo('frames'), ['click', '.segmented button', '^None$'], ['drop', '.media', null, MEDIA.farmer], ['wait', 1500]],
    marks: [['.mode-card', '^First / last'], ['.media', null], ['.segmented', '^16:9'], ['button', '^Write my prompt'], ['button', '^Hunt']]
  },
  reference: {
    setup: [...createVideo('reference'), ['click', '.segmented button', '^None$'], ['drop', '.media', null, MEDIA.tess], ['wait', 1500], ['type', 'textarea', PROMPTS.reference, 'Describe the shot'], ['wait', 600]],
    marks: [['.mode-card', '^References'], ['.media', null], ['textarea', null, 'Describe the shot'], ['button', '^Hunt']]
  },
  continue: {
    setup: [...createVideo('continue'), ['click', '.segmented button', '^None$'], ['drop', '.media', null, MEDIA.clip], ['wait', 4000]],
    marks: [['.mode-card', '^Continue'], ['.media', null], ['textarea', null, 'Describe the shot'], ['button', '^Hunt']]
  },
  writer: {
    setup: [...createVideo('text'), ['click', '.segmented button', '^Tess$'], ['type', 'textarea', 'Tess in a parked car at night admits she kept the letter', 'idea in plain words']],
    marks: [['textarea', null, 'idea in plain words'], ['button', '^Write my prompt'], ['textarea', null, 'Describe the shot'], ['span', '(claude code|codex|local|context ir)']]
  },
  board: {
    setup: [...createVideo('text'), ['click', '.segmented button', '^Tess$'], ['click', 'button', 'Stage it on a board'], ['wait', 1200]],
    marks: [['.stage-board > :first-child', null], ['.stage-who', null], ['.segmented', '^Wide'], ['.stage-words', null], ['button', '^Make a previs clip']]
  },
  voice: {
    setup: [...createVideo('text'), ['click', '.segmented button', '^Tess$'], ['type', 'input', 'I kept the letter. I know I said I’d burn it.', 'What Tess says']],
    marks: [charSeg, ['input', null, 'What Tess says'], ['button', '^Speak it'], ['button', 'Recording to lip-sync']]
  },
  best: {
    setup: [['page', 'shots'], ['shot', "Sower's Tale s3_02"], ['wait', 1500], ['videos']],
    marks: [['.candidate', null], ['button', 'Rank these takes'], ['button', '^Compare$'], ['button', '^Review$'], ['button', '^Pick$']]
  },
  finish: {
    setup: [['page', 'shots'], ['shot', "Sower's Tale s3_02"], ['wait', 1500], ['clickNth', 'button', '^Pick$', 1], ['wait', 900], ['videos']],
    marks: [['button', '^Picked$'], ['.row', '^Final size'], ['.row', '^Enhancer'], ['.row', '^Frame rate'], ['button', '^Finish$']]
  },
  // The items below were captured on the tutorial test data (The Seed and the other sample films, made with Tess,
  // Theo and the Sower's Tale art); the ones above on a copy of Matt's own shots.
  image: {
    setup: [['go', { page: 'create', create: 'image', mode: 'generate' }], ['wait', 900], ['type', 'textarea', 'An old farmer kneeling in a golden field at sunset, planting a single apple seed, his dog beside him. Warm painterly light, a 3D animated film still.', 'Describe the picture']],
    marks: [['.mode-card', '^Generate'], ['.segmented', 'Flux'], ['button', '^\\+ Add LoRA'], ['textarea', null, 'Describe the picture'], ['.segmented', '^1:1'], ['button', '^Make \\d']]
  },
  'image-edit': {
    setup: [['go', { page: 'create', create: 'image', mode: 'edit' }], ['wait', 900], ['drop', '.image-ref.add', null, MEDIA.farmer], ['wait', 1500], ['type', 'textarea', 'Make it night, with a full moon and fireflies. Keep the farmer, his dog and their poses the same.', 'Say what to change']],
    marks: [['.mode-card', '^Edit'], ['.segmented', 'Flux'], ['.image-refs', null], ['textarea', null, 'Say what to change'], ['button', '^Edit$']]
  },
  film: {
    setup: [['film', 'The Seed'], ['step', 'Idea']],
    marks: [['button', '^[✓\\d]Idea'], ['button', '^[✓\\d]Story'], ['button', '^[✓\\d]Cast'], ['button', '^[✓\\d]Storyboard'], ['button', '^[✓\\d]Film it'], ['button', '^[✓\\d]Watch']],
    minH: 640
  },
  faces: {
    setup: [['film', 'The Seed'], ['step', 'Cast and places']],
    marks: [['select', null], ['textarea', null, 'What do they look like'], ['button', '^Draw a new face'], ['button', '^Use a picture'], ['div', '^Add someone else']]
  },
  rooms: {
    setup: [['film', 'The Seed'], ['step', 'Cast and places']],
    marks: [['.wiz-place-pic', null], ['textarea', 'Golden light'], ['button', '^Remove photo'], ['button', '^(Draw the angles again|\\+ More angles)']],
    scrollTo: 0
  },
  animatic: {
    setup: [['film', 'The Seed'], ['step', 'Storyboard']],
    marks: [['button', 'Play the animatic'], ['.wiz-panel', null], ['span', '^Farmer: '], ['button', '^Plan it all again']]
  },
  onetake: {
    setup: [['film', 'The Seed'], ['step', 'Storyboard'], ['mouse', '.page img', null, 'left', 2], ['wait', 1200]],
    marks: [['*', '^Scene 1 · Shot 3$'], ['label', 'Carry straight on'], ['.wiz-panel', null, null, 1]]
  },
  sequence: {
    setup: [['go', { page: 'sequences' }], ['wait', 900], ['click', 'button', '^Untitled sequence'], ['wait', 1800]],
    marks: [['button', '^← All sequences'], ['textarea', null, null], ['button', '^\\+ Add (a )?shot'], ['.segmented', 'One take|Shot by shot']]
  },
  editor: {
    vh: 900, keepScroll: true,
    setup: [['edit', 'The Seed']],
    marks: [['.ed-panel', null, null, 0], ['.ed-panel', null, null, 1], ['.ed-panel', null, null, 2], ['.ed-toolbar', null], ['.ed-tl-wrap', null], ['button', '^Export MP4']]
  },
  extend: {
    vh: 900, keepScroll: true,
    setup: [['edit', 'The Seed'], ['mouse', '.tl-clip.video', null, 'right', 1]],
    marks: [['.tl-clip.video', null, null, 1], ['.tl-menu *', '^Extend…'], ['.tl-clip.video', 'extend']]
  },
  fill: {
    vh: 900, keepScroll: true,
    setup: [['edit', 'The Seed'], ['gap']],
    marks: [['.tl-menu', null], ['.tl-menu *', '^Fill this gap']]
  },
  retake: {
    vh: 900, keepScroll: true,
    setup: [['edit', 'The Seed'], ['mouse', '.tl-clip.video', null, 'right', 2]],
    marks: [['.tl-clip.video', null, null, 2], ['.tl-menu *', '^Retake this stretch']]
  },
  cutout: {
    vh: 900, keepScroll: true,
    setup: [['edit', 'The Seed'], ['mouse', '.tl-clip.video', null, 'right', 1]],
    marks: [['.tl-clip.video', null, null, 1], ['.tl-menu *', '^Cut out…']]
  },
  reframe: {
    vh: 900, keepScroll: true,
    setup: [['edit', 'The Seed'], ['click', '.segmented button', '^Vertical$'], ['wait', 600], ['mouse', '.tl-clip.video', null, 'right', 1]],
    marks: [['.segmented', '^1080p'], ['.tl-clip.video', null, null, 1], ['.tl-menu *', '^Reframe to']]
  },
  loudness: {
    vh: 900, keepScroll: true,
    setup: [['edit', 'The Seed']],
    marks: [['.segmented', '^Online'], ['button', '^Export MP4']]
  },
  character: {
    setup: [['go', { page: 'characters' }], ['wait', 1500]],
    marks: [['.portrait', null], ['.portrait-add', null], ['.cast-new', null]]
  },
  'voice-design': {
    setup: [['go', { section: 'audio', page: 'voices' }], ['wait', 1200], ['type', 'textarea', 'An old farmer from the countryside, in his seventies. Warm, low and a little gravelly; slow and kind, with a dry smile in it. Close, natural recording outdoors.', 'A woman in her forties']],
    marks: [['textarea', null, 'A woman in her forties'], ['input', null, 'Hi. So this is'], ['button', '^Make three takes'], ['.voice-card, .voice', null]],
    scrollTo: 0
  },
  'voice-clone': {
    setup: [['go', { section: 'audio', page: 'voices' }], ['wait', 1200]],
    marks: [['button', '^\\+ Recording'], ['select', null]],
    scrollTo: 1
  },
  lines: {
    setup: [['go', { section: 'audio', page: 'lines' }], ['wait', 1200], ['type', 'textarea', 'One seed. One root. For tomorrow’s tree.', 'Okay, so I found']],
    marks: [['select', null], ['textarea', null, 'Okay, so I found'], ['input', null, null, 0], ['button', '^Speak$'], ['button', '^Use in a shot']]
  },
  song: {
    setup: [['go', { section: 'audio', page: 'music' }], ['wait', 1200]],
    marks: [['.segmented', 'MiniMax Music'], ['textarea', null, 'Warm neo-soul'], ['textarea', null, '[Verse]'], ['.segmented', '^30s'], ['button', '^Make it'], ['button', '^Add to edit']]
  },
  reel: {
    setup: [['go', { page: 'reel' }], ['wait', 1200]],
    marks: [['button', '^\\+ Add pictures'], ['button', '^Normal song'], ['.segmented', '^Calm'], ['.segmented', '^16:9'], ['button', '^(Add pictures and a song|Make)']]
  },
  sizzle: {
    setup: [['go', { page: 'sizzle' }], ['wait', 1200], ['type', 'input', 'https://infinitevariance.ai', 'your-site']],
    marks: [['input', null, 'your-site'], ['.segmented', '^16:9'], ['button', '^Capture the site']],
    minH: 300
  },
  shinobi: {
    setup: [['go', { page: 'shinobi' }], ['wait', 1200]],
    marks: [['button', '^Set up Shinobi']],
    minH: 300
  },
  replace: {
    setup: [['go', { page: 'replace' }], ['wait', 1200]],
    marks: [['.mode-card', '^Swap people'], ['button', '^\\+ Source video'], ['button', '^Tess Marlow'], ['button', '^Paint the frames']]
  },
  loras: {
    setup: [['go', { page: 'loras' }], ['wait', 4000], ['css', '.lora-card img, .lora-card video, .lora-thumb, .lora-card canvas { filter: blur(16px) saturate(0.6) !important; } .lora-card { overflow: hidden }']],
    marks: [['button', '^Discover$'], ['button', '^Style$'], ['.lora-card', null], ['button', '^Yours']]
  },
  library: {
    setup: [['go', { page: 'media' }], ['wait', 1200], ['type', 'input', 'Seed', 'Search'], ['wait', 1200]],
    marks: [['.segmented', '^All'], ['input', null, 'Search'], ['.lib-tile', null], ['span', 'versions']]
  },
  incognito: {
    whole: true,
    setup: [['go', { page: 'settings' }], ['wait', 1200]],
    marks: [['*', '^Incognito$', null, 0, true], ['.row', '^Incognito renders']],
    keepScroll: true
  },
  startcomfy: {
    setup: [['go', { page: 'settings' }], ['wait', 1200]],
    marks: [['input', null, null, 0], ['button', '^Choose folder'], ['button', '^Choose…$'], ['label', 'Start ComfyUI when'], ['button', '^Setup$']],
    scrollTo: 4
  },
  cloud: {
    setup: [['go', { page: 'cloud' }], ['wait', 1500]],
    marks: [['.cloud-choices.two', null], ['.cloud-choices.three', null], ['.step, .cloud-step', null]]
  },
  agents: {
    setup: [['go', { page: 'settings' }], ['wait', 1200]],
    marks: [['button', '^Copy message'], ['.segmented', 'Claude Code.*Codex.*Other'], ['button', '^Copy command'], ['button', '^Add the skill']],
    setupAfter: [['into', 'button', '^Copy message']]
  }
}
A.clickNth = (sel, re, i) => ev(`const els=[...document.querySelector('.page').querySelectorAll(${JSON.stringify(sel)})].filter(e=>new RegExp(${JSON.stringify(re)},'i').test(e.textContent.trim())); els[${i}].click(); return els.length`)

// More actions, for the editor, the film wizard and pages outside Create.
Object.assign(A, {
  // open a film in the Projects wizard, and one of its steps
  film: (name) => ev(`window.dispatchEvent(new CustomEvent('iv:go',{detail:{page:'projects'}})); await new Promise(r=>setTimeout(r,1300)); const t=[...document.querySelectorAll('.page .proj-card-name')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(name)})); t.click(); await new Promise(r=>setTimeout(r,1800)); return 1`),
  step: (name) => ev(`const b=[...document.querySelectorAll('.page button')].find(x=>x.textContent.trim().replace(/^[✓\\d]+/,'').startsWith(${JSON.stringify(name)})); b.click(); await new Promise(r=>setTimeout(r,1400)); return 1`),
  // open an edit in the editor
  edit: (name) => ev(`window.dispatchEvent(new CustomEvent('iv:go',{detail:{page:'edits'}})); await new Promise(r=>setTimeout(r,1300)); const t=[...document.querySelectorAll('.page .tile, .page button')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(name)})); t.click(); await new Promise(r=>setTimeout(r,2500)); return 1`),
  // a real mouse click (left or right) on the centre of an element, or at an offset inside it
  mouse: async (sel, re, button = 'left', nth = 0, fx = 0.5) => {
    const r = await ev(`const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>!${JSON.stringify(re)} || new RegExp(${JSON.stringify(re)},'i').test(e.textContent.trim()+' '+(e.title||''))); const e=els[${nth}]; if(!e) throw new Error('no ${sel}'); const b=e.getBoundingClientRect(); return {x:b.x+b.width*${fx}, y:b.y+b.height/2}`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button, buttons: button === 'right' ? 2 : 1, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button, buttons: 0, clickCount: 1 })
    await wait(700)
  },
  key: async (key, code = key) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key === 'Delete' ? 46 : 0 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: key === 'Delete' ? 46 : 0 })
    await wait(600)
  },
  // scroll an element to the top of its scrolling box
  into: (sel, re) => ev(`const e=__f(${JSON.stringify(sel)}, ${JSON.stringify(re)}); if(!e) throw new Error('no ' + ${JSON.stringify(sel)}); e.scrollIntoView({block:'start'}); let p=e.parentElement; while(p && !(p.scrollHeight>p.clientHeight+4 && getComputedStyle(p).overflowY!=='visible')) p=p.parentElement; if(p) p.scrollBy(0,-160); await new Promise(r=>setTimeout(r,500)); return 1`),
  // leave a gap on V1 (delete a clip in the middle of its row) and right-click the empty space where it was
  gap: async () => {
    const r = await ev(`const all=[...document.querySelectorAll('.tl-clip.video')]; const tops={}; all.forEach(e=>{ const y=Math.round(e.getBoundingClientRect().y); tops[y]=(tops[y]||0)+1 }); const y=+Object.entries(tops).sort((a,b)=>b[1]-a[1])[0][0]; const row=all.filter(e=>Math.round(e.getBoundingClientRect().y)===y).sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x); const e=row[Math.min(2,row.length-2)]; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}`)
    const click = async (button) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button, buttons: button === 'right' ? 2 : 1, clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button, buttons: 0, clickCount: 1 })
      await wait(700)
    }
    await click('left')
    await A.key('Delete')
    await click('right')
  },
  // extra CSS for the picture only (e.g. blur third-party previews)
  // (always: no live preview panel and no test copy badge in the pictures)
  css: (text) => ev(`let s=document.getElementById('__learn_css'); if(!s){ s=document.createElement('style'); s.id='__learn_css'; document.head.appendChild(s) } s.textContent=${JSON.stringify('.live-pip, .test-copy { display: none !important } ' + text)}; return 1`),
  // swap personal details in the page's text for generic ones
  scrub: () => ev(`const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const R=[[/C:\\\\Users\\\\[^\\\\]+/gi,'C:\\\\Users\\\\you'],[/F:\\\\ComfyUI-cu130-v0\\.30\\.0/gi,'C:\\\\ComfyUI'],[/F:\\\\ComfyUI/gi,'C:\\\\ComfyUI']]; let n; while((n=w.nextNode())){ let t=n.nodeValue; for(const [a,b] of R) t=t.replace(a,b); if(t!==n.nodeValue) n.nodeValue=t } document.querySelectorAll('input').forEach(i=>{ for(const [a,b] of R) i.value=i.value.replace(a,b) }); return 1`)
})

// The placeholder-aware finder for marks: [selector, text regex, placeholder, which match (0 = first), whole window]
async function rectOf([sel, re, ph, nth = 0, anywhere = false]) {
  return ev(`
    const root=${anywhere ? 'document' : "document.querySelector('.page')"};
    const rx=${JSON.stringify(re)} ? new RegExp(${JSON.stringify(re)},'i') : null;
    const els=[...root.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{
      if (${JSON.stringify(ph)} && !(e.placeholder||'').includes(${JSON.stringify(ph)})) return false;
      if (rx && !rx.test(e.textContent.trim().replace(/\\s+/g,' '))) return false;
      const b=e.getBoundingClientRect(); return b.width>0 && b.height>0 });
    // the innermost match: drop any element that contains another match
    const inner=els.filter(e=>!els.some(o=>o!==e && e.contains(o)));
    const e=inner[${nth}]; if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}`)
}

const all = existsSync(jsonFile) ? JSON.parse(readFileSync(jsonFile, 'utf8')) : {}
mkdirSync(outDir, { recursive: true })
for (const [id, spec] of Object.entries(SPEC)) {
  if (only.length && !only.includes(id)) continue
  try {
    // spec.vh: the window height for this picture (the editor fills the window, so it gets a normal one)
    const vh = spec.vh || H
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: vh, deviceScaleFactor: DPR, mobile: false })
    await A.css('')
    await A.go({ section: 'video', page: 'home' })
    await wait(700)
    for (const [act, ...args] of spec.setup) await A[act](...args)
    if (!spec.keepScroll) await A.scrollTop()
    for (const [act, ...args] of spec.setupAfter || []) await A[act](...args)
    await A.scrub()
    await wait(500)
    // bring the marks into view: scroll the page so the first mark sits near the top
    const first = spec.keepScroll || spec.setupAfter ? null : await rectOf(spec.marks[spec.scrollTo || 0])
    if (first) await ev(`const el=document.elementFromPoint(${first.x + 2}, ${first.y + 2}); let p=el; while(p && !(p.scrollHeight>p.clientHeight+4 && getComputedStyle(p).overflowY!=='visible')) p=p.parentElement; if(p) p.scrollBy(0, ${Math.round(first.y - 140)}); return 1`)
    await wait(600)
    const rects = []
    for (const m of spec.marks) rects.push(await rectOf(m))
    const found = rects.filter(Boolean)
    if (!found.length) throw new Error('no marks found')
    // the picture: the page's column (or the whole window for spec.whole), from just above the first mark to
    // just below the last
    const col = spec.whole ? { x: 0, w: W + 12 } : await ev(`const p=document.querySelector('.page'); const b=p.getBoundingClientRect(); return {x:b.x,w:b.width}`)
    const top = spec.whole ? 0 : Math.max(42, Math.min(...found.map((r) => r.y)) - 36)
    const bottom = Math.min(vh, Math.max(...found.map((r) => r.y + r.h)) + 36)
    const clip = { x: col.x, y: top, width: col.w - 12, height: Math.max(spec.minH || 360, bottom - top), scale: 1 }
    if (clip.y + clip.height > vh) clip.height = vh - clip.y
    if (clip.height < 40 || clip.y >= vh) throw new Error('marks are outside the window (' + Math.round(top) + 'px)')
    const s = await send('Page.captureScreenshot', { format: 'png', clip })
    const png = path.join(outDir, `${id}.png`)
    writeFileSync(png, Buffer.from(s.result.data, 'base64'))
    const webp = path.join(outDir, `${id}.webp`)
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '82', webp])
    execFileSync('cmd', ['/c', 'del', png.replace(/\//g, '\\')])
    const pct = (v, of) => Math.round((v / of) * 1000) / 10
    all[id] = {
      w: Math.round(clip.width * DPR),
      h: Math.round(clip.height * DPR),
      marks: rects.map((r, i) => (r ? { n: i + 1, x: pct(r.x - clip.x, clip.width), y: pct(r.y - clip.y, clip.height), w: pct(r.w, clip.width), h: pct(r.h, clip.height) } : null)).filter(Boolean)
    }
    // saved after every picture, so a stopped run keeps what it already captured
    writeFileSync(jsonFile, JSON.stringify(all, null, 1) + '\n')
    console.log(id, 'ok', `${rects.filter(Boolean).length}/${rects.length} marks`, rects.map((r, i) => (r ? '' : `missing ${i + 1}`)).join(' '))
  } catch (err) {
    console.log(id, 'FAILED', err.message)
  }
}
writeFileSync(jsonFile, JSON.stringify(all, null, 1) + '\n')
ws.close()
