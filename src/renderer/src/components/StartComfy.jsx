import { useEffect, useState } from 'react'

// "Start ComfyUI": runs the person's own ComfyUI launcher (Settings → ComfyUI) and rechecks once it answers.
// Shown in the title bar and on Setup while ComfyUI on this PC isn't running.
export default function StartComfy({ notify, recheck, className = 'btn btn-small' }) {
  const [state, setState] = useState(null)
  useEffect(() => {
    window.ivstudio.comfy.launcher().then((l) => l.starting && setState('starting')).catch(() => {})
    return window.ivstudio.comfy.onState((s) => {
      setState(s.state === 'starting' ? 'starting' : null)
      if (s.state === 'up') recheck?.()
      if (s.state === 'failed') notify?.(s.detail)
    })
  }, [])
  async function start() {
    setState('starting')
    try {
      await window.ivstudio.comfy.start()
      recheck?.()
    } catch (err) {
      notify?.(err.message)
    } finally {
      setState(null)
    }
  }
  return (
    <button className={className} disabled={state === 'starting'} onClick={start} title="Start ComfyUI with your own launcher (Settings → ComfyUI)">
      {state === 'starting' ? 'Starting ComfyUI…' : 'Start ComfyUI'}
    </button>
  )
}
