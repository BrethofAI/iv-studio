import { useEffect, useState } from 'react'

// The title bar's GPU and memory readout (Valtz's idea): VRAM in use on this PC's GPU and RAM in use, refreshed
// every few seconds while the window is visible. Over 90% turns red, which is when a render starts swapping.
const GB = (b) => (b / 1024 ** 3).toFixed(1)
const EVERY = 4000

export default function SystemMeter({ notify }) {
  const [st, setSt] = useState(null)
  const [freeing, setFreeing] = useState(false)
  useEffect(() => {
    let live = true
    const read = () => document.visibilityState === 'visible' && window.ivstudio.system.stats().then((s) => live && setSt(s), () => {})
    read()
    const t = setInterval(read, EVERY)
    // back from hidden: read now, not up to 4 s later with the numbers from before it was hidden
    document.addEventListener('visibilitychange', read)
    return () => {
      live = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', read)
    }
  }, [])
  // Free memory: what IV Studio and ComfyUI hold, let go of now (ComfyUI waits for a running render to finish)
  async function free() {
    setFreeing(true)
    try {
      const r = await window.ivstudio.system.free()
      const gb = (a, b) => (a != null && b != null ? Math.max(0, (a - b) / 1024 ** 3) : null)
      const v = gb(r.before.vram, r.after.vram)
      const m = gb(r.before.ram, r.after.ram)
      notify?.(r.busy ? 'A render is running: ComfyUI frees its memory when it finishes.' : `Freed ${v != null ? `${v.toFixed(1)} GB of GPU memory` : 'GPU memory'}${m != null && m >= 0.1 ? ` and ${m.toFixed(1)} GB of RAM` : ''}.`, 'info')
      window.ivstudio.system.stats().then(setSt, () => {})
    } catch (err) {
      notify?.(err.message)
    } finally {
      setFreeing(false)
    }
  }
  if (!st) return null
  const parts = []
  if (st.gpu) parts.push({ label: 'GPU', used: st.gpu.total - st.gpu.free, total: st.gpu.total })
  parts.push({ label: 'RAM', used: st.ram.total - st.ram.free, total: st.ram.total })
  const title = [st.gpu && `${st.gpu.name}: ${GB(st.gpu.total - st.gpu.free)} of ${GB(st.gpu.total)} GB in use, ${GB(st.gpu.comfyHeld)} GB of it held by ComfyUI.`, `RAM: ${GB(st.ram.total - st.ram.free)} of ${GB(st.ram.total)} GB in use.`].filter(Boolean).join(' ')
  return (
    <span className="system-meter mono" title={title}>
      {parts.map((p) => {
        const share = p.used / p.total
        return (
          <span key={p.label} className={`system-meter-part ${share > 0.9 ? 'full' : ''}`}>
            {p.label} {GB(p.used)}/{GB(p.total)}
            <span className="system-meter-bar">
              <span style={{ width: `${Math.min(100, share * 100)}%` }} />
            </span>
          </span>
        )
      })}
      <button className="system-free" disabled={freeing} onClick={free} title="Free memory: ComfyUI unloads its models (after a running render finishes), IV Studio's voice engine stops and Ollama lets go of the writer. The next render loads what it needs again.">
        {freeing ? 'Freeing…' : 'Free'}
      </button>
    </span>
  )
}
