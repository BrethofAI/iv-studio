// How each Learn item works, until the tutorial videos are shot: a few plain steps, and a real screenshot with
// numbered highlights. Step N matches mark N on the picture. The pictures and mark positions come from
// docs/learn/capture-how.mjs (assets/learn-shots/<id>.webp and learnShots.json); an item without a picture shows
// its steps alone. Keyed by the card ids in learn.js.
import SHOTS from './learnShots.json'

const PICS = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/learn-shots/*.webp', { eager: true, import: 'default' })).map(([file, url]) => [file.split('/').pop().replace('.webp', ''), url])
)

export const HOW = {
  text: {
    intro: 'Describe a shot in words and H3 films it, sound and all.',
    steps: [
      'In Create, keep Video and pick Text.',
      'Pick a character, or None. Write {char} in the prompt where they go.',
      'Describe the shot: the place, clothes, camera, action and any line they say. Leave out the face and voice; the character brings those. Insert template gives you H3’s layout, the checker under the prompt flags anything H3 won’t read, and @ adds your cast and places.',
      'Choose the shape, length and how many previews to hunt.',
      'Press Hunt. Quick previews come back in a minute or two each. Pick the best one on its shot page and finish it.'
    ]
  },
  frames: {
    intro: 'Give H3 the first picture, and the last one if you like; it fills in the motion between.',
    steps: [
      'Pick First / last frame.',
      'Add the first picture, and a second one if the clip should end on an exact frame. Press + Picture or drop them on the box.',
      'Pick the aspect that matches your pictures.',
      'Say what happens between them, or press Write my prompt: the writer looks at the pictures and describes what it sees.',
      'Press Hunt.'
    ]
  },
  reference: {
    intro: 'Show H3 the people, places and sounds to use, and it makes a new shot with them.',
    steps: [
      'Pick References.',
      'Add pictures, videos or sounds. Each one gets a name: <Picture 1>, <Video 1>, <Audio 1>.',
      'Use those names in the prompt, e.g. “the woman from <Picture 1> waits at a bus stop”. A person’s picture gives the person; the place comes from your words, or from a place picture if you add one. Type @ to bring in a saved character or place instead of a file.',
      'Press Hunt.'
    ]
  },
  continue: {
    intro: 'Carry a clip you already have on from its last frames.',
    steps: [
      'Pick Continue a video.',
      'Add the clip to carry on. IV Studio continues from its last frames.',
      'Say what happens next.',
      'Press Hunt. It makes one preview, finished at the clip’s own size. In the editor, right-click a clip and choose Extend to do the same on the timeline.'
    ]
  },
  writer: {
    intro: 'Type a rough idea; the writer turns it into a full H3 prompt.',
    steps: [
      'Type your idea in plain words. Add any references or frames first, and the writer looks at them too.',
      'Press Write my prompt.',
      'The full prompt lands here. Read it and change anything you like. The checker under it points out problems, and Fix mends most of them in one click.',
      'This shows which writer runs: the local model, Claude Code or Codex. Change it in Settings → Prompt writer.'
    ]
  },
  board: {
    intro: 'Place people and the camera on a floor plan, and the writer gets exact staging.',
    steps: [
      'Under Write it for me, press Stage it on a board. Drag the people and the camera on the floor plan.',
      'For each person, choose who they look at and whether they walk. Add up to four with + Put someone on the board.',
      'Pick the lens, the camera height and the camera move.',
      'These words are what the writer gets: who is on which side of the frame, who faces whom, how the camera moves. Then press Write my prompt.',
      'For an arc round people, Make a previs clip adds a grey moving reference that H3 follows. Pushes, tracks and walks work from the words alone.'
    ]
  },
  voice: {
    intro: 'Have your character say a line in their own voice, and the shot lip-syncs to it.',
    steps: [
      'Pick a character that has a voice. Give them one on the Characters page.',
      'Type the line they say.',
      'Press Speak it. The line is said in their voice and its words go into the prompt.',
      'Or add your own recording to lip-sync instead. Then press Hunt.'
    ]
  },
  best: {
    intro: 'Each run gives a few takes; IV Studio helps you choose.',
    steps: [
      'Open a shot from Shots. Each run shows its takes side by side; play them.',
      'Rank these takes scores each one on the words heard, likeness to your character, freezes and sharpness, and marks the best when one clearly leads.',
      'Compare: mark two takes and watch them side by side or as a wipe, in step.',
      'Review: your writer watches a take and says what works, what doesn’t, and one fix to try.',
      'Pick the take you want to finish.'
    ]
  },
  finish: {
    intro: 'Turn the preview you picked into the full-quality shot.',
    steps: [
      'On the shot page, Pick a take.',
      'Choose the final size. 2 MP is the sharpest.',
      'Choose the enhancer. DLSS 5 is quick and can upscale 2× and add frames; SeedVR2 adds the most detail and takes longer.',
      'Choose the frame rate and the sound: H3’s generated sound, or the preview’s.',
      'Press Finish. The final shows on the shot page and in the Library.'
    ]
  },

  // ---- Make a picture
  image: {
    intro: 'Make still pictures from words, with any of the picture models on your PC.',
    steps: [
      'In Create, switch to Image and pick Generate.',
      'Pick a model family. Each one says what it’s good at and its licence. SDXL takes your own checkpoints, and MiniMax H3 (a still) takes your H3 character LoRAs.',
      'Add LoRAs for a style or a character, if you like.',
      'Describe the picture: the subject, the place, the light and the style.',
      'Pick the shape, the size and how many to make.',
      'Press Make. The pictures appear in Your pictures below. Open one to use it as a shot’s first frame, edit it, or make more like it.'
    ]
  },
  'image-edit': {
    intro: 'Change a picture by saying what should be different.',
    steps: [
      'In Create, switch to Image and pick Edit.',
      'Pick a model that can edit. The ones that can’t are greyed out.',
      'Add the picture to change. Add more pictures to bring things in from them, e.g. “put the jacket from picture 2 on her”.',
      'Say what to change, and what to keep.',
      'Press Edit. The result lands in Your pictures, beside the original.'
    ]
  },

  // ---- Make a film
  film: {
    intro: 'Turn an idea into a finished short film, one step at a time. Every step can be changed later.',
    steps: [
      'Idea: say what the film is about, where people will watch it, and how long it should be.',
      'Story: Write it for me drafts a script from your idea, or type your own, or bring in a script file.',
      'Cast and places: who’s in it and where it happens.',
      'Storyboard: every shot is planned and sketched. Click a panel to change what happens, the camera or the line.',
      'Film it: each shot is filmed from its sketch. Pick the take you like for each one.',
      'Watch: the takes play in order. Save the film as a video, or fine-tune it in the editor.'
    ]
  },
  faces: {
    intro: 'Everyone in your film keeps the same face from shot to shot.',
    steps: [
      'For each part, choose who plays them: one of your characters, or “Made up for this film”.',
      'For a made-up person, describe them: age, hair and clothes.',
      'Draw a new face: IV Studio draws one, and every sketch and shot uses it, so they look the same throughout.',
      'Or Use a picture: your own art, or a photo of someone who agreed.',
      'Add more of your characters, or someone who doesn’t speak, like a dog.'
    ]
  },
  rooms: {
    intro: 'Each place in your film looks the same in every shot.',
    steps: [
      'Every place gets a photo. Add your own, or one is drawn the first time the storyboard is sketched. Every shot there uses it, so the set stays the same.',
      'Describe the place: the light, the ground, and what’s in it.',
      'Remove photo to draw a new one or add your own.',
      'More angles draws the same place turned a little, from the side and wider, for shots that look another way.'
    ]
  },
  animatic: {
    intro: 'See the whole film as moving sketches before you spend any time filming.',
    steps: [
      'On the Storyboard step, press Play the animatic.',
      'Each sketch plays for its shot’s length with a slow push-in.',
      'The spoken lines play over them (in each character’s voice when they have one), with the words on screen.',
      'Change a panel or Plan it all again, then play it again. It takes seconds, not GPU minutes.'
    ]
  },
  onetake: {
    intro: 'Make two shots play as one, with no cut between them.',
    steps: [
      'On the storyboard, click the shot that should carry on from the one before it, to open it.',
      'Tick Carry straight on from the shot before.',
      'Film the shot before it first and pick its take. This one carries on from that take’s last seconds, in a single take, and the cut plays them as one.'
    ]
  },
  sequence: {
    intro: 'Several shots that play as one continuous video.',
    steps: [
      'In Workflows, open Sequences and press New sequence. All sequences takes you back to the list.',
      'Write each shot: what happens in it, and its length (10 or 15 seconds).',
      'Add as many shots as the scene needs.',
      'Render it as one seamless take, or shot by shot. Redo any stretch with Retake, then render out the final.'
    ]
  },

  // ---- Edit
  editor: {
    intro: 'A full timeline editor for your shots, songs, lines and pictures.',
    steps: [
      'Project: everything in this edit. + Files adds your own, and the Library tab has everything you’ve made.',
      'Source: play a clip, mark In (I) and Out (O), then press , to insert it or . to overwrite on the target track.',
      'Program: the edit as it plays. Space plays and pauses, and J K L shuttle.',
      'Tools: select (V), razor (C), ripple (B), roll (N), split, markers (M), undo and redo.',
      'Timeline: drag clips to move and trim them. Add as many video and audio tracks as you need.',
      'Export MP4: 1080p, 4K, vertical or square, at the loudness you pick.'
    ]
  },
  extend: {
    intro: 'Make a clip longer with new footage that carries straight on from it.',
    steps: [
      'Right-click a clip on the timeline.',
      'Choose Extend…, pick 5, 10 or 15 seconds and say what happens next. Write it for me looks at the clip’s end for you.',
      'A striped placeholder shows the progress. The new footage lands right after the clip, and the rest moves along.'
    ]
  },
  fill: {
    intro: 'Join two clips with a new shot that starts where one ends and ends where the next begins.',
    steps: [
      'Leave a gap between two clips, then right-click the empty space in it.',
      'Choose Fill this gap…. IV Studio makes three takes that start on the last frame before the gap and end on the first frame after it; pick one. Clips that touch get Bridge to the next clip instead.'
    ]
  },
  retake: {
    intro: 'Redo one moment of a clip and keep the rest.',
    steps: [
      'Right-click the clip with the moment you want to redo.',
      'Choose Retake this stretch…, set the stretch, choose whether to redo the picture, the sound or both, and say what should happen instead. H3 redoes just that stretch, with matching joins.'
    ]
  },
  cutout: {
    intro: 'Keep only the person or thing you name; everything else turns see-through.',
    steps: [
      'Right-click a clip on the timeline.',
      'Choose Cut out… and name what to keep in a few plain words, like “the farmer” or “the dog”. IV Studio finds it in every frame and puts the cut-out on the track above, ready to go over any background.'
    ]
  },
  reframe: {
    intro: 'Turn a widescreen shot into vertical or square without cropping anything off.',
    steps: [
      'Set the edit’s shape: click empty timeline, then pick Vertical or Square under Format.',
      'Right-click a clip that doesn’t fit the new shape.',
      'Choose Reframe to…. The shot stays as it is in the middle, and what lies beyond its edges is drawn to fill the frame. Undo puts the original back.'
    ]
  },
  loudness: {
    intro: 'Exports come out at the loudness phones and social apps expect.',
    steps: [
      'Click empty timeline to show the edit’s settings, and pick the loudness: Online (about -14 LUFS, for phones and social apps), TV (-23), or As mixed.',
      'Export MP4. IV Studio measures the sound and evens it out under a safe peak, so nothing distorts.'
    ]
  },

  // ---- Characters and sound
  character: {
    intro: 'A character is a person H3 plays the same way in every shot.',
    steps: [
      'Your characters: click one to set its trigger word, strength, LoRA and voice. New shot starts a shot with them.',
      'Add from a LoRA: use a character LoRA you already have in ComfyUI.',
      'Train your own: name and describe an invented person and press Start designing. IV Studio designs their face, makes talking clips, and trains their LoRA on your Modal account. It shows the time and cost before it starts.'
    ]
  },
  'voice-design': {
    intro: 'Make a brand-new voice from a description. Voices need a one-time setup on this PC (about 12 GB).',
    steps: [
      'Describe the voice: age, accent, tone, how they speak, and the room they’re in.',
      'Add what they say in the takes, if you like.',
      'Press Make three takes (about 25 seconds each) and keep the one that fits.',
      'It joins Your voices. Give it to a character here, and their shots speak in it.'
    ]
  },
  'voice-clone': {
    intro: 'Save a voice from a recording. Only your own voice, an invented one, or someone who agreed.',
    steps: [
      'Press + Recording and pick 10 to 20 clean seconds of one person talking, with no music. Click the recording to choose which part to keep.',
      'It joins Your voices. Choose a character for it here, and their shots speak in it.'
    ]
  },
  lines: {
    intro: 'Have any voice say any line, for a shot, a voice-over or an edit.',
    steps: [
      'Pick a voice.',
      'Type the line.',
      'Change the seed for a different read of the same words.',
      'Press Speak.',
      'Every line is kept below. Play it, or press Use in a shot to make it a shot’s voice line.'
    ]
  },
  song: {
    intro: 'Make a song or a score on this PC, sung or instrumental.',
    steps: [
      'Pick the engine. MiniMax Music 3 sings words the most clearly and takes a few minutes; ACE-Step is quick for backgrounds.',
      'Describe the style: the genre, instruments, voice, tempo, and how the song builds.',
      'Write the lyrics and mark the parts ([Verse], [Chorus]…), or tick Instrumental.',
      'Pick a length. With MiniMax the lyrics set the length, so write full verses for a full song.',
      'Press Make it.',
      'Songs are kept below. Play one, use it in a shot to have a character sing it, or add it to an edit.'
    ]
  },

  // ---- Take it further
  reel: {
    intro: 'Pictures cut to the beat of a song, with a slow move on each one.',
    steps: [
      'Add pictures (or clips) in the order they should play.',
      'Pick a song: one you made, or a sound file from this PC.',
      'Pick the pace: Calm, Normal or Fast (about 3, 2 or 1 second a picture).',
      'Pick the shape.',
      'Make the reel. IV Studio finds the beat, cuts on it, and puts the reel in Edit as an ordinary edit you can change.'
    ]
  },
  sizzle: {
    intro: 'Turn a website into a promo film.',
    steps: [
      'Put in the site’s address.',
      'Pick the shape.',
      'Press Capture the site. IV Studio saves every screen, the phone layout, the logo, the colours and the words.',
      'Your agent writes a storyboard from it (connect one in Settings → Agents), and you approve it.',
      'The shots, pictures, music and voice-over are made on this PC, and IV Studio cuts the film to the music’s beat.'
    ]
  },
  shinobi: {
    intro: 'Hand your footage to an agent, and get a finished edit back.',
    steps: [
      'Press Set up Shinobi once. It’s a small download into IV Studio’s own folder.',
      'Start a project: write a brief and add your footage and music.',
      'Pick a style for the first cut, then hand it to your agent to refine.',
      'Renders go to Edit for any final touches.'
    ]
  },
  replace: {
    intro: 'Put your character into any video, or change the scene around them. The camera, cuts, motion and sound stay.',
    steps: [
      'Pick Swap people, Change the scene, or Finish.',
      'Add the video.',
      'Pick who goes in: one of your characters or a picture, for one or two people. For Change the scene, say what changes instead, like snow, night, or the turbines gone.',
      'Press Paint the frames. IV Studio paints one frame of each shot the way it should look. Check them: paint one again, use your own picture, or leave one out.',
      'Render. Viggle Remake redraws the whole video to match those frames.'
    ]
  },
  loras: {
    intro: 'Find style, motion and camera LoRAs for H3, and use them in your shots.',
    steps: [
      'Discover browses Civitai’s MiniMax H3 LoRAs. Their clips play when you hover.',
      'Filter by kind: style, motion, camera and more.',
      'Open a card for its previews, trigger words and licence, then Download it. Downloads need your Civitai key in Settings → Civitai.',
      'Yours shows every LoRA in your ComfyUI. Add one to a shot with + Add LoRA in Create.'
    ]
  },

  // ---- Get around
  library: {
    intro: 'Every shot, picture, song and line you’ve made, in one place.',
    steps: [
      'Filter by kind: videos, pictures, music or voice lines.',
      'Search by name.',
      'Each tile is one shot or song with all its versions. Click it to open the viewer and step through them.',
      'The badge shows how many versions it has. From the viewer: Use in a shot, Add to edit, open the shot, or show the file.'
    ]
  },
  incognito: {
    intro: 'Keep private work apart from everything else.',
    steps: [
      'Click Incognito in the title bar. IV Studio restarts into a private space, and the eye closes.',
      'Its renders save to their own ComfyUI folder, set here under Folders.',
      'Everything you make there stays there: shots, songs, voices and edits. Normal work doesn’t show inside it, and its work doesn’t show outside.',
      'Click Incognito again to leave; IV Studio clears its prompts from ComfyUI’s history. It keeps work apart, but it isn’t encryption.'
    ]
  },
  startcomfy: {
    intro: 'IV Studio can start ComfyUI for you, and install what it needs.',
    steps: [
      'The address of the ComfyUI IV Studio renders on. This PC’s is filled in for you.',
      'Choose your ComfyUI folder…',
      '…or the exact shortcut or .bat file you start it with.',
      'Tick Start ComfyUI when IV Studio opens. While ComfyUI is down, a Start ComfyUI button also shows in the title bar.',
      'Setup checks the models and node packs, and installs anything missing.'
    ]
  },
  cloud: {
    intro: 'No strong graphics card? Render on a cloud GPU instead.',
    steps: [
      'Render on This PC or The cloud. Switch whenever you like.',
      'Pick the cloud service: RunPod or Modal on your own account (billed by the second while the GPU is up), or Comfy Cloud (billed per run).',
      'Set it up once with the steps below. IV Studio installs what it needs and signs you in.',
      'While you’re on the cloud, the title bar shows the GPU time and cost. Shut down GPU stops it at once, and it also stops by itself when idle.'
    ]
  },
  agents: {
    intro: 'Claude Code, Codex or any MCP agent can drive IV Studio for you.',
    steps: [
      'Copy the message and paste it into your agent. It explains what IV Studio can do.',
      'Pick your agent: Claude Code, Codex, or another MCP agent.',
      'Copy the command and run it once. The agent then has all of IV Studio’s tools.',
      'Add the skill to Claude Code for IV Studio’s guide.',
      'Then just ask, e.g. “make a 5 second shot of Tess in the rain”. The agent’s work shows in the app as it happens.'
    ]
  }
}

// An item's explanation with its picture and marks, or null when it has none yet.
export function howFor(id) {
  const h = HOW[id]
  if (!h) return null
  const shot = SHOTS[id]
  return { ...h, pic: PICS[id] || null, w: shot?.w, h: shot?.h, marks: (PICS[id] && shot?.marks) || [] }
}
