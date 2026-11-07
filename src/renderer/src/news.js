// What's new: the highlights of each version, newest first. After an update the Dashboard shows the current
// version's once, until it's dismissed; Settings → Updates lists the last few versions'.
export const NEWS = [
  {
    version: '1.0.0',
    items: [
      { text: 'IV Studio 1.0. Every page has a How it works button that walks you through its real controls, and a full tour shows the whole app in two minutes (Settings, About takes it again).' },
      { text: 'Check my PC reads your graphics card, memory and drives and sets IV Studio up to suit them, and a guided cloud setup connects RunPod, Modal or Comfy Cloud.' },
      { text: 'Create, Settings, Characters and the Workflows tools are redesigned as clear numbered steps; Sizzle, Reel, Sequences, Shinobi and Replace open on animated stages.' },
      { text: 'Shots, Projects and the Library group your work by day, filter by when, kind, who and shape, and open quickly however much you have.' },
      { text: 'Train a character free on your own graphics card, or on RunPod or Modal, with presets, a spending cap, Train more and likeness scoring. Or make a RefMod character from a few pictures in seconds.' },
      { text: 'Pick the sampler and scheduler for a shot, and keep a resizable live preview of any render over every page.' }
    ]
  },
  {
    version: '0.3.4',
    items: [
      { text: 'Each Workflows tool (Sequences, Sizzle, Reel, Shinobi and Replace) has its own picture on its card, drawn in the style of IV Studio’s page banners.' }
    ]
  },
  {
    version: '0.3.3',
    items: [
      { text: 'Settings → Setup → Updates keeps ComfyUI up to date: Check for updates, then Update everything updates ComfyUI, every custom node pack and ComfyUI-Manager, saving a snapshot first and restarting ComfyUI after. Undo last update puts it all back.' },
      { text: 'On ComfyUI 0.44 or newer, finishes use ComfyUI’s own H3 latent upscaler: the same model and size, faster, without the memory spikes.' }
    ]
  },
  {
    version: '0.3.2',
    items: [
      { text: 'IV Studio runs on a Mac (Apple Silicon and Intel). A Mac has no NVIDIA card for MiniMax H3, so shots render on your RunPod or Modal account, or on Comfy Cloud: the Dashboard points you to the Cloud page.' }
    ]
  },
  {
    version: '0.3.1',
    items: [
      { text: 'Create → Image makes pictures with SDXL (and any SDXL fine-tune) and with MiniMax H3: a still in the look of your shots, starring your H3 characters.' },
      { text: 'Comfy Cloud is a third cloud choice: paste a Comfy API key, and the Cloud page checks what IV Studio can do there.' },
      { text: 'Free in the title bar clears the GPU and RAM now: ComfyUI’s models, the voice engine and the writer’s model.' }
    ]
  },
  {
    version: '0.3.0',
    items: [
      { text: 'Replace runs on Viggle Remake: swap people into any video, or change the scene in plain words (snow, night, something removed). IV Studio paints a frame of each shot for you to check, writes the prompt and keeps the motion and sound.' },
      { text: 'In the editor, right-click a clip → Remake this clip.' }
    ]
  },
  {
    version: '0.2.11',
    items: [
      { text: 'Settings → Setup installs every node pack IV Studio uses into your ComfyUI with one click, at the versions it’s tested with. Restart ComfyUI afterwards.' },
      { text: 'Setup and renders accept other versions of the H3 models, like the ones ComfyUI’s own H3 templates download, so you don’t download them twice.' }
    ]
  },
  {
    version: '0.2.10',
    items: [{ text: 'Use Ollama from another container or PC: Settings → Prompt writer → Ollama address (or OLLAMA_HOST).' }]
  },
  {
    version: '0.2.9',
    items: [{ text: 'Learn opens the IV Studio guide, a step-by-step PDF with every button pointed out. Each page’s ? has it too. Videos are coming soon.' }]
  },
  {
    version: '0.2.8',
    items: [
      { text: 'IV Studio runs on Linux too: an AppImage that updates itself, and it starts your ComfyUI from its .sh script or main.py.' },
      { text: 'On Linux, Settings → Agents gives Claude Code or Codex a command that works from the AppImage.' }
    ]
  },
  {
    version: '0.2.7',
    items: [
      { text: 'References mode keeps the place from your idea from the very first shot: Write it for me no longer opens on the background of your picture.' },
      { text: 'Short films: the people and places in a script you type show up on Cast and places straight away.' },
      { text: 'The Library names every version of a shot apart: each run, each final and each enhanced copy.' },
      { text: 'The writer on this PC no longer stalls on a runaway answer, and the prompt checker raises fewer false alarms.' }
    ]
  },
  {
    version: '0.2.6',
    items: [
      { text: 'References mode makes a new scene: the person from your picture, the place from your idea, instead of the picture’s own background.' },
      { text: 'The Cloud page lists RunPod first.' }
    ]
  },
  {
    version: '0.2.5',
    items: [{ text: 'IV Studio starts your ComfyUI: when it opens, or with Start ComfyUI in the title bar. Pick your ComfyUI folder and start file in Settings.' }]
  },
  {
    version: '0.2.4',
    items: [{ text: 'Render in the cloud on your own RunPod account too: pick a GPU at RunPod’s live price, and it shuts itself off when idle.' }]
  },
  {
    version: '0.2.3',
    items: [
      { text: 'Projects: a short film from an idea in six steps, with a storyboard, an animatic and every shot filmed for you.' },
      { text: 'Made-up people in a film keep one face: drawn, or your own picture (Use a picture). Someone who never speaks, like a dog, can be added too.' },
      { text: 'More angles of a place keep every shot in the same room.' },
      { text: 'One-take shots carry straight on from the shot before.' },
      { text: 'Write it for me can use Claude Code or Codex, follows MiniMax’s own guide, and looks at your references.' },
      { text: 'Stage a shot on a board; arcs film from a previs.' },
      { text: 'Takes are ranked, compared side by side and reviewed with one suggested fix.' },
      { text: 'Finish with DLSS 5 or SeedVR2; live previews while takes render.' },
      { text: 'Cut someone out of a shot, see-through everywhere else.' },
      { text: 'Reframe any shot or picture to 9:16, 1:1 or 16:9 without cropping.' },
      { text: 'Reel: pictures and a song, cut to the beat.' },
      { text: 'Exports come out at the loudness phones expect.' }
    ]
  }
]
// The version whose news hasn't been seen yet, or null.
export function unseenNews(version, seen) {
  const entry = NEWS.find((n) => n.version === version)
  return entry && seen !== version ? entry : null
}
