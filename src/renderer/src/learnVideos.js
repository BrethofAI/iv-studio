// The tutorial videos made so far (assets/learn/<id>.mp4, see learn.js VIDEO_TITLES), kept apart from learn.js
// so its data and search can be tested outside Vite.
export const VIDEOS = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/learn/*.mp4', { eager: true, import: 'default' })).map(([file, url]) => [file.split('/').pop().replace('.mp4', ''), url])
)
