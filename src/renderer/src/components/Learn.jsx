import { useEffect, useState } from 'react'
import { VideoPlayer } from './Help'
import Hero, { ART } from './Hero'
import { GROUPS, NEWS, VIDEO_TITLES, searchCards, unseenNews } from '../learn'
import { VIDEOS } from '../learnVideos'

// Learn: everything IV Studio can do, findable by what you want to make (src/renderer/src/learn.js). Each card has
// a line, a tutorial clip when one is made, and Try it, which opens the place it lives. Until the videos are back,
// the top of the page opens the PDF guide.
export default function Learn({ learnGo, version, seenNews, markNewsSeen, notify }) {
  const [query, setQuery] = useState('')
  const [watching, setWatching] = useState(null) // a video id in the player
  const found = searchCards(query)
  const openGuide = () => window.ivstudio.learn.openGuide().catch((err) => notify(err.message))
  const news = unseenNews(version, seenNews)
  useEffect(() => {
    // the news counts as seen once the page has been open a moment
    if (!news) return
    const t = setTimeout(() => markNewsSeen(version), 4000)
    return () => clearTimeout(t)
  }, [news, version])
  const card = (c) => (
    <div key={c.id} className="learn-card">
      <button className="learn-clip" style={!VIDEOS[c.video] && ART[c.art] ? { backgroundImage: `url("${ART[c.art]}")` } : undefined} onClick={() => VIDEOS[c.video] && setWatching(c.video)} title={VIDEOS[c.video] ? `Watch: ${VIDEO_TITLES[c.video]}` : undefined} tabIndex={VIDEOS[c.video] ? 0 : -1}>
        {VIDEOS[c.video] && <video src={VIDEOS[c.video]} muted loop autoPlay playsInline preload="metadata" />}
      </button>
      <span className="learn-title">{c.title}</span>
      <span className="small dim learn-line">{c.line}</span>
      <button className="btn btn-small learn-try" onClick={() => learnGo(c.to)}>
        Try it →
      </button>
    </div>
  )
  return (
    <div className="learn">
      <Hero art="create" title="Learn" kicker="What do you want to make?" help={false} />
      <section className="learn-guide">
        <div>
          <span className="learn-title">The IV Studio guide</span>
          <span className="small dim">Step by step, with every button pointed out. A PDF that opens in your PDF viewer. Videos are coming soon.</span>
        </div>
        <button className="btn" onClick={openGuide}>
          Open the guide (PDF)
        </button>
      </section>
      {news && (
        <section className="learn-news">
          <span className="mono pink">New in {news.version}</span>
          <ul>
            {news.items.map((n) => (
              <li key={n.card}>{n.text}</li>
            ))}
          </ul>
        </section>
      )}
      <input className="learn-search" value={query} autoFocus placeholder="Try: vertical video, remove background, music video, talk to camera" onChange={(e) => setQuery(e.target.value)} aria-label="Search what IV Studio can do" />
      {query.trim() ? (
        <section className="learn-group">
          <h2 className="learn-h">{found.length ? `${found.length} way${found.length === 1 ? '' : 's'} to do it` : 'Nothing by that name yet'}</h2>
          {!found.length && <p className="small dim">Try other words, like “vertical”, “song”, “voice” or “film”.</p>}
          <div className="learn-cards">{found.map(card)}</div>
        </section>
      ) : (
        GROUPS.map((g) => (
          <section key={g.name} className="learn-group">
            <h2 className="learn-h">
              {g.name}
              {VIDEOS[g.video] && (
                <button className="link-btn mono small" onClick={() => setWatching(g.video)}>
                  ▶ {VIDEO_TITLES[g.video]}
                </button>
              )}
            </h2>
            <div className="learn-cards">{found.filter((c) => c.group === g.name).map(card)}</div>
          </section>
        ))
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
      {watching && <VideoPlayer id={watching} onClose={() => setWatching(null)} />}
    </div>
  )
}
