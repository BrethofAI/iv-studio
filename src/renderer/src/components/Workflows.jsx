import Hero from './Hero'

// Each tool card's own art (assets/workflows/<page>.webp), drawn in the page banners' style and faded behind the
// card's text (docs/art/README.md). A tool without a picture just shows the plain card.
const CARD_ART = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/workflows/*.webp', { eager: true, import: 'default' })).map(([file, url]) => [file.split('/').pop().replace('.webp', ''), url])
)

// Tools that take a video further. Each is its own page; new ones are added to TOOLS.
const TOOLS = [
  { page: 'sequences', name: 'Sequences', tag: 'Several shots, one continuous take', about: 'Write a scene as a list of 10 or 15 second shots and render them as one unbroken video, in one take or shot by shot, then retake any stretch and render it out.', credit: 'H3 Multishot' },
  { page: 'sizzle', name: 'Sizzle', tag: 'A website, made into a film', about: 'Put in a web address. Your agent storyboards a promo film from the real site, then H3 shots, pictures, music and the site’s own screens are cut together with motion and typography.', credit: 'Capture, H3, Z-Image, MiniMax Music, Shinobi' },
  { page: 'reel', name: 'Reel', tag: 'Pictures and a song, cut to the beat', about: 'Add pictures in order and pick a song. IV Studio finds its beat and cuts them on its bars, with a slow move on each picture, as an edit you can finish in Edit.', credit: 'Beat finding and motion: IV Studio' },
  { page: 'shinobi', name: 'Shinobi', tag: 'Edits your agent cuts', about: 'Hand footage to an agent (or a one-click style) and get a finished edit: cuts on the beat, speed ramps, typography, effects and sound.', credit: 'Your agent, rendered on this PC' },
  { page: 'replace', name: 'Replace', tag: 'Swap who is in the shot, or change the scene', about: 'Put your characters in place of people in a video, or change the scene in plain words: snow, night, a new setting, something removed. IV Studio paints the frames, you check them, and the camera, motion and soundtrack stay.', credit: 'Viggle Remake on MiniMax H3, Qwen Image, your characters' }
]

export default function Workflows({ go }) {
  return (
    <div className="workflows">
      <Hero art="workflows" title="Workflows" kicker="Take a video further" />
      <p className="lede">
        Tools for what comes after a render.
        <span className="lede-small dim">Each one works with your IV Studio renders and characters, and agents can use them through IV Studio's MCP.</span>
      </p>
      <div className="workflow-cards">
        {TOOLS.map((t) => (
          <button key={t.page} className="workflow-card" onClick={() => go(t.page)}>
            {CARD_ART[t.page] && <span className="workflow-art" aria-hidden="true" style={{ '--card-art': `url("${CARD_ART[t.page]}")` }} />}
            <span className="mono pink">{t.tag}</span>
            <span className="workflow-name">{t.name}</span>
            <span className="small dim">{t.about}</span>
            <span className="mono small dim">{t.credit}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
