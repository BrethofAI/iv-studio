# Rebuild: take a video apart shot by shot, then rebuild it on this PC

Date: 2026-11-08. Status: direction approved by Matthew (name, art and motion); not built. Nothing in this design is
implemented in IV Studio.
The method was proven outside the app the same day (see "What is already proven").

Revision 2 (same day, Matthew: rewrite it "without having to do the whole mumbo jumbo license"): IV Studio reads
the video with its own code and the tools it already ships. No rea-video, no new Python environment, no new models,
so nothing new to license.

## Goal

A new workflow on the Workflows page, beside Sequences, Sizzle, Reel, Shinobi, Replace and the drafted Same format.
The person drops in a video. IV Studio finds its shots, works out how each one was made (AI video, live footage,
code graphics, screen recording, still), what sits on top (captions, titles, stickers), the sound (speech, music and
its tempo, quiet stretches) and the cut rhythm. Then it rebuilds the video on this PC: the AI-type shots are
rendered again with H3 from the video's own first and last frames, optionally with a swap (new person, product or
setting), the other shots are kept, rebuilt or replaced with the person's footage, and everything is cut back on the
original timeline with the captions as editable titles.

Free: everything runs on this PC. No paid generation, writer or vision provider is ever called.

## How it differs from the workflows next to it

| | Rebuild (this) | Same format (drafted 11-06) | Replace (shipped) |
|---|---|---|---|
| Keeps | the video itself: shots, framing, timing, cut | the format only: concept, pacing, style | one clip's camera, motion and sound |
| Changes | nothing (a clean regenerate) or one swap | the whole idea | who is in it, or the scene |
| Reference frames go to H3 | **yes**, as first/last frames | never | yes (painted keyframes) |
| Length | the whole video, shot by shot | up to 60 s, new shots | up to 14 s per take |
| Reference must be | the person's own, or theirs to rework | anything (only described) | the person's own, or theirs to rework |

Because Rebuild feeds the reference's own frames to H3, it is only for footage the person made or has the right to
rework: their own renders, a client's footage they were hired to redo, licensed material. Step 1 asks for that
explicitly (a checkbox, recorded with the time). For someone else's video the page points to **Same format**, which
only describes the reference.

Name: **Rebuild**, internal id `rebuild` (`src/service/rebuild.js`, data in `rebuild/<id>/rebuild.json`). Not
"Remake": that name belongs to the Viggle engine (`remake.js`).

## What is already proven (outside the app, 2026-11-08)

A Claude skill ran the whole chain on a 19 s sample video through IV Studio's MCP server, with the open-source
rea-video tool as the reader:

- Shot 9 (2.67 s): Flux 3 Klein edit removed the burned-in captions from its frame in about 30 s each, with the
  person, room and props intact (it tightened the framing slightly).
- H3 frames mode, 5.17 s, two previews in about 2 min; finished at 1 MP in about 2 min. Identity, wardrobe, room and
  mug held; no text came back. The take was trimmed to the shot's length and cut back in.

What the test taught, and what this design keeps from it:

- H3's prompt checker warns below 5.17 s (`too-short`), and most cuts in fast edits are 1 to 3 s.
- The pixel-statistics guess at "AI or real footage?" was only 55% sure on that video; every shot still had to be
  checked by eye. Here the person's writer does that look directly, so the guess is not rebuilt.
- Re-laying captions with a generic font came out rough. Here captions become editable titles in Edit.

The test used rea-video only as a reader. This design does not use, bundle or copy it: IV Studio's reader is its own
code, written from the ideas, with the tools below.

## The reader: IV Studio's own, nothing new to install

Everything below runs in Node with IV Studio's bundled ffmpeg and ffprobe, or with engines IV Studio already has.

| What it finds | How | Already in IV Studio |
|---|---|---|
| The video's size, length, frame rate, sound | ffprobe | `media.js` `probe()` |
| Where the cuts are | ffmpeg's scene score (`select='gt(scene,T)'` with `showinfo`), threshold about 0.28 as the Same format design uses, plus a minimum shot length so flashes and fades don't split shots | ffmpeg is bundled; the cut finder is new code |
| Each shot's pictures | First, middle and last frame per shot, and a contact sheet per shot | new code, the same ffmpeg calls Sizzle uses for its sheets |
| Camera moves | Frame-to-frame difference and shift measured below the caption band, per half second: hold, drift, pan, push, whip | new code, also planned for Same format |
| Music tempo and beats | The Reel beat finder: onset envelope, tempo by autocorrelation, beats | `reel.js` `findBeats()` |
| Loudness and quiet stretches | ffmpeg `ebur128` and `silencedetect` | ffmpeg is bundled |
| What is said | Whisper large-v3 turbo (MIT) in the voice engine, run on each shot's stretch of sound, so every shot gets its own words | `voices.transcribe()`; only when the voice engine is set up. Without it, speech is left out and the frames still carry the captions |
| When captions change | Frames sampled about 4 per second; the difference inside the top and bottom caption bands marks where the text changes | new code |
| What the captions say, how each shot was made, framing, light, what's on screen | The person's writer (`writerOf`: the local vision model, Claude Code or Codex through `harness.js`) looks at each shot's contact sheet and its caption-band frames and answers in IV Studio's JSON: the shot kind, the caption lines with their times, the framing, the light, a one-line description | `review.js` already sends pictures to the writer this way |

The writer's answer for each shot:

```json
{ "kind": "ai_video | live | code_graphics | screen | still | film_clip | unsure",
  "why": "one sentence from what is visible",
  "description": "subject, wardrobe, place, framing, the motion",
  "captions": [{ "text": "…", "from": 0.0, "to": 1.2, "where": "top | bottom | middle" }],
  "stickers": ["a heart emoji, top right"],
  "camera": "fixed | handheld | push in | pan left …",
  "light": "one phrase" }
```

`unsure` is allowed and shows on the page as a question for the person. Caption times come from the measured
caption-band changes; the writer only reads the words between them.

Optional later (not needed for v1): word-level times from Whisper. `voice_server.py` returns text only today; adding
`return_timestamps` is a small change to code IV Studio already owns, under the same MIT model.

## Decisions

| Question | Recommended decision |
|---|---|
| Planning | Pure functions in `rebuild.js`, tested in `test/rebuild.mjs`. Each shot gets a route (next table). |
| H3 length | On the 17n+5 grid at 24 fps, never under 124 frames (5.17 s). Shots of about 4.1 s or more: first and last frame (FL2VA), sized so the cut needs at most a 1.25x slow-down. Shorter shots: 5.17 s from the first frame only (I2VA), the action written to happen at once, and the take trimmed to the shot's length so it plays at natural speed. A shot needing more than 345 frames (about 18 s and longer, after the 1.25x allowance): split into several renders, each continuing from the last (Continue mode); build step 1 rejects these and leaves the splitting to step 2. |
| Frames | Cropped to the shot's aspect. Burned-in text removed with IV Studio's picture editor (Qwen Image 2.1 edit, Flux 3 Klein fallback, as `remake.js` paints), because H3 copies text it sees. For a swap, the same editor applies one instruction (words, a character's face, or a product picture) to both frames with one seed so the ends match. |
| Prompts | Written by the person's writer from the contact sheet, the frames and the shot's reading (description, camera, light), starting from MiniMax's exact alignment line, then through the prompt checker (`lint.js`). |
| Takes | Two previews per shot by default (three for a swap), ranked by `ranking.js`, the best finished at **1 MP** (2 MP and SeedVR2 are options). |
| The cut | A new IV Studio **Edit**, built like `build_rough_cut`: V1 holds every shot in order (finished take retimed into its slot within 1/1.25 to 3x speed then trimmed, or the original segment, or the person's footage, or the rebuilt still); T1 holds every caption as an editable title at its measured time and place (`add_title`); A1 holds the reference's sound as a **guide track**, A2 the takes' own H3 sound, muted. |
| Sound | The guide track is for timing and comparison. Before export the page offers replacements: music at the measured tempo and mood (`make_music`), lines in an invented or the person's own voice (`speak_line`), or the H3 takes' own sound. Export warns while the guide track is on. |
| Gates | Two: **Approve plan** (routes and the GPU estimate) and **Approve frames** (the cleaned or swapped frames side by side). Nothing renders before each. Recorded with the time; an agent never approves for the person. |
| Cost | Local and free. The plan gate shows GPU minutes (about 2 min of previews and 2 min of finish per H3 shot on the 4090, from the test). The reading itself is ffmpeg on the CPU plus one writer call per shot. With Cloud on, the same estimate as Same format: minutes times the chosen GPU's list price, labelled an estimate. |
| Shared with Same format | The reader is one module (`src/service/reader.js`), used by Rebuild and by Same format when it is built, so IV Studio measures references one way. |

### Routes per shot

| Route | When | What happens |
|---|---|---|
| `h3` | AI video and animation; live footage if the person chooses | Frames cleaned or swapped, H3 previews, pick, finish, retime into the slot |
| `still` | Stills and slow pushes | Rebuilt from the first frame with the measured push and pan (ffmpeg), free and instant |
| `keep` | Code graphics, screen recordings, anything the person keeps | The original segment |
| `own` | Live footage or screen recordings the person reshoots | Their file, retimed into the slot |
| `replace` | A stretch of up to 14 s whose motion must match exactly | Handed to Replace (`remake_paint`, `remake_render`); the result comes back as that stretch |

Code graphics can later be rebuilt in Shinobi from the measured captions and the writer's description; v1 keeps them.

## What the person sees

Workflows gets a **Rebuild** card ("A video, taken apart and rebuilt"). Its page is a five-step wizard:

1. **Video.** Drop a file (v1: local files up to 2 minutes), tick "I made this video or I have the right to rework
   it", say what changes: nothing, or a swap in plain words (with a character, a face picture or a product picture).
   IV Studio reads it: cuts and sound in seconds, then one writer look per shot.
2. **Breakdown and plan.** The storyboard strip, one row per shot: thumbnail, time, how it was made with the
   writer's reason, the route, the H3 length, and a flag where frames carry text or the writer was unsure. A summary
   line (shots, how many to render, the tempo). Change any kind or route. **Gate 1: Approve plan**, with the GPU
   estimate.
3. **Frames.** Every H3 shot's first (and last) frame before and after cleaning or swapping. Repaint one, or set
   your own picture. **Gate 2: Approve frames.**
4. **Shots.** Each shot's previews with their ranking, Review, finish or retake, as in Sizzle.
5. **Cut.** The first cut in Edit, reference and rebuild side by side (the existing `CompareViewer`, side by side
   or a wipe), the sound choices, export.

## Look and motion

Rebuild looks and moves like the other workflows, using what they already use, plus one idea of its own: the
video's **storyboard strip** is the thread through all five steps. It is built while the video is read, coloured by
route in the plan, swapped shot by shot as takes finish, and becomes the timeline in the cut.

### Artwork

Made the way `docs/art/README.md` records for every page and card: ChatGPT image generation through the Codex CLI
(`codex-images.ps1`, Matthew's default for stills), no text in the pictures, references from the existing banners,
every result checked close up before it goes in.

- **Page banner** `assets/pages/rebuild.webp` (1400 x 737, WebP quality 86), in the banners' style with the eye's
  place taken by the subject: a strip of film whose frames have come apart and float in a loose arc, the last few
  snapping back into the strip. References: the Workflows and Sequences banners.
- **Workflows card** `assets/workflows/rebuild.webp` (800 x 533, WebP quality 80): the same subject closer in, drawn
  from the approved banner plus the Shinobi card, so it sits with the other five. Shown by the existing card code
  (30% faded art, the hover zoom).
- The masters and prompts stay outside the repo, as the other art does, and the art README gets a Rebuild entry.

### Motion, step by step

| Step | What moves | Built from |
|---|---|---|
| 1 Video | While the cuts are found, the strip fills left to right, one tile per shot sliding in at its real width (shot length). While the writer reads, a thin red line sweeps across the tile being read; when its answer lands, the tile's kind chip flips in (AI video, live, code graphics, screen, still, unsure). Speech, when the voice engine is set up, shows each shot's words fading in under its tile. | `wiz-slide` (the red bar), the card hover timing |
| 2 Plan | The strip's tiles take their route colour (H3 red, keep grey, still cream, own and Replace outlined) with a short cross-fade when a route changes. The GPU estimate counts up to its new total. | the plan's own CSS, `confirm-in` timing |
| 3 Frames | Each frame shows before and after with a **wipe** handle (drag, or arrow keys), as the Compare viewer does. A frame being cleaned or swapped shows the pulsing placeholder until it lands. | `CompareViewer` wipe, `wiz-pulse` |
| 4 Shots | Panels rendering or finishing dim and carry the sliding red bar, as Projects does. When a take is finished, its strip tile cross-fades from the original frame to the new one and gets a small "rebuilt" mark, so the strip shows progress at a glance. | `wiz-panel.film.rendering`, `wiz-slide` |
| 5 Cut | The strip slides down into the Edit's V1 track shape as the edit opens; the comparison plays reference and rebuild together, side by side or as a wipe. | `CompareViewer` |

Rules, the same as the rest of the app: motion only shows state changes or work in progress (never decoration that
loops while nothing is happening); every animation is 150 to 400 ms except the progress bar; with **reduced motion**
on, nothing slides, sweeps, counts or fades, and every state shows at once (the existing
`prefers-reduced-motion` blocks in `studio.css`); keyboard users get the same focus states as the other wizards; and
the strip's colours always come with a text label, never colour alone.

### Help and Learn

The page's "?" works like the other workflow pages: `rebuild` joins `TIPS_FOR_ART` under `workflows`, and the
workflows tips in `learn.js` gain a Rebuild entry (what it's for, the rights rule, how long the steps take). A short
tutorial video can follow when Learn's videos come back.

## Agent tools (MCP)

Named like the Sizzle tools. Each returns the rebuild and pictures to look at where they help.

| Tool | Step | What it does |
|---|---|---|
| `rebuild_read` | 1 | Copy the video in, record the rights confirmation (required: true), find the shots and measure them. Returns the storyboard, the contact sheets and the shot table, with each shot's kind empty for the agent to fill (or filled by the person's writer when `writer: true`). |
| `view_rebuild_shot` | 1-2 | One shot's contact sheet, first and last frame, caption-band frames and measurements. |
| `save_rebuild_reading` | 1 | The agent's (or writer's) answer per shot, in the JSON above. |
| `save_rebuild_plan` | 2 | Routes, the swap instruction and per-shot prompts. Validated (below). Saving resets approval. |
| `approve_rebuild_plan` | Gate 1 | Only after the person says yes, or they approve on the page. |
| `make_rebuild_frames` | 3 | Crop, clean and swap the frames. `only` repaints one shot. |
| `approve_rebuild_frames` | Gate 2 | Only after the person says yes. |
| `make_rebuild_shots` | 4 | Previews for every `h3` shot; finished once picked. |
| `rebuild_first_cut` | 5 | Build the Edit (V1 shots, T1 captions, A1 guide sound, A2 takes' sound). |
| `get_rebuild` | any | Status, shots, takes, the edit. |
| `list_rebuilds` / `delete_rebuild` | any | Delete asks the person first, as the other deletes do. |

When the agent driving IV Studio is Claude Code or Codex, it reads the shots itself (it can see the contact sheets
the tools return) and saves its answer with `save_rebuild_reading`; the page uses the person's writer setting.

The agent guide (`resources/agent-guide.md`, also the installed Claude Code skill) gets a Rebuild section with the
house rules below, and the outside skill (`~/.claude/skills/rea-video-iv-studio`) is retired in favour of these
tools once they ship.

## The plan file

`save_rebuild_plan` checks, before anything is saved:

- Every shot has exactly one route, and the shots tile the video with no gaps.
- Every `h3` shot has a prompt that starts with the alignment line its frames need (FL2VA with two frames, I2VA with
  one), passes the checker with no errors, and ends with the no-text line.
- H3 lengths are on the 17n+5 grid, at least 124 frames; short shots carry `trimTo`.
- Every `own` shot names an existing file; every `replace` stretch is 14 s or less.
- A swap names what changes and, for a person, an invented character, the person's own, or someone who agreed.

Tested in `test/rebuild.mjs` without ffmpeg: the cut finder on recorded scene scores, caption-change detection on
recorded band differences, route choice, the frame grid and trim, the retime factor, captions to titles, and plan
validation. Then one end-to-end check on a real video before release, with the shot list compared against a
by-hand count of its cuts.

## House rules for this workflow

- Only video the person made or may rework. The confirmation is required and recorded.
- People and voices: invented characters, the person's own, or people who agreed. Never a real stranger's face or
  voice from the reference.
- The reference's sound is a guide; the page says so and export warns while it is on.
- No paid service anywhere in the chain, and the writer runs on the person's own setting (local, or their own Claude
  Code or Codex login).
- Nothing is published or uploaded by this workflow.

## Licences

Nothing new. The reader uses ffmpeg (already bundled, run as a separate program and credited in
`THIRD_PARTY_NOTICES.md`; the scene, `ebur128` and `silencedetect` filters are standard in its 6.1.2 build), Whisper
large-v3 turbo (MIT, downloaded by the voice engine's own setup, which already lists it with its licence), IV
Studio's own beat finder and the person's writer. The picture editor and H3 are the ones
Replace and Shots already use. IV Studio's reader is written from the ideas in the method, not copied from rea-video
or any other project, so it carries no outside notice.

## Build order

1. **Reader, engine and tools, no page.** `reader.js` and `rebuild.js` with their tests, the MCP tools and the
   agent-guide section. Proves the flow inside the app; agents can use it at once.
2. **The page.** The banner and card art, the Workflows card, the five-step wizard with its motion, and the help
   tips, once the tools have been used on a few real videos.

Each step gets its own implementation plan and local test; any release is a separate, approved step.

## Decisions taken (2026-11-08)

Matthew approved the name and asked for animation and art like the other workflows (section "Look and motion"). He
left the rest to what serves the person best:

1. **Name: Rebuild.** Approved by Matthew.
2. **The rights rule stays.** The checkbox protects the person, and it is one click for someone rebuilding their own
   work. Until Same format exists, the page says plainly that Rebuild is for video you made or may rework and why;
   when Same format ships, that line links to it.
3. **Speech is optional.** Captions are always read from the frames. When the voice engine isn't set up, step 1
   shows one line, "Set up voices to also read what's said", linking to Audio > Voices; the reading never waits for
   it or fails without it.
4. **The shared reader is built now.** `reader.js` comes with Rebuild, with an interface Same format can call later,
   so IV Studio measures references one way.

## Next step

An implementation plan for build step 1 (reader, `rebuild.js`, tests, MCP tools, agent guide), then a local build
and test. The page, its art and its motion are build step 2, after the tools have been used on a few real videos.
Any release is a separate, approved step.
