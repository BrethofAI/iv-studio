// The portable Windows build: a zip to unzip anywhere (another drive, a USB stick). It carries an empty "data"
// folder next to IV Studio.exe, which makes IV Studio keep all its data there (paths.js) and update by hand
// (updater.js). Everything else is the installer's config from package.json.
//   npm run dist:portable  →  dist/IV-Studio-Portable-win-x64.zip
const base = require('./package.json').build

module.exports = {
  ...base,
  win: { ...base.win, target: [{ target: 'zip', arch: ['x64'] }], artifactName: 'IV-Studio-Portable-win-${arch}.${ext}' },
  extraFiles: [...(base.extraFiles || []), { from: 'build/portable', to: '.' }]
}
