// A chat with the person's own Claude Code or Codex inside IV Studio (docs/superpowers/specs/2026-11-10-agent-chat-design.md):
// like adding IV Studio to Claude Desktop or Codex as an MCP server, but in the app. Every IV Studio tool, nothing
// else; anything that deletes, costs money, installs or changes Settings waits for the person's Allow (server.js
// askPerson, chatAsk). One headless turn per message, continuing the agent's own session.
import fs from 'node:fs'
import path from 'node:path'
import { AGENT_NAMES, SERVER, claudeArgs, codexChatArgs, killTree, parseLine, spawnAgent, stepLabel } from './agentrun.js'

export const TURN_LIMIT_MS = 45 * 60 * 1000
export const KEEP_CHATS = 20

export const chatPrompt = () => `You are the assistant inside IV Studio, the person's video app, talking with them in a chat panel at the side of the app.

You have IV Studio's tools (the iv-studio MCP server) and nothing else: no files, no shell. Use them the way you would if the person had added IV Studio to their own agent app: look things up, write H3 prompts, render on this PC, sequence shots, edit, make music and voices, and answer questions about their projects and about IV Studio. Call get_guide before the first thing you make in a chat, and check_setup when something might be missing.

Each message starts with a line in [brackets] saying what IV Studio is showing them right now (the page, and the ids of the open shot, film, sequence or edit). "This" and "it" usually mean that. Use the ids with the tools; never show raw ids to the person.

Anything that deletes, costs money, installs or downloads, trains, or changes a setting shows the person an Allow card and waits. If they choose Don't allow, accept it, don't try again unless they ask, and say what you could do instead.

To wait for a render, call get_job: it waits up to 25 seconds each time, so just call it again, without commentary in between. Renders take minutes; once one has started and you've checked it's running, you may tell the person it's on its way instead of waiting for all of it.

Keep replies short and plain, for someone who isn't technical: a few sentences, no tables, no code unless they ask.`

// The bracketed line at the top of each message: what IV Studio is showing. ctx from the app (App.jsx).
const PAGE_NAMES = {
  home: 'the Dashboard',
  create: 'Create',
  shot: 'a shot',
  library: 'Shots',
  media: 'the Library',
  projects: 'Projects (films)',
  project: 'a film project',
  sequences: 'Sequences',
  sequence: 'a sequence',
  edits: 'Edits',
  edit: 'the editor',
  characters: 'Characters',
  character: 'a character training',
  loras: 'LoRAs',
  workflows: 'Workflows',
  sizzle: 'Website films',
  'sizzle-project': 'a website film',
  rebuild: 'Rebuilds',
  'rebuild-project': 'a rebuild',
  audio: 'the Audio front page',
  voices: 'Voices',
  lines: 'Voice lines',
  music: 'Music',
  sounds: 'Sounds',
  cloud: 'Cloud',
  settings: 'Settings'
}
const CONTEXT_IDS = [
  ['projectId', 'shot id'],
  ['productionId', 'film id'],
  ['sequenceId', 'sequence id'],
  ['editId', 'edit id'],
  ['sizzleId', 'website film id'],
  ['rebuildId', 'rebuild id'],
  ['shinobiId', 'Shinobi film id'],
  ['trainingId', 'character training id']
]
export function contextLine(ctx = {}) {
  const parts = [`IV Studio is showing ${PAGE_NAMES[ctx.page] || ctx.page || 'a page'}`]
  if (ctx.section) parts[0] += ` (${ctx.section === 'audio' ? 'audio' : 'visual'} side)`
  for (const [key, label] of CONTEXT_IDS) if (ctx[key]) parts.push(`${label} ${ctx[key]}`)
  return `[${parts.join('; ')}]`
}

// One message's turn. dir: the chat's own folder (kept, so the agent's session can resume from the same place).
// session: the agent's session to continue, or null for the first message. onEvent(e) gets parseLine's events plus
// { type: 'ask', ask } and { type: 'asked', id, allow }. Resolves { ok, error, session, jobs } when the turn ends.
export function startChatTurn({ engine, exe, dir, session = null, message, context = null, mcp, model = '', extraEnv = {}, onEvent = () => {}, limitMs = TURN_LIMIT_MS, pollMs = 400 }) {
  if (!AGENT_NAMES[engine]) throw new Error(`Unknown agent "${engine}".`)
  const work = path.join(dir, 'work')
  const askDir = path.join(dir, 'asks')
  const jobsFile = path.join(dir, 'jobs.txt')
  for (const d of [work, askDir]) fs.mkdirSync(d, { recursive: true })
  for (const f of fs.readdirSync(askDir)) fs.rmSync(path.join(askDir, f), { force: true })
  fs.writeFileSync(jobsFile, '')
  const env = { ...mcp.env, ...extraEnv, IV_STUDIO_AGENT_RUN: 'chat', IV_STUDIO_AGENT_JOBS: jobsFile, IV_STUDIO_AGENT_ASK: askDir }
  const server = { command: mcp.command, args: mcp.args, env }
  const text = `${context ? `${contextLine(context)}\n` : ''}${message}`
  let args
  let input
  if (engine === 'claude') {
    const mcpConfigFile = path.join(dir, 'mcp.json')
    const promptFile = path.join(dir, 'prompt.txt')
    fs.writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: { [SERVER]: { type: 'stdio', ...server } } }))
    fs.writeFileSync(promptFile, chatPrompt())
    args = claudeArgs({ mcpConfigFile, promptFile, model, persist: true, resume: session })
    input = text
  } else {
    args = codexChatArgs({ mcp: server, model, resume: session })
    // Codex has no system prompt of its own here: the first message carries it, and the session keeps it
    input = session ? text : `${chatPrompt()}\n\n---\n\n${text}`
  }

  const jobs = () => {
    try {
      return [...new Set(fs.readFileSync(jobsFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean))]
    } catch {
      return []
    }
  }
  let newSession = session
  let ended = false
  let endEvent = null
  let stopped = false
  const seen = new Set()
  let resolveTurn
  const promise = new Promise((r) => (resolveTurn = r))
  const emit = (e) => {
    try {
      onEvent(e)
    } catch {
      /* a listener's problem isn't the turn's */
    }
  }

  // the agent's MCP server asks by writing a file; the card shows it until the person answers
  const pollAsks = () => {
    let names = []
    try {
      names = fs.readdirSync(askDir).filter((n) => n.endsWith('.ask.json'))
    } catch {
      return
    }
    for (const n of names) {
      const id = n.slice(0, -'.ask.json'.length)
      if (seen.has(id)) continue
      try {
        const ask = JSON.parse(fs.readFileSync(path.join(askDir, n), 'utf8'))
        seen.add(id)
        emit({ type: 'ask', ask: { ...ask, label: stepLabel(ask.tool) } })
      } catch {
        /* still being written */
      }
    }
  }
  const poller = setInterval(pollAsks, pollMs)

  const child = spawnAgent(exe, args, { cwd: work, env: { ...process.env, NO_COLOR: '1', MCP_TOOL_TIMEOUT: String(15 * 60 * 1000) } })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
  let buf = ''
  let err = ''
  child.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      for (const e of parseLine(engine, line)) {
        if (e.type === 'session') newSession = e.id
        if (e.type === 'end') endEvent = e
        emit(e)
      }
    }
  })
  child.stderr.on('data', (d) => (err = (err + d).slice(-2000)))
  const finish = (ok, error) => {
    if (ended) return
    ended = true
    clearInterval(poller)
    clearTimeout(timer)
    // an unanswered card is moot once the turn is over
    for (const id of seen) emit({ type: 'asked', id, allow: null, moot: true })
    resolveTurn({ ok, error, session: newSession, jobs: jobs() })
  }
  const timer = setTimeout(() => {
    killTree(child)
    finish(false, `${AGENT_NAMES[engine]} worked for ${Math.round(limitMs / 60000)} minutes, the limit for one message, and was stopped.`)
  }, limitMs)
  child.on('error', (e) => finish(false, `${AGENT_NAMES[engine]} couldn't start: ${e.message}`))
  child.on('close', (code) => {
    if (stopped) return finish(false, 'Stopped.')
    if (endEvent) return finish(endEvent.ok, endEvent.ok ? null : endEvent.text || `${AGENT_NAMES[engine]} stopped with a problem.`)
    finish(code === 0, code === 0 ? null : err.trim().split('\n').filter(Boolean).pop() || `${AGENT_NAMES[engine]} stopped (code ${code}).`)
  })

  return {
    promise,
    jobs,
    // the person's click on a card: the server waiting on this answer goes ahead, or tells the agent no
    answer(id, allow) {
      if (ended || !seen.has(id)) return false
      const file = path.join(askDir, `${id}.answer.json`)
      fs.writeFileSync(`${file}.tmp`, JSON.stringify({ allow: !!allow }))
      fs.renameSync(`${file}.tmp`, file)
      emit({ type: 'asked', id, allow: !!allow })
      return true
    },
    stop() {
      if (ended) return
      stopped = true
      killTree(child)
    }
  }
}

// A chat as the app keeps it (chat.json in the chat's folder): who, the agent's session, and what was said and done.
//   entries: { kind: 'you', text } | { kind: 'agent', text } | { kind: 'step', tool, label, error, count }
//            | { kind: 'ask', id, tool, label, why, args, answer: 'allow' | 'deny' | 'moot' | null }
//            | { kind: 'problem', text }
export function newChat({ id, engine }) {
  return { id, engine, name: AGENT_NAMES[engine], session: null, title: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), entries: [], jobs: [] }
}

// A turn's event into the chat's entries (the folding the Dashboard panel does, kept as a conversation).
export function applyChatEvent(chat, e) {
  const last = chat.entries[chat.entries.length - 1]
  if (e.type === 'say') {
    // Claude Code repeats its last words in the final result: don't show them twice
    if (!(last?.kind === 'agent' && last.text === e.text)) chat.entries.push({ kind: 'agent', text: e.text })
  } else if (e.type === 'end') {
    if (!e.ok && e.text) chat.entries.push({ kind: 'problem', text: e.text.slice(0, 600) })
    else if (e.text && !chat.entries.some((x, i) => x.kind === 'agent' && x.text === e.text && i >= chat.entries.length - 6)) chat.entries.push({ kind: 'agent', text: e.text })
  } else if (e.type === 'step') {
    if (last?.kind === 'step' && last.tool === e.tool && e.tool === 'get_job') last.count = (last.count || 1) + 1
    else chat.entries.push({ kind: 'step', tool: e.tool, label: e.label, id: e.id, error: null })
  } else if (e.type === 'stepError') {
    const s = [...chat.entries].reverse().find((x) => x.kind === 'step' && (x.id === e.id || !e.id))
    if (s) s.error = (e.text || 'Refused').slice(0, 300)
  } else if (e.type === 'ask') {
    chat.entries.push({ kind: 'ask', id: e.ask.id, tool: e.ask.tool, label: e.ask.label, why: e.ask.why, args: e.ask.args || {}, answer: null })
  } else if (e.type === 'asked') {
    const a = chat.entries.find((x) => x.kind === 'ask' && x.id === e.id)
    if (a && !a.answer) a.answer = e.moot ? 'moot' : e.allow ? 'allow' : 'deny'
  } else if (e.type === 'session') chat.session = e.id
  chat.updatedAt = new Date().toISOString()
  return chat
}

// Saved chats: one folder each under root (the data folder's chats), newest first, the oldest beyond KEEP_CHATS removed.
export function saveChat(root, chat) {
  const dir = path.join(root, chat.id)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'chat.json')
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(chat, null, 1))
  fs.renameSync(`${file}.tmp`, file)
}
export function loadChat(root, id) {
  if (!/^[a-z0-9-]+$/i.test(id)) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(root, id, 'chat.json'), 'utf8'))
  } catch {
    return null
  }
}
export function listChats(root) {
  let ids = []
  try {
    ids = fs.readdirSync(root)
  } catch {
    return []
  }
  return ids
    .map((id) => loadChat(root, id))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(({ id, engine, name, title, updatedAt }) => ({ id, engine, name, title, updatedAt }))
}
export function pruneChats(root, keep = KEEP_CHATS) {
  for (const c of listChats(root).slice(keep)) fs.rmSync(path.join(root, c.id), { recursive: true, force: true, maxRetries: 3 })
}
