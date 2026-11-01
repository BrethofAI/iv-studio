# Learn: drafts for review

Drafts only (2026-11-01). Nothing here is built or rendered yet. Once the wording is approved, it becomes the
Learn page, the search, the "?" tips on each page, and eight tutorial videos made in HyperFrames.

Part 1 lists every feature, grouped by what someone wants to make. Part 2 is the Learn page wording. Part 3 is
the "?" tips for each page. Part 4 has the eight video scripts. Part 5 is how the videos would be made.

---

## Part 1 · Everything IV Studio can do

Each line: what it is, where it lives, and the video that shows it (T1 to T8).

### Make a shot (Create → Video) · T1
- **Four ways to start a shot:** from words (Text), from a first and last picture (Frames), from pictures,
  videos and sounds of what should appear (References), or carrying on a video you have (Continue).
- **Write it for me:** turns a rough idea into a full H3 prompt. It can use the free local writer, Claude Code,
  Codex, or MiniMax's paid writer (Settings → Prompt writer). It looks at your references before writing.
- **References:** drop in pictures, clips and sounds. Click one to crop it, trim it or fit it to H3's sizes.
- **@ mentions:** type @ in the prompt to bring in a character or a saved place.
- **Prompt checker:** flags problems before you spend GPU time (wrong length, a missing line, a face described
  on a character who already has one) and fixes most of them in one click.
- **Stage it on a board:** drag people and the camera on a floor plan; IV Studio writes who stands where.
  **Make a previs clip** turns the board into a grey moving guide, which helps most with arcs round people.
- **Voice line and Speak it:** the shot lip-syncs to a line in your character's voice.
- **LoRAs and RefMods:** add styles or looks from your LoRAs, and RefMods for extra control.
- **Draft or Standard:** quick 4-step previews, or full 8-step ones.
- **Hunt:** a few short previews on different seeds, with live pictures while they render.
- **Best take:** IV Studio scores the takes (words heard, likeness, no freezing, sharpness) and marks the best.
- **Compare:** two takes side by side or as a wipe, playing in step.
- **Review a take:** your writer looks at the take, names what's wrong with timestamps, and suggests one fix.
- **Edit and run again:** change the prompt and render again into the same shot; every run is kept as a version.
- **Finish:** your pick at 1, 1.5 or 2 MP, with DLSS 5 (sharpen, 2x, smoother motion) or SeedVR2 (more face
  and hair detail). **Enhance** runs either again on any finished take.

### Make a picture (Create → Image) · T6
- **Generate or Edit:** six picture models (Flux.2 Klein, Flux 3 Klein, Krea 2, Moss, Qwen Image 2.1,
  Z-Image Turbo); four of them edit an existing picture.
- **LoRAs per model:** each family has its own LoRA tray.
- **The gallery viewer:** Use in a shot, Edit this, Add to edit, Make more like this.

### Make a short film (Projects) · T2
- **Six steps:** Idea, Story, Cast and places, Storyboard, Film it, Watch.
- **Story:** write it yourself, bring a script, or press Write it for me.
- **Cast:** your characters play the parts; anyone else gets a face drawn for the film and keeps it.
- **Places:** a photo or a drawn picture of each place keeps every shot in the same room.
  **More angles** draws the place from a quarter turn, the side and further back.
- **Look:** a style (natural, cinematic, 16 mm and more), your own words, and style LoRAs.
- **Storyboard:** every shot planned and sketched. Click a panel to change what happens, the camera or the line.
- **The staging board:** in a shot's panel, draw who stands where; arcs film from a previs.
- **Play the animatic:** the sketches play as a film with the lines, before anything is filmed.
- **Film it:** takes for every shot, starting from the sketch, in the same room, with each line spoken first.
- **Recorded lines:** use your own recording of a line; the shot lip-syncs to it.
- **One-take shots:** a shot can carry straight on from the shot before, with no cut.
- **Watch:** the film in order, saved as a video, or opened in the editor to fine-tune.

### Make a longer scene (Workflows → Sequences) · T7
- Several 10 or 15 second shots rendered as one unbroken video, in one take or shot by shot.
  Retake any stretch, then render it out.

### Edit · T3
- **A full editor:** a bin, a source and program monitor, any number of video and sound tracks, titles,
  markers, Premiere's keys (J K L, I O, comma and full stop, Q W, C for razor), and full screen (F11).
- **Right-click a clip to make new footage:** Extend it, Bridge to the next clip, Fill a gap, Retake a stretch.
- **Right-click to Cut out:** keep only who or what you name; the rest turns see-through.
- **Right-click to Reframe:** fit a clip to the edit's shape (say 16:9 into 9:16) by drawing what lies beyond
  its edges.
- **Loudness:** exports come out right for phones and the web (Online), for TV, or as mixed.
- **Export:** 1080p, 4K, vertical or square, at 24, 30 or 60 fps.
- **Your agent can edit too:** its changes show in a strip with one-click Undo.

### Characters · T4
- **Ready-made:** Tess and Theo, with their faces and voices.
- **Train your own:** design their face, make talking clips, train on your own Modal account (it shows the
  cost first), then pick the best checkpoint.
- **A voice for each:** give a character a voice from Audio → Voices.

### Sound (the Audio side of the sidebar) · T4, T5
- **Voices:** design a voice from a description, or save one from a recording (with consent).
- **Lines:** say anything in any voice, then use it in a shot.
- **Music:** songs with lyrics or instrumentals (MiniMax Music 3 for clear singing, ACE-Step for quick drafts).
- **Speak it:** in Create, the line is said in the character's voice and the shot lip-syncs to it.

### Take a video further (Workflows) · T5, T7
- **Reel:** pictures and a song, cut to the beat with slow moves on each picture.
- **Sizzle:** a web address becomes a promo film made from the real site.
- **Shinobi:** hand footage to an agent (or a one-click style) for a finished, beat-cut edit.
- **Replace:** put your character in place of someone in a video, swap several people, or change an object.

### LoRAs · T6
- **Discover:** H3 LoRAs on Civitai, with clips that play on hover and their licence.
- **Yours:** every LoRA in your ComfyUI, grouped and named.
- **The tray:** add LoRAs to a shot or picture and set their strength.

### Find things · T1
- **Dashboard:** quick starts, your latest renders and your cast.
- **Library:** every render, export, song, line and picture, with each shot's versions in one tile.
- **Queue:** what's rendering and waiting, with live progress; cancel IV Studio's own renders.

### Settings and extras · T8
- **Incognito:** a separate private space; nothing made there shows in the normal app.
- **Folders:** where renders save in ComfyUI.
- **Setup:** checks ComfyUI and downloads missing models, checked against their published hashes.
- **Updates:** IV Studio updates itself.
- **Cloud:** render on your own Modal account when this PC can't, with a running cost meter and a Shut down
  button.
- **Agents:** connect Claude Code, Codex or any MCP agent; it can do everything above, and offers a menu of
  what to make when you open a chat.

---

## Part 2 · The Learn page

A new item in the sidebar, under Dashboard: **Learn**.

**Banner:** LEARN · What do you want to make?

**Under it:** a search box with the placeholder *"Try: vertical video, remove background, music video, talk to
camera"*. Typing filters the cards below; a card matches its own words and a few everyday ones (listed after
each card as *also finds*).

**Then one row per group, each card with a looping clip, one line and a Try it button.**

#### Make a shot
| Card | Line | Try it opens | Also finds |
|---|---|---|---|
| A shot from words | Describe it, and H3 films it with sound. | Create → Text | video, clip, prompt |
| From a first and last picture | Two stills; H3 fills the motion between. | Create → Frames | animate a picture, start frame |
| From references | Show it the people, places and sounds to use. | Create → References | consistent, lookalike |
| Carry on a video | Continue a clip you already have. | Create → Continue | extend, longer |
| Write it for me | A rough idea becomes a full prompt. | Create, writer open | prompt help, ideas |
| Stage it on a board | Drag people and the camera; get exact staging. | Create, board open | blocking, camera move, previs |
| A line in their voice | The shot lip-syncs to your character. | Create → Voice line | talk to camera, dialogue, speech |
| Pick the best take | Previews ranked, compared and reviewed. | Shots | compare, review, seeds |
| Finish in full quality | Your pick at 2 MP, sharpened or detailed. | Shots, a take | upscale, 4K, DLSS, SeedVR2 |

#### Make a picture
| Card | Line | Try it opens | Also finds |
|---|---|---|---|
| A picture from words | Six models, each with its own LoRAs. | Create → Image → Generate | image, still, photo |
| Change a picture | Edit a picture with words. | Create → Image → Edit | edit photo, restyle |

#### Make a film
| Card | Line | Try it opens | Also finds |
|---|---|---|---|
| A short film | Idea to finished film in six steps. | Projects → New film | story, script, movie |
| Faces for everyone | Made-up people keep one face. | Projects → Cast | consistent character |
| One room, every shot | A place photo keeps the set the same. | Projects → Cast and places | location, set |
| See it before you film it | The animatic plays your storyboard. | Projects → Storyboard | animatic, pacing |
| No cut between shots | One shot carries straight on from the last. | Projects → a shot's panel | one take, oner |
| A longer scene | Shots that play as one unbroken video. | Workflows → Sequences | long video |

#### Edit
| Card | Line | Try it opens | Also finds |
|---|---|---|---|
| The editor | Tracks, titles, markers and Premiere's keys. | Edit | cut, trim, timeline |
| Make it longer | Right-click a clip: Extend. | Edit | extend, continue |
| Fill a gap | Right-click a gap: a new shot that joins both sides. | Edit | transition, bridge |
| Redo a moment | Right-click: Retake this stretch. | Edit | fix, retake, redo |
| Cut someone out | Keep only who you name; the rest turns see-through. | Edit | remove background, green screen, matte |
| Change the shape | Right-click: Reframe to 9:16, 1:1 or 16:9. | Edit | vertical, TikTok, Reels, square, uncrop |
| Right for phones | Exports at the loudness phones expect. | Edit → settings | volume, LUFS |

#### Characters and sound
| Card | Line | Try it opens | Also finds |
|---|---|---|---|
| Your own character | Design, train and keep a recurring person. | Characters → Train your own | actor, persona, LoRA |
| A voice from words | Describe a voice and hear three takes. | Audio → Voices | voice design |
| A voice from a recording | Save a voice you have permission to use. | Audio → Voices | clone |
| Say anything | Any line in any voice. | Audio → Lines | text to speech, voiceover |
| A song | Lyrics in, a sung song out. | Audio → Music | soundtrack, music |

#### Take it further
| Card | Line | Try it opens | Also finds |
|---|---|---|---|
| A reel to music | Pictures cut to a song's beat. | Workflows → Reel | slideshow, music video |
| A website film | A web address becomes a promo. | Workflows → Sizzle | promo, ad, launch video |
| An edit your agent cuts | Footage in, a finished edit out. | Workflows → Shinobi | auto edit |
| Swap who's in it | Your character replaces someone. | Workflows → Replace | face swap, replace |
| Styles from Civitai | Browse and add LoRAs. | LoRAs | style, look |

#### Get around
| Card | Line | Try it opens | Also finds |
|---|---|---|---|
| Everything you've made | Every version, song and line in one place. | Library | history, files |
| Private work | Incognito keeps it apart. | Title bar → Incognito | private |
| Render in the cloud | Your own Modal account, with a cost meter. | Cloud | GPU, no graphics card |
| Let your agent drive | Claude Code or Codex can do all of this. | Settings → Agents | MCP, automation |

**At the foot of the page:** *"New in this version"*, the release notes since the last version you opened, shown
once after each update, then kept here.

---

## Part 3 · The "?" on each page

A small "?" beside each page's title. It opens a panel: the page's video, and three to five tips that are easy
to miss.

- **Create:** Add references before Write it for me, so it writes about what it sees. · Type @ to bring in a
  character or a place. · The checker's Fix button mends most problems. · Draft quality is twice as fast for
  hunting. · An arc round two people is the one move that needs a previs clip.
- **Shots:** The ★ marks the best-scoring take, and picking one teaches it your taste. · Compare plays two takes
  in step. · Review names the problem and the fix; if a fix fails twice it suggests a different kind of fix. ·
  Enhance works on any finished take, later.
- **Projects:** Play the animatic before filming. · A sketch marked "from before" isn't used until you redraw it.
  · Recorded lines beat generated ones for timing. · One-take shots give one take, so film the shot before first.
- **Edit:** Right-click a clip for Extend, Retake, Cut out and Reframe. · Right-click empty space to fill a gap. ·
  F11 for full screen. · Loudness is in the edit settings (click empty timeline).
- **Characters:** Training shows its cost before it starts. · A made-up person in a film gets a drawn face; a
  character gives them a voice too.
- **Voices / Lines / Music:** A line can go straight into a shot. · MiniMax Music sings words clearly; ACE is quick
  for backgrounds. · A song's length follows its lyrics.
- **Workflows:** Reel finds the beat itself. · Cut out and Reframe also live in the editor's right-click menu.
- **Settings:** Incognito, folders, the prompt writer and your agent connection all live here.

---

## Part 4 · The eight tutorial videos (scripts)

All are silent with on-screen captions, so they also work as the looping clips on the Learn cards. Real
screens of the app; a pointer moves and clicks; captions sit at the bottom in IV Studio's type. Each ends on a
card: *IV Studio · Learn more: Learn → <card>*.

### T1 · Your first shot (about 60 s)
1. (0-5 s) Create, empty. Caption: **Start with an idea.** The pointer types "Tess waits at a bus stop in the
   rain, then pulls up her hood."
2. (5-12 s) Write it for me; the full prompt fills in. Caption: **Write it for me turns it into a full prompt.**
3. (12-17 s) The checker shows one finding; Fix clears it. Caption: **The checker fixes problems before you
   render.**
4. (17-27 s) Hunt: three previews appear, live pictures arriving step by step. Caption: **Hunt a few takes.**
5. (27-35 s) Shots: the ★ on the best take, its reasons. Compare wipes between two. Caption: **IV Studio marks
   the best take. Compare any two.**
6. (35-42 s) Review: three findings with timestamps and one fix. Caption: **Review says what's off, and how to
   fix it.**
7. (42-52 s) Finish at 2 MP with DLSS 5; the finished take plays. Caption: **Finish your pick in full
   quality.**
8. (52-60 s) Library opens with the shot's versions in one tile. End card. Caption: **Everything you make is in
   the Library.**

### T2 · A short film in six steps (about 60 s)
1. (0-6 s) Projects → New film; the idea typed; format and length chosen. **Start with an idea.**
2. (6-14 s) Story: Write it for me; a script appears. **IV Studio drafts the script. Or bring your own.**
3. (14-22 s) Cast and places: Tess cast, a made-up role gets a drawn face, a place photo, More angles. **Cast
   your characters. Everyone keeps one face, every shot keeps one room.**
4. (22-32 s) Storyboard: panels fill with sketches; a panel opens; the staging board. **Plan every shot on a
   storyboard.**
5. (32-38 s) Play the animatic. **Watch the animatic before you film.**
6. (38-50 s) Film it: takes appear on the panels; a take picked and finished. **Film every shot, pick your
   takes.**
7. (50-60 s) Watch: the film plays; Save as a video. End card. **Watch it, save it, or fine-tune it in the
   editor.**

### T3 · The editor, and new footage inside it (about 60 s)
1. (0-8 s) Edit: clips dragged from the bin to the timeline; a trim; a title. **A full editor, with Premiere's
   keys.**
2. (8-18 s) Right-click → Extend; a striped placeholder, then new footage. **Right-click to make a clip
   longer.**
3. (18-26 s) Right-click a gap → Fill this gap; the join. **Fill a gap with a shot that joins both sides.**
4. (26-34 s) Right-click → Retake this stretch. **Redo just a moment.**
5. (34-44 s) Right-click → Cut out "the old man"; he lands on V2 over another shot. **Cut someone out, and put
   them anywhere.**
6. (44-52 s) The edit set to Vertical; Right-click → Reframe to 9:16; the shot fills the frame. **Change the
   shape without cropping heads off.**
7. (52-60 s) Loudness: Online; Export. End card. **Exports come out right for phones.**

### T4 · Characters and their voices (about 45 s)
1. (0-8 s) Characters: Tess and Theo cards. **Characters keep the same face in every shot.**
2. (8-20 s) Train your own: the design step's faces, the clips, the cost shown, a checkpoint picked. **Make
   your own, on your own cloud account.**
3. (20-30 s) Audio → Voices: Design a voice from a description, three takes. **Give them a voice.**
4. (30-38 s) Lines: a line typed and spoken; Use in a shot. **Say anything in their voice.**
5. (38-45 s) The shot with Tess speaking it. End card. **The shot lip-syncs to it.**

### T5 · Music and reels (about 45 s)
1. (0-10 s) Audio → Music: style and lyrics typed; MiniMax Music. **Write a song.**
2. (10-18 s) The song plays, its waveform. **Sung words, clear enough to follow.**
3. (18-30 s) Workflows → Reel: pictures added, the song picked, Normal pace, 9:16. **Turn pictures into a reel.**
4. (30-45 s) The reel plays, cuts landing on the beat. End card. **It finds the beat itself.**

### T6 · Pictures and LoRAs (about 40 s)
1. (0-10 s) Create → Image: a model picked, words typed, four pictures. **Make pictures with six models.**
2. (10-18 s) Edit: "make it night, with snow". **Change a picture with words.**
3. (18-26 s) LoRAs → Discover: cards play on hover; one added. **Find styles on Civitai.**
4. (26-34 s) The LoRA in the tray, its strength set; a picture with it. **Add them to any picture or shot.**
5. (34-40 s) The viewer: Use in a shot. End card. **Any picture can start a shot.**

### T7 · Take a video further (about 50 s)
1. (0-10 s) Workflows: the cards. **Tools for after the render.**
2. (10-20 s) Sizzle: a web address typed; the storyboard; the finished promo. **A website becomes a film.**
3. (20-30 s) Replace: Theo put in place of Tess in her car clip. **Swap who's in the shot.**
4. (30-40 s) Shinobi: a one-click style cut. **An edit cut for you.**
5. (40-50 s) Sequences: two shots playing as one take. End card. **Longer scenes, one unbroken take.**

### T8 · Let your agent drive (about 45 s)
1. (0-10 s) Settings → Agents: Copy for Claude Code. **Connect your agent in one step.**
2. (10-20 s) Claude Code opens with the start menu: "What do you want to make?" **It offers what to make.**
3. (20-35 s) The agent makes a shot; the Queue shows it; the take lands in Shots. **It can do everything you
   can.**
4. (35-45 s) An agent edit appears in the editor's strip with Undo. End card. **And you can undo anything it
   does.**

---

## Part 5 · How the videos would be made

- **Tool:** HyperFrames (already set up here; the sizzles and the IV Studio trailers were made with it). It
  renders on this PC for free, and you can tweak any video in the HyperFrames desktop app.
- **Screens:** real captures of the app from a test copy on showcase data (your Tess and Theo shots, songs and
  voices, copied, never your live data), at 2x so nothing is soft. The pointer and its clicks are drawn on top.
- **Look:** IV Studio's own type and colours, the same caption style in all eight, and the same end card.
- **Sound:** a quiet bed from IV Studio's Music (free, local), or silent. A voiceover can come later through
  Higgsfield; that needs your OK on the cost.
- **Outputs:** each video at 1920x1080 for YouTube and the README, plus a short loop (the key 6 to 10 s) for its
  Learn card, kept small inside the app.
- **Order:** T1 first as the pilot, for you to judge the style before the other seven.
