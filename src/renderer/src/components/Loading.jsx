// IV Studio's loading mark: a short strip of film whose frames light up in turn, with what's loading beside it.
// Still under reduced motion (the frames stay lit). Used wherever a list or panel waits for its data.
export default function Loading({ label = 'Loading', small = false }) {
  return (
    <span className={`iv-loading ${small ? 'small' : ''}`} role="status" aria-live="polite">
      <span className="iv-loading-strip" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="mono">{label}…</span>
    </span>
  )
}
