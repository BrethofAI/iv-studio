// The "How it works" tours: every tour a page asks for exists, and every step reads well.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOURS, TOUR_FOR_ART } from '../src/renderer/src/tours.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const comps = path.join(here, '../src/renderer/src/components')
let failed = 0
const check = (name, fn) => {
  try {
    fn()
    console.log(`ok  ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL ${name}: ${err.message}`)
  }
}
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg)
}

check('every tour has steps with a title and words', () => {
  for (const [id, t] of Object.entries(TOURS)) {
    assert(t.title && t.steps.length, `${id} is empty`)
    for (const s of t.steps) {
      assert(s.title && s.text, `${id} has a step without a title or words`)
      assert(s.text.length <= 260, `${id}: "${s.title}" runs long`)
      assert(!/[—]/.test(s.title + s.text), `${id}: "${s.title}" has an em dash`)
      for (const sel of [].concat(s.at || [])) assert(typeof sel === 'string' && sel.trim() && (sel.match(/\(/g) || []).length === (sel.match(/\)/g) || []).length, `${id}: bad selector ${sel}`)
    }
  }
})

check('every banner art points at a tour', () => {
  for (const [art, id] of Object.entries(TOUR_FOR_ART)) assert(TOURS[id], `${art} -> ${id} is missing`)
})

check('every tour a page asks for exists', () => {
  const files = fs.readdirSync(comps, { recursive: true }).filter((f) => f.endsWith('.jsx'))
  let asked = 0
  for (const f of files) {
    const src = fs.readFileSync(path.join(comps, f), 'utf8')
    for (const m of src.matchAll(/<Hero\b[^>]*\bhelp="([a-z-]+)"|<Help\b[^>]*\bpage="([a-z-]+)"/g)) {
      const id = m[1] || m[2]
      asked++
      assert(TOURS[id], `${f} asks for "${id}"`)
    }
    for (const m of src.matchAll(/<Hero\b[^>]*\bart="([a-z-]+)"/g)) assert(TOUR_FOR_ART[m[1]] || /help=/.test(m[0]) || m[1] === 'music', `${f}: art "${m[1]}" has no tour`)
  }
  assert(asked >= 8, `only ${asked} pages name a tour`)
})

// A renamed class or step heading silently drops a step, so every class and heading a tour names must still be
// in the window's code.
check('every class and step heading a tour points at is still in the code', () => {
  const src = fs
    .readdirSync(path.join(here, '../src/renderer/src'), { recursive: true })
    .filter((f) => /\.(jsx|js)$/.test(f) && !f.endsWith('tours.js'))
    .map((f) => fs.readFileSync(path.join(here, '../src/renderer/src', f), 'utf8'))
    .join('\n')
  const missing = []
  for (const [id, t] of Object.entries(TOURS))
    for (const s of t.steps)
      for (const sel of [].concat(s.at || [])) {
        if (sel.startsWith('step:')) {
          const h = sel.slice(5)
          if (!src.includes(`"${h}"`) && !src.includes(`'${h}'`)) missing.push(`${id}: heading "${h}"`)
          continue
        }
        for (const [, cls] of sel.matchAll(/\.([a-zA-Z][\w-]*)/g)) if (!new RegExp(`[\\s"'\`]${cls}[\\s"'\`]`).test(src)) missing.push(`${id}: .${cls}`)
      }
  assert(!missing.length, missing.join(', '))
})

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
