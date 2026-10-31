import { useEffect, useState } from 'react'

// The title bar's GPU and memory readout (Valtz's idea): VRAM in use on this PC's GPU and RAM in use, refreshed
// every few seconds while the window is visible. Over 90% turns red, which is when a render starts swapping.
const GB = (b) => (b / 1024 ** 3).toFixed(1)
const EVERY = 4000

export default function SystemMeter() {
  const [st, setSt] = useState(null)
  useEffect(() => {
    let live = true
    const read = () => document.visibilityState === 'visible' && window.ivstudio.system.stats().then((s) => live && setSt(s), () => {})
    read()
    const t = setInterval(read, EVERY)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
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
    </span>
  )
}
