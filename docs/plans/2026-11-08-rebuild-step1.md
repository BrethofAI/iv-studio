# Rebuild, build step 1 Implementation Plan (reader, service, agent tools)

**Goal:** An agent can take a video the person owns through IV Studio's MCP server from file to a first cut in Edit:
read it into shots, save what each shot is, plan routes, clean or swap frames, render the H3 shots on this PC, pick
and finish takes, and get an Edit with every shot in its slot and the captions as titles. No page yet.

**Source:** `docs/superpowers/specs/2026-11-08-rebuild-workflow-design.md` (revision 3, direction approved by Matthew
on 2026-11-08: name, art and motion; open questions decided). This plan covers its "Build order" step 1 only.

**Current state (verified 2026-11-08 on branch `claude/comfy-updates`, HEAD `419dec7`):**

- No reader or rebuild code exists. Workflow services follow `src/service/sizzle.js`: a class over
  `<data>/<kind>/<id>/<kind>.json`, plan, approve, make pieces, refresh, first cut; MCP tools in `src/mcp/server.js`
  (`tool(...)` for JSON results, `sizzleTool(...)` for results with pictures).
- Reusable pieces, all present: `Edits.run(args)` (ffmpeg, resolves stdout as a Buffer), `probe(ffprobe, file)` in
  `media.js`, `Reels.beatsOf(file)` (tempo and beats from a file), `Voices.transcribe(file)` (Whisper, text only) and
  `Voices.status().ready`, `Remake.painter()` (picks Qwen Image 2.1, else Flux.2 or Flux 3 Klein) and
  `Remake.waitPictures(setId)`, `Images.create({ mode: 'edit', model, prompt, refs, keepAspect, aspect, megapixels, name, tag })`,
  `Studio.generatePreviews(input)`, `Studio.finishCandidate({ jobId, ... })`, `Studio.getJob(id)`,
  `Studio.localCopy(file, dir)`, `harnessJson({ engine, model, system, user, schema, images })` in `harness.js`,
  `writerOf(settings)` in `paths.js`, `applyOps(edit, ops)` in `timeline.js` (ops incl. `add_clip`, `add_title`,
  `update_clip`), `Edits.create(name)`, `Edits.addMedia(file, source)`, `Edits.write(e)`, `FORMATS` in `edits.js`
  (`1080p`, `4k`, `vertical`, `square`), `nearestAspect(width, height)` in `editgen.js`, `lintPrompt` and `blocking`
  in `lint.js`.
- Tests are plain Node scripts in `test/` (`node test/<name>.mjs`, `test/package.json` sets ES modules), printing
  `ok  <name>` per check. MCP tests start `out/main/mcp.js` with Electron's binary and `IV_STUDIO_DATA=<temp>` for
  writes (`test/mcp-tools.mjs`). `npm.cmd run build` makes `out/`.
- The worktree has someone else's uncommitted changes (`src/renderer/src/components/edit/Editor.jsx`,
  `src/service/reframe.js`, `test/reframe.mjs`, two 11-06 docs). This plan never touches them.

**Architecture:** Two new modules. `src/service/reader.js` reads any video into shots with IV Studio's bundled ffmpeg,
Reel's beat finder and, when set up, the voice engine's Whisper; Same format will reuse it later. `src/service/rebuild.js`
holds the pure planning rules and a `Rebuilds` class shaped like `Sizzles`, which drives the existing Studio, Images,
Remake painter and Edits services. The MCP server gains eleven tools in a Rebuild block beside the Sizzle block.

**Tech stack:** Node ESM in Electron 0.3.x app, `ffmpeg-ffprobe-static` 6.1.2, `zod` schemas, MCP SDK
(`@modelcontextprotocol/sdk`), electron-vite build.

## Constraints and acceptance criteria

- No new dependency, Python environment or model. ffmpeg filters used: `select`, `metadata=print`, `scale`, `crop`,
  `format=gray`, `fps`, `tile`, `setpts`, `tpad`, `trim`, `zoompan`, `ebur128`, `silencedetect` (all standard in 6.1.2).
- Nothing from rea-video is copied; the code is written from the design.
- `rebuild_read` refuses without `rights: true`, and records `rightsConfirmedAt`.
- Nothing renders before `approve_rebuild_plan`; no H3 shot renders before `approve_rebuild_frames`. Saving a plan
  resets both approvals; remaking frames resets frame approval.
- H3 lengths: on the 17n+5 grid at 24 fps, at least 124 frames (5.17 s). FL2VA (first and last frame) when the take
  fits the slot with at most a 1.25x speed-up (`frames / 24 / duration <= 1.25`, so shots of about 4.13 s and longer);
  otherwise I2VA with `trimTo = duration`. A shot needing more than 345 frames (about 18 s and longer) is rejected by
  `save_rebuild_plan` with "split it" (Continue-mode splitting is out of step 1).
- Paid paths never used: no `contextir` engine, no outside vision key; the writer is `writerOf(settings)` (local
  Ollama vision model, Claude Code or Codex on the person's own login).
- Speech is optional: when `voices.status().ready` is false, the reading has `speech: null` and a note, and nothing fails.
- Deliberate step-1 scope cuts against the spec, each to be picked up in step 2: no measured camera motion (the
  writer's `camera` answer is used, and `still` shots get a fixed 3% push), no Continue-mode splits for shots over
  about 18 s, and the takes' own sound stays on their V1 clips, muted, instead of a separate A2 track.
- Every new test prints `ok  <name>` lines and exits non-zero on a failure.

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/service/reader.js` | Create | Pure parsers (scene scores, cuts, caption-band changes) and the `Reader` class that reads a video into shots, frames, sheets, beats, loudness, silences and optional speech. |
| `src/service/rebuild.js` | Create | Pure Rebuild rules (H3 lengths, routes, alignment lines, plan validation, retime, captions to titles) and the `Rebuilds` class (store, read, reading, plan, gates, frames, shots, refresh, first cut). |
| `src/mcp/server.js` | Modify | Construct `Reader` and `Rebuilds`; register the eleven Rebuild tools after the Sizzle block. |
| `resources/agent-guide.md` | Modify | A "Rebuild: take a video apart and rebuild it" section after "Replace", and one line in "House rules". |
| `test/reader.mjs` | Create | Parser tests on recorded text and arrays, plus a read of a generated three-shot video. |
| `test/rebuild.mjs` | Create | Pure rule tests (lengths, routes, plan validation, retime, captions to titles). |
| `test/mcp-rebuild.mjs` | Create | The tools over stdio on a generated video in a temporary data folder, up to the plan gate (no GPU). |

Branching: implement in a separate worktree so the in-progress reframe/editor changes stay untouched:
`git -c safe.directory=* worktree add ..\iv-studio-rebuild -b claude/rebuild-step1 419dec7`, then
`npm.cmd ci` there. Commit checkpoints below are for Matthew's OK; nothing is pushed, released or deployed by this plan.

### Task 1: Reader parsers (pure)

**Files:**

- Create: `src/service/reader.js`
- Test: `test/reader.mjs`

**Interfaces:**

- Produces (exports):
  - `parseSceneScores(text)` → `[{ t: number, score: number }]`. Input is the stdout of
    `metadata=print:file=-`: blocks of `frame:N pts:P pts_time:T` followed by `lavfi.scene_score=S`. Lines that don't
    pair are skipped.
  - `cutsFromScores(scores, { duration, threshold = 0.28, minShot = 0.4 })` → sorted cut times (seconds). A score at or
    above `threshold` is a cut unless it is within `minShot` of the start, the end or the previous kept cut; when two
    candidates sit within `minShot`, the higher score wins.
  - `shotsFrom(cuts, duration)` → `[{ index: 1.., start, end, duration }]`, tiling `0..duration`, times rounded to 3
    decimals.
  - `bandChanges(frames, { fps = 4, threshold = 12, minGap = 0.3 })` → change times (seconds). `frames` is an array
    of `Uint8Array` of equal length (one grey band per sampled frame); the change score between frame k-1 and k is
    the mean absolute byte difference; a change is recorded at `k / fps` when the score is at least `threshold` and at
    least `minGap` after the last change.
  - `READER = { threshold: 0.28, minShot: 0.4, bandFps: 4, band: 0.22, bandWidth: 96, bandHeight: 24 }`.

**Acceptance check:** `node test/reader.mjs` prints `ok` for every parser case.

- [ ] Write `test/reader.mjs` (style of `test/reel.mjs`: `const ok = (name, fn) => ...`) with:
  - `parseSceneScores` on a 6-frame recorded sample string (two `frame:` blocks with scores 0.02 and 0.61, one block
    missing its score) → two entries with the right `t`.
  - `cutsFromScores` on `[{t:0.04,s:.9},{t:2.0,s:.5},{t:2.2,s:.7},{t:4.5,s:.1},{t:6.9,s:.4}]`, `duration 7` →
    `[2.2]` (0.04 too near the start, 2.0 loses to 2.2, 6.9 too near the end, 4.5 below threshold).
  - `shotsFrom([2.2, 4], 7)` → three shots `0-2.2`, `2.2-4`, `4-7`, durations `2.2, 1.8, 3`.
  - `bandChanges` on 12 frames of 96x24 bytes: frames 0-4 all 0, frame 5 all 200, frames 6-11 all 100. With the
    defaults (`fps 4`, `threshold 12`, `minGap 0.3`) → `[1.25]` (the change at frame 6, 0.25 s later, is inside
    `minGap`); with `minGap: 0.2` → `[1.25, 1.5]`.
- [ ] Run `node test/reader.mjs`; expect `ERR_MODULE_NOT_FOUND` for `src/service/reader.js`.
- [ ] Implement the exports above in `src/service/reader.js` with a header comment in the style of `sizzle.js`
  (what it does, what it uses, "written for IV Studio; reused by Same format").
- [ ] Run `node test/reader.mjs`; expect all `ok`.

### Task 2: Reader on a real file

**Files:**

- Modify: `src/service/reader.js`
- Test: `test/reader.mjs`

**Interfaces:**

- Consumes: `Edits.run(args)` and `Edits.runErr(args)` (passed in as `run`, `runErr`), `probe(ffprobe, file)` from `media.js`, `Reels.beatsOf(file)`
  (passed in as `beatsOf`), `Voices.status()` and `Voices.transcribe(file)` (passed in as `voices`, may be null).
- Produces: `class Reader { constructor({ ffmpeg, ffprobe, run, runErr, beatsOf, voices = null, onLog }) ; async read(file, outDir, { speech = true } = {}) }`.
  `read` writes into `outDir` and resolves to:

  ```js
  { source: { file, width, height, fps, duration, hasAudio },
    shots: [{ index, start, end, duration, first, middle, last, sheet, bandTop: [times], bandBottom: [times], words: string | null }],
    music: { bpm, beats, strength } | null,          // null when there is no sound
    loudness: { integrated, range } | null,           // LUFS, from ebur128's summary
    silences: [{ start, end }],
    speech: 'read' | 'not_set_up' | 'no_sound' }
  ```

**Acceptance check:** reading a generated 3-shot, 5.5 s test video gives 3 shots at about 2 s and 3.5 s, frames and
sheets on disk, one bottom-band change inside shot 3, and `speech: 'not_set_up'` when no voices are passed.

- [ ] In `test/reader.mjs`, add an integration section that skips with a printed `skip` when
  `ffmpeg-ffprobe-static` paths don't exist. It builds `tmp/three.mp4` with ffmpeg: `color=red:s=480x854:d=2`,
  `color=blue:d=1.5`, `testsrc2=s=480x854:d=2`, concatenated, 24 fps, with a 1 kHz `sine` audio track; on the third
  segment a `drawbox` in the bottom 20% switches on at 4.5 s. Then `new Reader({...}).read(file, dir)` and assert:
  3 shots; `|shots[1].start - 2| < 0.1`; `|shots[2].start - 3.5| < 0.1`; every `first`, `middle`, `last`, `sheet`
  file exists; `shots[2].bandBottom` has one time within 0.3 s of 4.5; `speech === 'not_set_up'`.
- [ ] Run it; expect the `read is not a function` (or missing export) failure.
- [ ] Implement `read`:
  1. `probe` for size, fps, duration, sound.
  2. Scene scores: `run(['-v','error','-i',file,'-an','-vf',"select='gte(scene,0)',metadata=print:file=-",'-f','null','-'])`,
     parse stdout with `parseSceneScores`, then `cutsFromScores`, `shotsFrom`.
  3. Per shot: frames at `start + 0.04`, the middle and `end - 0.06` (`-ss` before `-i`, `-frames:v 1`, JPEG `q:v 3`)
     into `outDir/shots/shot_NNN_{first,middle,last}.jpg`, and `shot_NNN.jpg` = those three tiled `3x1` at 320 px wide.
  4. Caption bands: one pass at `READER.bandFps` over the whole video,
     `-vf fps=4,format=gray,split[a][b];[a]crop=iw:ih*0.22:0:0,scale=96:24[t];[b]crop=iw:ih*0.22:0:ih*0.78,scale=96:24[u]`
     as two raw `gray` outputs (two runs if a single dual-output pipe is awkward), split into 2304-byte frames,
     `bandChanges` on each, and the times assigned to the shot they fall in.
  5. Sound (when `hasAudio`): `beatsOf(file)` for `music`; `runErr(['-hide_banner','-i',file,'-af','ebur128','-f','null','-'])`
     (`Edits.runErr` resolves with ffmpeg's stderr) and parse the summary's `I:` and `LRA:` for `loudness`; the same
     with `-af silencedetect=n=-35dB:d=0.4`, parsing `silence_start` / `silence_end` pairs, for `silences`.
  6. Speech: if `speech && voices?.status().ready`, cut each shot's sound to a temp WAV and `voices.transcribe` it
     into `words`; else `speech` is `'not_set_up'` (or `'no_sound'`).
  7. Write `outDir/reading.json` and return it.
- [ ] Run `node test/reader.mjs`; expect all `ok`.

### Task 3: Rebuild rules (pure)

**Files:**

- Create: `src/service/rebuild.js` (pure part)
- Test: `test/rebuild.mjs`

**Interfaces (exports):**

- `KINDS = ['ai_video', 'live', 'code_graphics', 'screen', 'still', 'film_clip', 'unsure']`
- `ROUTES = ['h3', 'still', 'keep', 'own', 'replace']`
- `defaultRoute(kind)`: `ai_video` → `h3`; `still` → `still`; everything else (incl. `unsure`) → `keep`.
- `h3Length(duration)` → `{ frames, seconds, short, useLast, trimTo, tooLong }`.
  `natural = 17 * ceil((duration*24/1.25 - 5) / 17) + 5`; `frames = max(124, natural)`;
  `short = frames / 24 / duration > 1.25`; `useLast = !short`; `trimTo = short ? duration : null`;
  `seconds = round(frames/24, 3)`; `tooLong = frames > 345`.
- `alignmentLine({ useLast, seconds })`: FL2VA → `How the reference pictures align with the target video \u2014 Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${seconds.toFixed(2)}-second mark of the target video.`;
  I2VA → `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`
- `NO_TEXT = 'There is no writing anywhere in the picture.'`
- `validatePlan(rebuild, plan, { lint, exists })` → normalized plan or throws an `Error` naming the shot. Rules: one entry per shot index;
  `route` in `ROUTES`; `h3` needs a prompt that starts with `alignmentLine(h3Length(shot.duration))`, contains
  `NO_TEXT`, and has no error in `blocking(lint(prompt, { mode: 'frames', seconds, media }))` (`lint` is passed in; the class passes `lintPrompt` from `lint.js`, whose signature is `lintPrompt(prompt, { mode, seconds, media, character, voiceLine })`);
  `h3` with `tooLong` → "Shot N is too long for one H3 take (about 18 s and up): split it, or keep it"; `own` needs an existing `file`;
  `replace` needs `duration <= 14`; `swap` (optional) is `{ ask: string, picture?: string }` and `ask` is non-empty.
- `retime(takeSeconds, slotSeconds)` → `{ speed, trim }`: `speed = clamp(takeSeconds/slotSeconds, 1/1.25, 3)`; the
  clip is played at `speed` and trimmed or held (`tpad`) to `slotSeconds`.
- `captionsToTitles(shots)` → `[{ op: 'add_title', content, start, duration, position, box: true, size: 5 }]` from each
  shot's `reading.captions` (`where` `middle` → `center`), times absolute (`shot.start + from`), each at least 0.3 s.
- `formatFor(width, height)` → the `FORMATS` key with the nearest aspect.

**Acceptance check:** `node test/rebuild.mjs` passes these exact cases:

- [ ] Write `test/rebuild.mjs` asserting: `h3Length(2.667)` → `{frames:124, short:true, useLast:false, trimTo:2.667}`;
  `h3Length(4.2)` → `frames 124, short false, useLast true`; `h3Length(4.1)` → `short true`; `h3Length(8)` →
  `frames 158`; `h3Length(15)` → `frames 294, tooLong false`; `h3Length(20)` → `tooLong true`; `alignmentLine` for both cases exactly (including the em dash `\u2014`); `defaultRoute('unsure') === 'keep'`;
  `retime(5.167, 2.667)` → `speed 1.937`; `retime(2, 4)` → `speed 0.8`; `captionsToTitles` on a shot starting at 13.458
  with one caption `{text:'A', from:0.5, to:0.6, where:'middle'}` → one title at `13.958`, duration `0.3`, `center`;
  `validatePlan` errors for: a missing shot, an `h3` prompt without the alignment line, without `NO_TEXT`, an `own`
  route with a missing file, a 20 s `h3` shot; and success for a valid two-shot plan (lint stubbed to no findings).
- [ ] Run `node test/rebuild.mjs`; expect module-not-found.
- [ ] Implement the exports at the top of `src/service/rebuild.js`.
- [ ] Run `node test/rebuild.mjs` and `node test/reader.mjs`; expect all `ok`.

### Task 4: The Rebuilds service: read, reading, plan, gates

**Files:**

- Modify: `src/service/rebuild.js` (class part)

**Interfaces:**

- Produces: `class Rebuilds { constructor({ dataDir, reader, studio, images, remake, edits, writer, lint, onLog }) }`
  with `list()`, `get(id)`, `remove(id)`, and:
  - `async read({ file, name, rights, swap = null })`: throws `'Rebuild is for video you made or have the right to rework. Confirm that (rights: true) to go on.'`
    unless `rights === true`; refuses files over 120 s; copies the file to `rebuild/<id>/source<ext>`; runs
    `reader.read` into `rebuild/<id>/`; saves `{ id, name, createdAt, rightsConfirmedAt, swap, source, music,
    loudness, silences, speechState, shots: [{...reading shot, reading: null, route: null}], status: 'reading', plan:
    null, planApprovedAt: null, framesApprovedAt: null, frames: {}, takes: {}, editId: null }`.
  - `saveReading(id, answers)`: `answers` is `[{ index, kind, why, description, captions, stickers, camera, light }]`;
    each `kind` checked against `KINDS`; stored on the shot; status becomes `planning` when every shot has one.
  - `async readWithWriter(id, { only = null })`: for each shot without a reading (or in `only`), calls the writer with
    the shot sheet and its band frames as images and the JSON schema of one answer. Writer: `writer()` →
    `{ engine, model }`; `claude`/`codex` → `harnessJson`; `local` → Ollama `/api/chat` with `format: schema` and
    `images`, mirroring `Reviewer.local` (same `ensureOllama`, vision check and error words). Saves via `saveReading`.
  - `savePlan(id, plan)`: `validatePlan(rebuild, plan, { lint: this.lint, exists: fs.existsSync })`; stores; clears `planApprovedAt` and
    `framesApprovedAt`; status `planning`. Refuses while status is `rendering`.
  - `approvePlan(id)`: needs a plan; sets `planApprovedAt`, status `approved`.

**Acceptance check:** covered by Task 7's MCP test (read, reading, plan errors, approve) on the generated video.

- [ ] Implement the class part with `readJson`/`write` helpers in the style of `sizzle.js` (`rebuild/<id>/rebuild.json`).
- [ ] Add to `test/rebuild.mjs` a section that constructs `Rebuilds` with a fake `reader` (returns a two-shot
  reading) in a temp folder and asserts: `read` without `rights` throws the exact message; with `rights: true` the
  record has `rightsConfirmedAt`; `saveReading` with `kind: 'ai_video'` on both shots sets status `planning`;
  `approvePlan` before `savePlan` throws `'Write the plan first.'`; `savePlan` then `approvePlan` sets
  `planApprovedAt`; a second `savePlan` clears it.
- [ ] Run `node test/rebuild.mjs`; expect all `ok`.

### Task 5: Frames, shots and takes

**Files:**

- Modify: `src/service/rebuild.js`

**Interfaces:**

- Consumes: `remake.painter()`, `images.create(...)`, `remake.waitPictures(setId)`, `studio.generatePreviews(input)`,
  `studio.getJob(id)`, `studio.finishCandidate({ jobId, candidate, megapixels: 1 })`, `studio.localCopy(file, dir)`,
  `nearestAspect(width, height)` from `editgen.js`.
- Produces:
  - `async makeFrames(id, { only = null })`: needs `planApprovedAt`. For every `h3` shot (or `only`): picks the
    shot's `first` (and `last` when `h3Length(...).useLast`); edits each with one `images.create({ mode: 'edit',
    model, prompt, refs: [frame, swap.picture?], keepAspect: true, aspect: nearestAspect(w,h), megapixels: 1, seed,
    name: 'Rebuild · shot N first|last', tag: 'rebuild:<id>' })`, one seed per shot for both ends. Prompt: text removal
    (`Remove every caption, title, label, sticker and on-screen text. Keep everything else exactly as it is: people,
    objects, framing, light and colours.`) plus, with a swap, `Then: <swap.ask>`. Waits with `waitPictures`, stores
    `frames[index] = { first, last, original: {first,last} }`, clears `framesApprovedAt`. A shot whose reading has no
    captions or stickers and no swap keeps its original frames (no edit).
  - `approveFrames(id)`: needs frames for every `h3` shot; sets `framesApprovedAt`.
  - `async makeShots(id)`: needs `framesApprovedAt`. For every `h3` shot without a take: `generatePreviews({ mode:
    'frames', prompt, character: plan.shots[i].character || 'none', aspect, megapixels: 0.4, seconds, previews:
    swap ? 3 : 2, steps: 8, media, projectName: 'Rebuild · <name> · shot N' })`; stores `takes[index] = { previewJob,
    status }`; status `rendering`.
  - `pick(id, index, candidate)`: records the person's choice.
  - `async refresh(id)`: for each take: preview done and picked → `finishCandidate` once (lock file as in
    `Sizzles.refresh`); finish done → `localCopy` of its final into `rebuild/<id>/takes/`; status `ready` when every
    `h3` shot has a final file.

**Acceptance check:** unit-checked with fakes in `test/rebuild.mjs`; the GPU path is proven in Final verification.

- [ ] Add a fake-services section to `test/rebuild.mjs`: `images.create` returns `{id}`, `waitPictures` returns a copy
  of the input path, `generatePreviews` returns `{id:'p1', status:'queued'}`, `getJob` returns `done` with two
  candidates, `finishCandidate` returns `{id:'f1'}`; assert: `makeShots` before `approveFrames` throws; one edit per
  frame end with the same seed for first and last; a shot with no captions and no swap makes no edit; after `pick`
  and two `refresh` calls the take has a `final` file and status is `ready`.
- [ ] Implement; run `node test/rebuild.mjs`; expect all `ok`.

### Task 6: First cut in Edit

**Files:**

- Modify: `src/service/rebuild.js`

**Interfaces:**

- Consumes: `edits.run`, `edits.create`, `edits.addMedia`, `edits.write`, `applyOps`, `FORMATS`, `retime`,
  `captionsToTitles`, `formatFor`.
- Produces: `async firstCut(id)` → `{ editId, placed, kept, missing, warnings }`. Steps:
  1. Per shot, a segment file in `rebuild/<id>/cut/shot_NNN.mp4` (24 fps, the edit format's size, padded to fit):
     `h3` with a final → `-t trimTo` first when `trimTo`, then `setpts=PTS/speed`, `tpad=stop_mode=clone`, `trim` to
     the slot; `keep` and `replace` without a result → the original stretch (`-ss start -t duration`); `own` → the
     person's file retimed the same way; `still` → the first frame with `zoompan` from 1.00 to 1.03 over the slot.
  2. `rebuild/<id>/cut/guide.wav` from the source's sound.
  3. `edits.create('<name> · rebuild')`, settings `{ format: formatFor(w,h), fps: 24 }`; `addMedia` each segment and
     the guide; `applyOps` with `add_clip` on V1 in order, `update_clip` `mute: true` on each H3 segment,
     `add_clip` of the guide on A1 at 0, and `captionsToTitles(shots)`; `edits.write`.
  4. `warnings` always includes `'A1 is the reference video\'s own sound, as a guide. Replace it before you publish.'`
     and names shots still on their original footage.

**Acceptance check:** in Task 7's MCP test, after a plan where every shot is `keep`, `rebuild_first_cut` returns an
edit whose V1 has one clip per shot ending at the video's duration (±0.05 s), A1 one clip, and T1 the captions.

- [ ] Add a pure check to `test/rebuild.mjs` for the segment filter string builder (export
  `segmentFilter({ trimTo, speed, slot, width, height })`) on `trimTo 2.667, speed 1, slot 2.667` and
  `speed 1.937, slot 2.667`.
- [ ] Implement `segmentFilter` and `firstCut`; run `node test/rebuild.mjs`; expect all `ok`.

### Task 7: MCP tools

**Files:**

- Modify: `src/mcp/server.js`
- Test: `test/mcp-rebuild.mjs`

**Interfaces:**

- Consumes: everything above; `edits`, `reels`, `voices`, `studio`, `images`, `remake` instances already in
  `server.js`; `sizzleTool`-style picture results (a `rebuildPicture(files, opts)` helper copied from
  `sizzlePicture`, or `sizzlePicture` reused directly).
- Produces, after the Sizzle block (`// ---------- Rebuild: a video taken apart and rebuilt ----------`):
  `const reader = new Reader({ ffmpeg: edits.ffmpeg, ffprobe: edits.ffprobe, run: (a) => edits.run(a), runErr: (a) => edits.runErr(a), beatsOf: (f) => reels.beatsOf(f), voices })`
  and `const rebuilds = new Rebuilds({ dataDir: DATA, reader, studio, images, remake, edits, writer: () => writerOf(readSettings(BASE)), lint: lintPrompt })`, then:

  | Tool | Args (zod) | Returns |
  | --- | --- | --- |
  | `rebuild_read` | `file`, `name?`, `rights: z.literal(true)`, `swap?: {ask, picture?}`, `writer: z.boolean().default(false)` | pictures: a sheet of every shot's middle frame (tiled 6 across); JSON: the rebuild and a shot table |
  | `view_rebuild_shot` | `rebuildId`, `index` | pictures: the shot's sheet and its first/last frames; JSON: its reading and measurements |
  | `save_rebuild_reading` | `rebuildId`, `shots: [{index, kind: z.enum(KINDS), why, description, captions?, stickers?, camera?, light?}]` | the rebuild |
  | `save_rebuild_plan` | `rebuildId`, `plan: { swap?, shots: [{index, route: z.enum(ROUTES), prompt?, character?, file?}] }` | the rebuild (and `h3Length` per shot) |
  | `approve_rebuild_plan` | `rebuildId` | the rebuild |
  | `make_rebuild_frames` | `rebuildId`, `only?: number[]` | pictures: before/after pairs; JSON: the rebuild |
  | `approve_rebuild_frames` | `rebuildId` | the rebuild |
  | `make_rebuild_shots` | `rebuildId`, `picks?: {index, candidate}[]` | the rebuild (`picks` recorded first, then previews started) |
  | `rebuild_first_cut` | `rebuildId` | `{ editId, placed, kept, missing, warnings }` |
  | `get_rebuild` | `rebuildId` | the rebuild after `refresh` |
  | `list_rebuilds` / `delete_rebuild` | `{}` / `rebuildId` | list / `true`; delete's description says "Ask the person first." |

  Descriptions name the step number, the gates ("Only call this after the person said yes"), the rights rule and
  "free and local; takes the GPU for a while" where it applies, in the Sizzle tools' voice.

**Acceptance check:** `node test/mcp-rebuild.mjs` passes on the generated three-shot video.

- [ ] Write `test/mcp-rebuild.mjs` (pattern of `test/mcp-tools.mjs`, `IV_STUDIO_DATA` temp folder): build the
  three-shot video as in Task 2; `rebuild_read` without `rights` → error; with `rights: true` → 3 shots and an image
  part; `view_rebuild_shot` index 2 → two image parts; `save_rebuild_reading` all three `code_graphics`; `save_rebuild_plan`
  with an `h3` route and no prompt → error naming shot 1; all `keep` → ok; `make_rebuild_frames` before approval →
  error; `approve_rebuild_plan` → `planApprovedAt` set; `rebuild_first_cut` → V1 with 3 clips ending at 5.5 ± 0.05,
  one A1 clip, `warnings` with the guide-track line; `list_rebuilds` has it.
- [ ] Run `npm.cmd run build` then `node test/mcp-rebuild.mjs`; expect failures for unknown tools before the change.
- [ ] Register the tools; run `npm.cmd run build` and `node test/mcp-rebuild.mjs`; expect all `ok`.
- [ ] Run `node test/mcp-smoke.mjs`; expect the tool count to rise by 11 and `check_setup` to answer.

### Task 8: Agent guide

**Files:**

- Modify: `resources/agent-guide.md`

**Acceptance check:** the guide has a Rebuild section an agent can follow end to end, and `get_guide` returns it
(rebuild and restart the MCP server, then call `get_guide`).

- [ ] Add `## Rebuild: take a video apart and rebuild it` after the Replace section: when to use it (the person's own
  video; for someone else's, describe it instead and don't rebuild), the step list with the tool names, the reading
  JSON with `unsure`, routes and their defaults, the 5.17 s rule and `trimTo`, the frames prompt and why text is
  removed, the two gates (show the plan with GPU minutes; show the before/after frames), picking takes, the first
  cut's tracks and the guide-track warning, and "free and local; never the paid writer".
- [ ] Add to `## House rules`: "Rebuild only video the person made or may rework; the reference's sound is a guide."
- [ ] Run `npm.cmd run build`, start a fresh MCP client and call `get_guide`; expect the new section in the text.

## Final verification

- [ ] `node test/reader.mjs`, `node test/rebuild.mjs`, `node test/mcp-rebuild.mjs`: all `ok`.
- [ ] Regression: `npm.cmd test` (graph parity), `node test/reel.mjs`, `node test/remake.mjs`,
  `node test/sizzle-cut.mjs`, `node test/lint.mjs`, `node test/mcp-smoke.mjs`: as before the change.
- [ ] `npm.cmd run build` succeeds.
- [ ] Live check on this PC, **only with Matthew's OK for the GPU time** (about 5 min): through the MCP tools on
  `C:\Users\Matthew\rea-video\docs\cases\videos\dual_role.mp4` (an AI-made sample, used here only as a test file):
  `rebuild_read` with `rights: true`, the agent's own reading, a plan with shot 9 on `h3` and the rest `keep`,
  approve, frames (text removed, checked by eye), approve, shots, pick, finish, first cut. Expect the Edit to open in
  the app window with shot 9 replaced, captions on T1 and the guide on A1; capture frames at 14.6 s of the export.
- [ ] Record what was not checked: the page (step 2), the local Ollama writer path if no vision model is installed,
  speech with the voice engine if it isn't set up, macOS and Linux.

## Rollback and release boundary

Everything is local in a separate worktree branch. Rolling back is deleting the branch and worktree; the new data
folder `rebuild/` in IV Studio's data can be deleted by hand. No migration, no settings change, no new download.
Committing, merging into the release branch, building an installer and publishing a release are each separate steps
that need Matthew's OK.

## Handoff

Start with Task 1. Tasks 1-3 need nothing but Node and the bundled ffmpeg; Tasks 4-6 are unit-tested with fakes;
Task 7 needs `npm.cmd run build`; the live check needs ComfyUI up and Matthew's OK. Capture for the handoff: test
output, the live check's Edit id and a frame grab, and any step-1 scope cut that turned out to matter.

## Live check, 2026-11-08 (done with Matthew's OK)

Through the MCP tools of this branch's build, on `dual_role.mp4` (rebuild `fcb70aba`, edit `8bb61ca1`):

- `rebuild_read`: 10 shots, shot 9 at 13.458-16.125 s (as rea-video found); the voice engine was set up, so Whisper
  heard every shot's Chinese words correctly. Tempo 106 BPM, -14 LUFS.
- The agent's reading, plan (shot 9 `h3`, the rest `keep`), approval. Shot 9: 124 frames, I2VA, `trimTo` 2.667.
- `make_rebuild_frames`: both captions painted out in 46 s (Flux 3 Klein); face, clothes, mug and room held.
- `make_rebuild_shots`: two previews in about 2 min 45 s; take 1 picked and finished at 1 MP in about 3 min.
- `rebuild_first_cut` and an export (1080x1920, 24 fps, 19.05 s): shot 9 is the new take, clean of burned-in
  text; the kept shots around it unchanged.

Three fixes came out of it, each with a test:

1. Caption bands: a fixed threshold (12) missed a subtitle swapping words mid-shot (scored 6.2 over movement of
   about 2). `bandChanges` now looks for spikes against the local median (`threshold 3`, `ratio 2.5`), and changes
   in a shot's last quarter second (the cut, sampled early) are dropped.
2. Titles only over clean pictures: kept footage already carries its captions, so the first cut titled every one
   twice. Titles now go only over new H3 takes and the person's own clips.
3. Edit export drew Chinese titles as "?" (Barlow is Latin only). `titleFont` in `edits.js` picks a system font for
   CJK or Hangul text (Microsoft YaHei, Malgun Gothic, PingFang, Noto CJK); Latin titles are unchanged.

Not checked: the writer reading shots itself (Ollama, Claude Code or Codex), a swap on a real video, own/still
routes on real footage (covered by the ffmpeg test), macOS and Linux fonts.
