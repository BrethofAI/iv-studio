// What's new: newest first, one entry per version, and shown once per version.
import { NEWS, unseenNews } from '../src/renderer/src/news.js'

let failed = 0
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) failed++
}
const v = (s) => s.split('.').map(Number)
const newer = (a, b) => {
  const [x, y] = [v(a), v(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

check('every entry has a version and items with words', NEWS.every((n) => /^\d+\.\d+\.\d+$/.test(n.version) && n.items.length && n.items.every((i) => i.text?.length > 10)))
check('newest first, each version once', NEWS.every((n, i) => i === 0 || newer(NEWS[i - 1].version, n.version)))
check("the current version's news shows until it's seen", unseenNews(NEWS[0].version, null) === NEWS[0] && unseenNews(NEWS[0].version, NEWS[0].version) === null)
check('a version with no news shows nothing', unseenNews('9.9.9', null) === null)

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
