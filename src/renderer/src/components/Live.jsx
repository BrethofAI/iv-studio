import { useEffect, useState } from 'react'

// Live previews (remote.js withLivePreview): the latest step picture of a render, pushed by the main process as
// jobs:live { promptId, image, step, total, take }. Every component that shows one shares this one listener.
const latest = new Map()
const listeners = new Set()
let subscribed = false
function subscribe() {
  if (subscribed || !window.ivstudio?.jobs?.onLive) return
  subscribed = true
  window.ivstudio.jobs.onLive((live) => {
    latest.set(live.promptId, live)
    for (const fn of listeners) fn(live)
  })
}

export function useLive(promptId) {
  const [live, setLive] = useState(() => latest.get(promptId) || null)
  useEffect(() => {
    subscribe()
    if (!promptId) return
    setLive(latest.get(promptId) || null)
    const fn = (l) => l.promptId === promptId && setLive(l)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [promptId])
  return live
}

// The picture with its take and step, for a running render; nothing until the first step arrives.
export function LiveFrame({ promptId, takes, compact = false }) {
  const live = useLive(promptId)
  if (!live) return null
  return (
    <figure className={`live-frame ${compact ? 'compact' : ''}`}>
      <img src={live.image} alt="" />
      <figcaption className="mono small">
        {takes > 1 ? `take ${live.take} of ${takes} · ` : ''}step {live.step}/{live.total}
      </figcaption>
    </figure>
  )
}
