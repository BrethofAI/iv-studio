// Learn: every card goes somewhere real, search finds what people type, and the news shows once.   node test/learn.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CARDS, GROUPS, NEWS, TIPS, TIPS_FOR_ART, VIDEO_TITLES, searchCards, unseenNews } from '../src/renderer/src/learn.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
// the pages the app routes (App.jsx's page === '...' lines)
const app = fs.readFileSync('src/renderer/src/App.jsx', 'utf8')
const pages = new Set([...app.matchAll(/page === '([a-z-]+)'/g)].map((m) => m[1]))
ok('every card opens a page the app has, and every card id is unique', () => {
  for (const c of CARDS) assert.ok(pages.has(c.to.page), `${c.id} goes to ${c.to.page}`)
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length)
  assert.ok(CARDS.length >= 35, `${CARDS.length} cards`)
})
ok('every card and page tip names a tutorial that exists', () => {
  for (const c of CARDS) assert.ok(VIDEO_TITLES[c.video], c.id)
  for (const [k, t] of Object.entries(TIPS)) assert.ok(VIDEO_TITLES[t.video] && t.tips.length >= 2, k)
  for (const k of Object.values(TIPS_FOR_ART)) assert.ok(TIPS[k], k)
})
ok('search finds what people type', () => {
  const ids = (q) => searchCards(q).map((c) => c.id)
  assert.ok(ids('vertical').includes('reframe'))
  assert.ok(ids('tiktok').includes('reframe'))
  assert.ok(ids('remove background').includes('cutout'))
  assert.ok(ids('green screen').includes('cutout'))
  assert.ok(ids('music video').includes('reel'))
  assert.ok(ids('talk to camera').includes('voice'))
  assert.ok(ids('voiceover').includes('lines'))
  assert.equal(searchCards('').length, CARDS.length)
  assert.equal(searchCards('xyzzy').length, 0)
})
ok("each version's news shows until it's seen, and points at real cards", () => {
  const v = NEWS[0].version
  assert.ok(unseenNews(v, null))
  assert.equal(unseenNews(v, v), null)
  assert.equal(unseenNews('0.0.1', null), null)
  for (const e of NEWS) for (const i of e.items) assert.ok(CARDS.some((c) => c.id === i.card), i.card)
  assert.ok(GROUPS.every((g) => g.cards.length))
})
console.log(`${n} checks passed`)
