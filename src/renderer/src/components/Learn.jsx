import { useEffect, useState } from 'react'
import { VideoPlayer } from './Help'
import Hero from './Hero'
import { GROUPS, NEWS, VIDEO_TITLES, searchCards, unseenNews } from '../learn'
import { VIDEOS } from '../learnVideos'
import { howFor } from '../learnHow'

// How one Learn item works: the steps beside a real screenshot, each step's number on the control it means.
// Hovering or focusing a step lights its box. Open it goes to the place; ▶ plays its video once one is made.
function HowItWorks({ card, how, onClose, onOpen, onWatch }) {
  const [on, setOn] = useState(null)
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal learn-how ${how.pic ? '' : 'no-pic'}`} role="dialog" aria-label={`How it works: ${card.title}`}>
        {how.pic && (
          <div className="learn-how-pic">
            <div className="learn-how-frame" style={{ aspectRatio: `${how.w} / ${how.h}` }}>
              <img src={how.pic} alt={`The ${card.group} screen, with the controls numbered`} />
              {how.marks.map((m) => (
                <span key={m.n} className={`learn-mark ${on === m.n ? 'on' : on ? 'off' : ''}`} style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}>
                  <b>{m.n}</b>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="learn-how-text">
          <div className="learn-how-top">
            <span className="mono label">{card.group}</span>
            <button className="link-btn mono" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <h2>{card.title}</h2>
          <p className="dim">{how.intro}</p>
          <ol className="learn-steps">
            {how.steps.map((s, i) => (
              <li key={i} tabIndex={0} onMouseEnter={() => setOn(i + 1)} onMouseLeave={() => setOn(null)} onFocus={() => setOn(i + 1)} onBlur={() => setOn(null)}>
                <span className="learn-step-n">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="learn-how-foot">
            <button className="btn btn-primary" onClick={onOpen}>
              Open it →
            </button>
            {VIDEOS[card.video] && (
              <button className="btn btn-small" onClick={onWatch}>
                ▶ Watch
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Learn: everything IV Studio can do, findable by what you want to make (src/renderer/src/learn.js). Kept simple
// until the tutorial videos are shot: the PDF guide on top, a search, then each topic as a short list where every
// row opens the place it lives. A row gets a ▶ once its video is made.
export default function Learn({ learnGo, version, seenNews, markNewsSeen, notify }) {
  const [query, setQuery] = useState('')
  const [watching, setWatching] = useState(null) // a video id in the player
  const [explaining, setExplaining] = useState(null) // a card whose How it works is open
  const found = searchCards(query)
  const how = explaining && howFor(explaining.id)
  const openGuide = () => window.ivstudio.learn.openGuide().catch((err) => notify(err.message))
  const news = unseenNews(version, seenNews)
  useEffect(() => {
    // the news counts as seen once the page has been open a moment
    if (!news) return
    const t = setTimeout(() => markNewsSeen(version), 4000)
    return () => clearTimeout(t)
  }, [news, version])
  const row = (c) => (
    <li key={c.id} className="learn-row">
      <button className="learn-go" onClick={() => (howFor(c.id) ? setExplaining(c) : learnGo(c.to))}>
        <span className="learn-row-title">{c.title}</span>
        <span className="small dim">{c.line}</span>
        <span className="learn-arrow" aria-hidden="true">
          →
        </span>
      </button>
      {VIDEOS[c.video] && (
        <button className="learn-play mono" onClick={() => setWatching(c.video)} title={`Watch: ${VIDEO_TITLES[c.video]}`}>
          ▶
        </button>
      )}
    </li>
  )
  return (
    <div className="learn">
      <Hero art="learn" title="Learn" kicker="What do you want to make?" help={false} />

      <section className="learn-guide">
        <div>
          <span className="learn-guide-title">The IV Studio guide</span>
          <span className="small dim">Every page, step by step, with each button pointed out. Video tutorials are coming soon.</span>
        </div>
        <button className="btn btn-primary" onClick={openGuide}>
          Open the guide (PDF)
        </button>
      </section>
      {news && (
        <p className="learn-news small">
          <span className="mono pink">New in {news.version}</span> {news.items.map((n) => n.text).join(' ')}
        </p>
      )}

      <input className="learn-search" value={query} autoFocus placeholder="Search: vertical video, music, voice, short film…" onChange={(e) => setQuery(e.target.value)} aria-label="Search what IV Studio can do" />

      {query.trim() ? (
        <section className="learn-topic learn-results">
          <h2 className="learn-h">{found.length ? `${found.length} way${found.length === 1 ? '' : 's'} to do it` : 'Nothing by that name yet'}</h2>
          {found.length ? <ul className="learn-rows">{found.map(row)}</ul> : <p className="small dim">Try other words, like “vertical”, “song”, “voice” or “film”.</p>}
        </section>
      ) : (
        <div className="learn-topics">
          {GROUPS.map((g) => (
            <section key={g.name} className="learn-topic">
              <h2 className="learn-h">
                {g.name}
                {VIDEOS[g.video] && (
                  <button className="link-btn mono small" onClick={() => setWatching(g.video)}>
                    ▶ {VIDEO_TITLES[g.video]}
                  </button>
                )}
              </h2>
              <ul className="learn-rows">{found.filter((c) => c.group === g.name).map(row)}</ul>
            </section>
          ))}
        </div>
      )}

      {!query.trim() && NEWS.length > 0 && (
        <details className="learn-history">
          <summary className="mono small">What came in each version</summary>
          {NEWS.map((n) => (
            <div key={n.version}>
              <span className="mono small pink">{n.version}</span>
              <ul>
                {n.items.map((i) => (
                  <li key={i.card} className="small">
                    {i.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
      {how && (
        <HowItWorks
          card={explaining}
          how={how}
          onClose={() => setExplaining(null)}
          onOpen={() => (setExplaining(null), learnGo(explaining.to))}
          onWatch={() => (setExplaining(null), setWatching(explaining.video))}
        />
      )}
      {watching && <VideoPlayer id={watching} onClose={() => setWatching(null)} />}
    </div>
  )
}
