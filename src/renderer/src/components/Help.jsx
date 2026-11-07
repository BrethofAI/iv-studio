import { useEffect, useState } from 'react'
import { TOURS, TOUR_FOR_ART, toursSeen, startTour } from '../tours'

// "? How it works" beside a page's title: starts the page's guided tour (tours.js, Tour.jsx). It glows until
// that page's tour has been taken once. page: a TOURS key, or the banner's art, which maps to one.
export default function Help({ page, art, compact }) {
  const key = page || TOUR_FOR_ART[art]
  const [seen, setSeen] = useState(() => toursSeen().has(key))
  useEffect(() => {
    const on = () => setSeen(toursSeen().has(key))
    window.addEventListener('iv:tour-seen', on)
    return () => window.removeEventListener('iv:tour-seen', on)
  }, [key])
  if (!TOURS[key]) return null
  return (
    <button className={`help-btn ${seen ? '' : 'fresh'} ${compact ? 'compact' : ''}`} onClick={() => startTour(key)} title={`A quick walk through ${TOURS[key].title}`}>
      <span className="help-q" aria-hidden="true">
        ?
      </span>
      <span className="help-label">How it works</span>
    </button>
  )
}
