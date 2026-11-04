// macOS only: swap the ffmpeg + ffprobe that ffmpeg-ffprobe-static installed for Martin Riedl's
// static release builds. The npm package's Mac binaries are built with --enable-nonfree, which makes
// them unredistributable; these are --enable-gpl --enable-version3 (GPLv3) with nothing nonfree.
// Pinned by URL and SHA-256, so a changed file fails the build instead of shipping.
// Run after `npm ci`, before electron-builder: node scripts/mac-ffmpeg.mjs
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const VERSION = '9.0.2'
const BUILDS = {
  arm64: {
    dir: 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2',
    ffmpeg: 'c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924',
    ffprobe: 'fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6'
  },
  x64: {
    dir: 'https://ffmpeg.martin-riedl.de/download/macos/amd64/1789931006_9.0.2',
    ffmpeg: '7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4',
    ffprobe: '2322438ed2f6319a691291b247d09c69dcaa3a982460d1f269a7e1af335cfdfd'
  }
}

if (process.platform !== 'darwin') {
  console.log('mac-ffmpeg: not macOS, nothing to do')
  process.exit(0)
}

const build = BUILDS[process.arch]
if (!build) throw new Error(`No pinned ffmpeg build for darwin-${process.arch}`)

const target = path.resolve('node_modules/ffmpeg-ffprobe-static')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-ffmpeg-'))

for (const tool of ['ffmpeg', 'ffprobe']) {
  const url = `${build.dir}/${tool}.zip`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  const zip = Buffer.from(await res.arrayBuffer())
  const sha = createHash('sha256').update(zip).digest('hex')
  if (sha !== build[tool]) throw new Error(`${tool}.zip checksum mismatch: got ${sha}, expected ${build[tool]}`)

  const zipPath = path.join(tmp, `${tool}.zip`)
  fs.writeFileSync(zipPath, zip)
  execFileSync('ditto', ['-x', '-k', zipPath, tmp])
  fs.copyFileSync(path.join(tmp, tool), path.join(target, tool))
  fs.chmodSync(path.join(target, tool), 0o755)

  const config = execFileSync(path.join(target, tool), ['-hide_banner', '-version'], { encoding: 'utf8' })
  if (/--enable-nonfree/.test(config)) throw new Error(`${tool} build is nonfree`)
  console.log(`mac-ffmpeg: ${tool} ${VERSION} (${process.arch}) verified and installed`)
}

// The package's own README/LICENSE described the binaries it downloaded; replace them.
fs.writeFileSync(
  path.join(target, 'ffmpeg.README'),
  `FFmpeg ${VERSION} static build for macOS ${process.arch} by Martin Riedl (https://ffmpeg.martin-riedl.de).\n` +
    `Configured with --enable-gpl --enable-version3. Source: https://github.com/FFmpeg/FFmpeg/tree/n${VERSION}\n`
)
fs.rmSync(tmp, { recursive: true, force: true })
