// Learn: everything IV Studio can do, as cards on the Learn page (with words its search also finds, and where
// "Try it" goes), the tips behind each page's "?" and the tutorial videos (assets/learn/<id>.mp4, made in
// HyperFrames from docs/learn/drafts.md; listed in learnVideos.js). A video that isn't made yet is left out.
export const VIDEO_TITLES = {
  t1: 'Your first shot',
  t2: 'A short film in six steps',
  t3: 'The editor, and new footage inside it',
  t4: 'Characters and their voices',
  t5: 'Music and reels',
  t6: 'Pictures and LoRAs',
  t7: 'Take a video further',
  t8: 'Let your agent drive'
}

// to: where Try it goes. section video|audio, page, create video|image (Create's switch), mode (Create's or
// Image's mode card), shown on arrival through the iv:learn event.
const shot = (mode) => ({ page: 'create', create: 'video', mode })
export const GROUPS = [
  {
    name: 'Make a shot',
    art: 'create',
    video: 't1',
    cards: [
      { id: 'text', title: 'A shot from words', line: 'Describe it, and H3 films it with sound.', to: shot('text'), words: 'video clip prompt text' },
      { id: 'frames', title: 'From a first and last picture', line: 'Two stills; H3 fills the motion between.', to: shot('frames'), words: 'animate a picture start frame end frame image to video' },
      { id: 'reference', title: 'From references', line: 'Show it the people, places and sounds to use.', to: shot('reference'), words: 'consistent lookalike reference pictures' },
      { id: 'continue', title: 'Carry on a video', line: 'Continue a clip you already have.', to: shot('continue'), words: 'extend longer continue' },
      { id: 'writer', title: 'Write it for me', line: 'A rough idea becomes a full prompt.', to: shot('text'), words: 'prompt help ideas writer claude codex' },
      { id: 'board', title: 'Stage it on a board', line: 'Drag people and the camera; get exact staging.', to: shot('text'), words: 'blocking camera move previs staging arc' },
      { id: 'voice', title: 'A line in their voice', line: 'The shot lip-syncs to your character.', to: shot('text'), words: 'talk to camera dialogue speech lip sync speak' },
      { id: 'best', title: 'Pick the best take', line: 'Previews ranked, compared and reviewed.', to: { page: 'library' }, words: 'compare review seeds hunt best ranking' },
      { id: 'finish', title: 'Finish in full quality', line: 'Your pick at 2 MP, sharpened or detailed.', to: { page: 'library' }, words: 'upscale 4k dlss seedvr2 enhance quality' }
    ]
  },
  {
    name: 'Make a picture',
    art: 'create',
    video: 't6',
    cards: [
      { id: 'image', title: 'A picture from words', line: 'Six models, each with its own LoRAs.', to: { page: 'create', create: 'image', mode: 'generate' }, words: 'image still photo flux krea qwen z-image' },
      { id: 'image-edit', title: 'Change a picture', line: 'Edit a picture with words.', to: { page: 'create', create: 'image', mode: 'edit' }, words: 'edit photo restyle change' }
    ]
  },
  {
    name: 'Make a film',
    art: 'projects',
    video: 't2',
    cards: [
      { id: 'film', title: 'A short film', line: 'Idea to finished film in six steps.', to: { page: 'projects' }, words: 'story script movie projects storyboard' },
      { id: 'faces', title: 'Faces for everyone', line: 'Made-up people keep one face: drawn, or your own picture.', to: { page: 'projects' }, words: 'consistent character face drawn picture concept art reference sheet dog animal' },
      { id: 'rooms', title: 'One room, every shot', line: 'A place photo keeps the set the same; More angles draws it from new sides.', to: { page: 'projects' }, words: 'location set place angles consistent room' },
      { id: 'animatic', title: 'See it before you film it', line: 'The animatic plays your storyboard with its lines.', to: { page: 'projects' }, words: 'animatic pacing preview storyboard' },
      { id: 'onetake', title: 'No cut between shots', line: 'One shot carries straight on from the last.', to: { page: 'projects' }, words: 'one take oner continuous no cut' },
      { id: 'sequence', title: 'A longer scene', line: 'Shots that play as one unbroken video.', to: { page: 'sequences' }, words: 'long video sequence multishot' }
    ]
  },
  {
    name: 'Edit',
    art: 'edit',
    video: 't3',
    cards: [
      { id: 'editor', title: 'The editor', line: 'Tracks, titles, markers and Premiere’s keys.', to: { page: 'edits' }, words: 'cut trim timeline premiere titles edit' },
      { id: 'extend', title: 'Make it longer', line: 'Right-click a clip: Extend.', to: { page: 'edits' }, words: 'extend continue longer' },
      { id: 'fill', title: 'Fill a gap', line: 'Right-click a gap: a new shot that joins both sides.', to: { page: 'edits' }, words: 'transition bridge gap join' },
      { id: 'retake', title: 'Redo a moment', line: 'Right-click: Retake this stretch.', to: { page: 'edits' }, words: 'fix retake redo moment' },
      { id: 'cutout', title: 'Cut someone out', line: 'Keep only who you name; the rest turns see-through.', to: { page: 'edits' }, words: 'remove background green screen matte cut out transparent alpha' },
      { id: 'reframe', title: 'Change the shape', line: 'Right-click: Reframe to 9:16, 1:1 or 16:9.', to: { page: 'edits' }, words: 'vertical tiktok reels shorts square uncrop outpaint reframe' },
      { id: 'loudness', title: 'Right for phones', line: 'Exports at the loudness phones expect.', to: { page: 'edits' }, words: 'volume lufs loud quiet export' }
    ]
  },
  {
    name: 'Characters and sound',
    art: 'characters',
    video: 't4',
    cards: [
      { id: 'character', title: 'Your own character', line: 'Design, train and keep a recurring person.', to: { page: 'characters' }, words: 'actor persona lora train tess theo' },
      { id: 'voice-design', title: 'A voice from words', line: 'Describe a voice and hear three takes.', to: { section: 'audio', page: 'voices' }, words: 'voice design describe' },
      { id: 'voice-clone', title: 'A voice from a recording', line: 'Save a voice you have permission to use.', to: { section: 'audio', page: 'voices' }, words: 'clone recording voice' },
      { id: 'lines', title: 'Say anything', line: 'Any line in any voice.', to: { section: 'audio', page: 'lines' }, words: 'text to speech tts voiceover narration' },
      { id: 'song', title: 'A song', line: 'Lyrics in, a sung song out.', to: { section: 'audio', page: 'music' }, words: 'soundtrack music song lyrics minimax ace', video: 't5' }
    ]
  },
  {
    name: 'Take it further',
    art: 'workflows',
    video: 't7',
    cards: [
      { id: 'reel', title: 'A reel to music', line: 'Pictures cut to a song’s beat.', to: { page: 'reel' }, words: 'slideshow music video beat photos', video: 't5' },
      { id: 'sizzle', title: 'A website film', line: 'A web address becomes a promo.', to: { page: 'sizzle' }, words: 'promo ad launch video website' },
      { id: 'shinobi', title: 'An edit your agent cuts', line: 'Footage in, a finished edit out.', to: { page: 'shinobi' }, words: 'auto edit agent shinobi' },
      { id: 'replace', title: 'Swap who’s in it', line: 'Your character replaces someone.', to: { page: 'replace' }, words: 'face swap replace person object' },
      { id: 'loras', title: 'Styles from Civitai', line: 'Browse and add LoRAs.', to: { page: 'loras' }, words: 'style look civitai lora', video: 't6' }
    ]
  },
  {
    name: 'Get around',
    art: 'library',
    video: 't8',
    cards: [
      { id: 'library', title: 'Everything you’ve made', line: 'Every version, song and line in one place.', to: { page: 'media' }, words: 'history files library renders', video: 't1' },
      { id: 'incognito', title: 'Private work', line: 'Incognito keeps it apart: the switch in the title bar.', to: { page: 'settings' }, words: 'private incognito hidden' },
      { id: 'cloud', title: 'Render in the cloud', line: 'Your own Modal account, with a cost meter.', to: { page: 'cloud' }, words: 'gpu no graphics card modal cloud' },
      { id: 'agents', title: 'Let your agent drive', line: 'Claude Code or Codex can do all of this.', to: { page: 'settings' }, words: 'mcp automation agent claude codex' }
    ]
  }
]
export const CARDS = GROUPS.flatMap((g) => g.cards.map((c) => ({ ...c, group: g.name, art: g.art, video: c.video || g.video })))

// A search: every word typed must appear in a card's title, line or extra words (a word may start one).
export function searchCards(query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return CARDS
  return CARDS.filter((c) => {
    const text = `${c.title} ${c.line} ${c.words} ${c.group}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

// The "?" beside each page's title: its video and the tips that are easy to miss.
export const TIPS = {
  create: { video: 't1', tips: ['Add references before Write it for me, so it writes about what it sees.', 'Type @ to bring in a character or a saved place.', 'The checker’s Fix button mends most problems before you render.', 'Draft quality hunts about twice as fast.', 'An arc round people is the one camera move that needs a previs clip.'] },
  shots: { video: 't1', tips: ['The ★ marks the best-scoring take; picking one teaches it your taste.', 'Compare plays two takes side by side or as a wipe, in step.', 'Review names what’s off with its time, and one fix. If a fix fails twice it suggests another kind.', 'Enhance works on any finished take, any time later.'] },
  projects: { video: 't2', tips: ['Play the animatic before filming: it costs seconds, not GPU minutes.', 'A sketch drawn before you changed a shot isn’t used until you redraw it.', 'A recorded line keeps your timing better than a generated one.', 'One-take shots make a single take, so film and pick the shot before first.', 'More angles (on a place) helps shots that look another way keep the room.'] },
  edit: { video: 't3', tips: ['Right-click a clip for Extend, Retake, Cut out and Reframe.', 'Right-click empty track space to fill a gap.', 'F11 is full screen; Esc comes back.', 'Click empty timeline for the edit’s settings, loudness included.'] },
  characters: { video: 't4', tips: ['Training shows its cost before it starts, and runs on your own Modal account.', 'Give a character a voice on Audio → Voices; their shots then speak in it.', 'In a short film, anyone without a character gets a drawn face, or your own picture with Use a picture.'] },
  audio: { video: 't4', tips: ['A line can go straight into a shot with Use in a shot.', 'MiniMax Music sings words clearly; ACE-Step is quick for backgrounds.', 'A MiniMax song’s length follows its lyrics: write full verses for a full song.', 'Pictures plus a song make a reel on Workflows → Reel.'] },
  workflows: { video: 't7', tips: ['Reel finds a song’s beat by itself.', 'Cut out and Reframe also live in the editor’s right-click menu.', 'Sizzle and Shinobi work best with an agent connected (Settings → Agents).'] },
  reel: { video: 't5', tips: ['Each picture holds a whole number of beats, and the cuts keep to the song’s bars.', 'Calm, Normal and Fast set about 3, 2 and 1 second a picture.', 'It lands in Edit as an ordinary edit, ready to trim and export.'] },
  loras: { video: 't6', tips: ['Clips play when you hover a card.', 'Downloads need your Civitai key (Settings → Civitai).', 'A LoRA’s card shows its licence and trigger words.'] },
  library: { video: 't1', tips: ['Each shot’s versions sit in one tile; open it to step through them.', 'Use in a shot sends a picture or a sound straight to Create.'] },
  settings: { video: 't8', tips: ['Incognito keeps private work apart from everything else.', 'Settings → Agents connects Claude Code, Codex or any MCP agent.', 'Setup downloads missing models and checks each one.'] },
  cloud: { video: 't8', tips: ['The meter in the title bar shows the GPU time and cost while you’re on the cloud.', 'Shut down GPU stops it at once; it also stops by itself when idle.'] }
}
// which page's tips a banner shows, by its art
export const TIPS_FOR_ART = { create: 'create', shots: 'shots', projects: 'projects', edit: 'edit', characters: 'characters', voices: 'audio', lines: 'audio', music: 'audio', workflows: 'workflows', sequences: 'workflows', shinobi: 'workflows', replace: 'workflows', sizzle: 'workflows', loras: 'loras', library: 'library', settings: 'settings', cloud: 'cloud' }

// What's new: the highlights of each version, newest first, each pointing at a Learn card. After an update the
// Learn page (and a dot on its sidebar item) shows the current version's once, until it's been seen.
export const NEWS = [
  {
    version: '0.2.3',
    items: [
      { card: 'film', text: 'Projects: a short film from an idea in six steps, with a storyboard, an animatic and every shot filmed for you.' },
      { card: 'faces', text: 'Made-up people in a film keep one face: drawn, or your own picture (Use a picture). Someone who never speaks, like a dog, can be added too.' },
      { card: 'rooms', text: 'More angles of a place keep every shot in the same room.' },
      { card: 'onetake', text: 'One-take shots carry straight on from the shot before.' },
      { card: 'writer', text: 'Write it for me can use Claude Code or Codex, follows MiniMax’s own guide, and looks at your references.' },
      { card: 'board', text: 'Stage a shot on a board; arcs film from a previs.' },
      { card: 'best', text: 'Takes are ranked, compared side by side and reviewed with one suggested fix.' },
      { card: 'finish', text: 'Finish with DLSS 5 or SeedVR2; live previews while takes render.' },
      { card: 'cutout', text: 'Cut someone out of a shot, see-through everywhere else.' },
      { card: 'reframe', text: 'Reframe any shot or picture to 9:16, 1:1 or 16:9 without cropping.' },
      { card: 'reel', text: 'Reel: pictures and a song, cut to the beat.' },
      { card: 'loudness', text: 'Exports come out at the loudness phones expect.' }
    ]
  }
]
// The version whose news hasn't been seen yet, or null.
export function unseenNews(version, seen) {
  const entry = NEWS.find((n) => n.version === version)
  return entry && seen !== version ? entry : null
}
