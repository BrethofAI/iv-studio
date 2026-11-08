// React effects must return nothing or a cleanup function. A one-line effect `useEffect(() => something())` hands
// back whatever that call returns, and in Electron's Chromium scrollTo, scrollBy, scrollIntoView and scroll now
// return Promises: React then calls the Promise as a cleanup ("destroy_ is not a function") and the whole window
// goes blank. This finds one-line effects whose call returns a Promise (or might), across the window's code.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src/renderer/src')
const files = []
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else if (/\.(jsx?|mjs)$/.test(f.name)) files.push(p)
  }
}
walk(root)

// calls that return a Promise (or something else that isn't a cleanup function)
const RISKY = /\.(scrollTo|scrollBy|scrollIntoView|scroll|play|requestFullscreen|exitFullscreen|then|catch|finally)\(|\bfetch\(|\bawait\b|\.ivstudio\.(?!.*\.on[A-Z])/
const bad = []
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const m = line.match(/use(?:Layout)?Effect\(\s*\(\)\s*=>\s*(?!\{)(.*)$/)
    // `() => () => ...` already hands back a cleanup function
    if (m && !/^\(\)\s*=>/.test(m[1]) && RISKY.test(m[1])) bad.push(`${path.relative(root, f)}:${i + 1}: ${line.trim().slice(0, 140)}`)
  })
}
assert.deepEqual(bad, [], `one-line effects that hand React a Promise (wrap the body in braces):\n${bad.join('\n')}`)
console.log(`ok  ${files.length} files: no effect hands React a Promise as its cleanup`)
