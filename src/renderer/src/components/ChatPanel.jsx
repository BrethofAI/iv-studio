import { useEffect, useRef, useState } from 'react'
import { AgentRows, useAgentSetup } from './AgentSetup'

// The chat with the person's own Claude Code or Codex (src/service/agentchat.js): a panel down the right side, over
// whatever page is open. Every IV Studio tool; anything that deletes, costs money, installs or changes Settings shows
// an Allow card first.
const NAMES = { claude: 'Claude Code', codex: 'Codex' }
const RENDER = { queued: 'waiting', running: 'rendering', success: 'done', error: 'failed', cancelled: 'cancelled', unknown: '' }
const KIND = { previews: 'Previews', finish: 'Finish', enhance: 'Enhance' }
const IDEAS = ['What can you do in IV Studio?', 'Make a 5 second shot of a fox crossing a frozen lake at dawn', 'Which of my shots aren’t finished yet?']
// what to suggest on a page that's about one thing
const PAGE_IDEAS = {
  edit: ['Tighten the middle', 'Add a calm song under it', 'Put captions on'],
  projects: ['Let’s make a short film together, one step at a time', 'Which of my films aren’t finished?', 'What can you do in IV Studio?'],
  project: ['Take this film to a rough cut, one step at a time', 'Write the script for this film', 'What’s left to do on this film?'],
  home: ['Make 10 variations of my last idea overnight, three takes each', 'What can you do in IV Studio?', 'Which of my shots aren’t finished yet?']
}
export const ideasFor = (page) => PAGE_IDEAS[page] || IDEAS

// Anywhere in the app can hand the chat a question (App.jsx listens for iv:ask and opens the panel): about is what
// it's about (a run, a failed render, a picture), shown above the message box and sent with the message; send: send
// it at once (a button that says what it asks, like "Ask Claude Code to fix it"), or leave it typed for the person.
export const askAgent = ({ text = '', about = null, send = false } = {}) => window.dispatchEvent(new CustomEvent('iv:ask', { detail: { text, about, send } }))

// The agent a button can name ("Ask Claude Code ..."), or null when neither is installed (the button then doesn't
// show). One look per window, shared by every button on the page.
let agentLook = null
export function useAgentName() {
  const [name, setName] = useState(null)
  useEffect(() => {
    let live = true
    if (!agentLook) agentLook = window.ivstudio.chat.status().then((s) => NAMES[s.chat?.engine || s.preferred] || null, () => null)
    agentLook.then((n) => live && setName(n))
    // look again after a while: one may have been installed since
    const t = setTimeout(() => (agentLook = null), 15000)
    return () => ((live = false), clearTimeout(t))
  }, [])
  return name
}

export function useChat() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    let live = true
    const load = () => window.ivstudio.chat.status().then((s) => live && setStatus(s), () => {})
    load()
    const off = window.ivstudio.chat.onChange((chat) => live && setStatus((s) => (s ? { ...s, chat } : s)))
    return () => ((live = false), off())
  }, [])
  const reload = () => window.ivstudio.chat.status().then(setStatus, () => {})
  return [status, reload]
}

export function ChatButton({ open, busy, onClick }) {
  return (
    <button className={`chat-open mono ${open ? 'on' : ''}`} onClick={onClick} aria-expanded={open} title={open ? 'Close the chat' : 'Chat with your Claude Code or Codex'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4z" />
      </svg>
      <span className="chat-open-label">Chat</span>
      {busy && <span className="chat-open-dot" aria-label="working" />}
    </button>
  )
}

// a dropped or picked file, by its kind (agentchat.js attachmentOf decides for the agent; this is for the chips)
const FILE_KIND = [
  ['picture', /\.(png|jpe?g|webp|bmp|gif)$/i, '▣'],
  ['video', /\.(mp4|mov|webm|mkv|avi|m4v)$/i, '▶'],
  ['sound', /\.(wav|mp3|flac|m4a|ogg|aac)$/i, '♪'],
  ['text', /\.(txt|md|fountain|srt|vtt|json|csv)$/i, '¶']
]
const fileOf = (p) => {
  const k = FILE_KIND.find(([, re]) => re.test(p))
  return k ? { path: p, name: p.split(/[\\/]/).pop(), kind: k[0], icon: k[2] } : null
}
const FileChip = ({ f, onRemove }) => (
  <span className={`chat-file ${f.kind}`} title={f.path}>
    <span aria-hidden="true">{f.icon || FILE_KIND.find(([k]) => k === f.kind)?.[2]}</span>
    <span className="chat-file-name">{f.name}</span>
    {onRemove && (
      <button className="lora-chip-x" aria-label={`Take ${f.name} off`} onClick={onRemove}>
        ×
      </button>
    )}
  </span>
)

function Entry({ e, onAnswer, onUndo, onOpenShot }) {
  if (e.kind === 'you')
    return (
      <div className="chat-you">
        {e.files?.length > 0 && (
          <div className="chat-files">
            {e.files.map((f) => (
              <FileChip key={f.path} f={f} />
            ))}
          </div>
        )}
        {e.text}
      </div>
    )
  if (e.kind === 'agent') return <div className="chat-agent">{e.text}</div>
  if (e.kind === 'problem') return <div className="chat-problem small" role="alert">{e.text}</div>
  // an overnight batch's morning report (batches.js): what rendered, and the best takes to open
  if (e.kind === 'report')
    return (
      <div className="chat-report" role="group" aria-label={`Overnight batch ${e.title}`}>
        <div className="chat-report-title mono small">Overnight batch · {e.title}</div>
        <p className="small">{e.text}</p>
        {e.picks?.length > 0 && (
          <div className="chat-report-picks">
            {e.picks.map((p) => (
              <button key={`${p.jobId}-${p.candidate}`} className="btn btn-small" disabled={!p.projectId} onClick={() => onOpenShot?.(p.projectId)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        <Dailies entry={e} />
      </div>
    )
  // an edit the agent changed: put it back as it was
  if (e.kind === 'undo')
    return (
      <div className="chat-undo mono small">
        <span>Changed “{e.name}”</span>
        {e.done ? (
          <span className="dim">· undone</span>
        ) : (
          <button className="link-btn mono small" onClick={() => onUndo?.(e.id)}>
            Undo this change
          </button>
        )}
      </div>
    )
  // a paid step that started (spending.js): under the limit, or Allowed on its card
  if (e.kind === 'spent')
    return (
      <div className="chat-spent mono small">
        Spent {Number(e.credits).toLocaleString('en-US')} credits (${Number(e.usd).toFixed(2)}){e.auto ? ', under your limit' : ', Allowed'}
        {e.today && <span className="dim"> · {e.today}</span>}
      </div>
    )
  if (e.kind === 'step')
    return (
      <div className={`chat-step mono small ${e.error ? 'err' : ''}`} title={e.error || undefined}>
        <span aria-hidden="true">{e.error ? '!' : '✓'}</span> {e.label}
        {e.count > 1 && <span className="dim"> ×{e.count}</span>}
        {e.error && <span className="chat-step-why">{e.error}</span>}
      </div>
    )
  if (e.kind === 'ask') {
    const args = Object.entries(e.args || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    return (
      <div className={`chat-ask ${e.answer ? 'answered' : ''}`} role={e.answer ? undefined : 'group'} aria-label={`Allow ${e.label}?`}>
        <div className="chat-ask-title">Allow “{e.label}”?</div>
        <p className="small">{e.why}</p>
        {args.length > 0 && (
          <dl className="chat-ask-args mono small">
            {args.slice(0, 6).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {e.answer ? (
          <p className="mono small chat-ask-answer">{e.answer === 'allow' ? 'Allowed' : e.answer === 'deny' ? 'Not allowed' : 'Not answered'}</p>
        ) : (
          <div className="chat-ask-btns">
            <button className="btn btn-small btn-primary" onClick={() => onAnswer(e.id, true)}>
              Allow
            </button>
            <button className="btn btn-small" onClick={() => onAnswer(e.id, false)}>
              Don’t allow
            </button>
          </div>
        )}
      </div>
    )
  }
  return null
}

export default function ChatPanel({ status, reload, onClose, context, go, notify, ask, clearAsk, openShot }) {
  const setup = useAgentSetup()
  const [text, setText] = useState('')
  const [about, setAbout] = useState(null)
  const [files, setFiles] = useState([])
  const [dropping, setDropping] = useState(false)
  const [engine, setEngine] = useState(null)
  // files dropped on the panel or picked with the paperclip: up to 10, of the kinds the agent can use
  const addFiles = (paths) => {
    const add = (paths || []).map(fileOf)
    const skipped = add.filter((f) => !f).length
    if (skipped) notify?.('Only pictures, videos, sound and text files (scripts, notes) can go in the chat.')
    setFiles((now) => [...now, ...add.filter((f) => f && !now.some((x) => x.path === f.path))].slice(0, 10))
  }
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const chat = status?.chat
  const installed = status?.installed || {}
  const ready = ['claude', 'codex'].filter((e) => installed[e])
  const pick = chat?.engine || (engine && installed[engine] ? engine : status?.preferred)
  const busy = !!chat?.busy
  const act = (fn) => async (...a) => {
    try {
      await fn(...a)
    } catch (err) {
      notify?.(err.message)
    }
  }
  // follow the conversation as it grows
  const count = chat?.entries?.length || 0
  const lastText = chat?.entries?.[count - 1]?.text
  useEffect(() => {
    const b = bodyRef.current
    if (b) b.scrollTop = b.scrollHeight
  }, [count, lastText, busy, chat?.id])
  useEffect(() => {
    inputRef.current?.focus()
  }, [chat?.id])
  // newly installed from the rows here: look again
  const agentsReady = `${!!setup?.claude?.installed}${!!setup?.codex?.installed}`
  useEffect(() => {
    reload?.()
  }, [agentsReady])

  const send = act(async (words, aboutNow = about) => {
    const t = (words ?? text).trim()
    if ((!t && !files.length) || busy) return
    const sending = files
    setText('')
    setAbout(null)
    setFiles([])
    await window.ivstudio.chat.send({ text: aboutNow ? `About ${aboutNow}:\n${t}` : t, context, engine: pick, files: sending.map((f) => f.path) })
  })
  // a question handed over from elsewhere in the app (askAgent): sent at once when it says so and the agent is free,
  // otherwise left in the box with what it's about
  useEffect(() => {
    if (!ask || !status) return
    clearAsk?.()
    if (ask.send && pick && !busy && ask.text) send(ask.text, ask.about)
    else {
      setAbout(ask.about || null)
      if (ask.text) setText(ask.text)
      if (ask.send && busy) notify?.(`${NAMES[pick]} is still answering. Your question is ready in the box; send it when it's done.`)
      inputRef.current?.focus()
    }
  }, [ask, !!status])
  const fresh = act(async (e) => {
    await window.ivstudio.chat.new(e || pick)
    reload?.()
  })
  const openChat = act(async (id) => {
    await window.ivstudio.chat.open(id)
    reload?.()
  })
  const answer = act((id, allow) => window.ivstudio.chat.answer({ id, allow }))
  const undo = act((id) => window.ivstudio.chat.undo(id))
  const stop = act(() => window.ivstudio.chat.stop())
  const others = (status?.chats || []).filter((c) => c.id !== chat?.id)

  return (
    <aside
      className={`chat-panel ${dropping ? 'dropping' : ''}`}
      aria-label="Chat"
      onDragOver={(ev) => {
        if (!pick || ![...(ev.dataTransfer?.types || [])].includes('Files')) return
        ev.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(ev) => !ev.currentTarget.contains(ev.relatedTarget) && setDropping(false)}
      onDrop={(ev) => {
        if (!pick) return
        ev.preventDefault()
        setDropping(false)
        addFiles([...(ev.dataTransfer?.files || [])].map((f) => window.ivstudio.media.pathFor(f)).filter(Boolean))
      }}
    >
      <header className="chat-head">
        <h2>Chat</h2>
        {ready.length > 1 && !(chat?.entries?.length) ? (
          <div className="segmented chat-engine" role="radiogroup" aria-label="Agent">
            {ready.map((e) => (
              <button key={e} role="radio" aria-checked={pick === e} className={pick === e ? 'on' : ''} onClick={() => (chat ? fresh(e) : setEngine(e))}>
                {NAMES[e]}
              </button>
            ))}
          </div>
        ) : (
          pick && <span className="mono small dim chat-who">{NAMES[pick]}</span>
        )}
        <span className="spacer" />
        {chat?.entries?.length > 0 && (
          <button className="btn btn-small" disabled={busy} onClick={() => fresh()} title="Start a new conversation">
            New chat
          </button>
        )}
        <button className="lora-chip-x" aria-label="Close the chat" onClick={onClose}>
          ×
        </button>
      </header>
      {chat?.spending?.label && (
        <div className="chat-today mono small" title="The chat's spending limit (Settings → Agents)">
          {chat.spending.label}
        </div>
      )}
      {others.length > 0 && (
        <select className="chat-history small" value="" disabled={busy} onChange={(ev) => ev.target.value && openChat(ev.target.value)} aria-label="Earlier chats">
          <option value="">Earlier chats…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.title || 'Untitled').slice(0, 60)} · {NAMES[c.engine]}
            </option>
          ))}
        </select>
      )}

      {!pick ? (
        <div className="chat-body chat-setup">
          <p className="small">The chat uses your own Claude Code or Codex, on your own plan. Install one here, or sign in if you already have it.</p>
          <AgentRows setup={setup} notify={notify} />
        </div>
      ) : (
        <>
          <div className="chat-body" ref={bodyRef} aria-live="polite">
            {!chat?.entries?.length ? (
              <div className="chat-empty">
                <p className="small">
                  Ask {NAMES[pick]} about IV Studio or your projects, or tell it what to make. It can use everything IV Studio does, and it knows which page you’re on.
                </p>
                <div className="chat-ideas">
                  {ideasFor(context?.page).map((i) => (
                    <button key={i} className="chat-idea small" onClick={() => (setText(i), inputRef.current?.focus())}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.entries.map((e, i) => <Entry key={i} e={e} onAnswer={answer} onUndo={undo} onOpenShot={openShot} />)
            )}
            {busy && (
              <div className="chat-working mono small">
                <span className="agent-dot live" aria-hidden="true" /> {chat.name} is working…
              </div>
            )}
          </div>
          {chat?.renders?.length > 0 && (
            <div className="chat-renders">
              {chat.renders.map((r) => (
                <div key={r.id} className="chat-render small">
                  <span className="mono">{KIND[r.kind] || r.kind || 'Render'}</span>
                  <span className="dim">{RENDER[r.status] || r.status}</span>
                  {r.status === 'running' && r.progress != null && (
                    <span className="agent-bar" aria-label={`${r.progress}%`}>
                      <span style={{ width: `${r.progress}%` }} />
                    </span>
                  )}
                </div>
              ))}
              <button className="link-btn small" onClick={() => go?.('library')}>
                Open Shots →
              </button>
            </div>
          )}
          {about && (
            <div className="chat-about small">
              <span className="dim">About</span> <span className="chat-about-what">{about}</span>
              <button className="lora-chip-x" aria-label="Not about this any more" onClick={() => setAbout(null)}>
                ×
              </button>
            </div>
          )}
          {files.length > 0 && (
            <div className="chat-files chat-files-ready">
              {files.map((f) => (
                <FileChip key={f.path} f={f} onRemove={() => setFiles((now) => now.filter((x) => x.path !== f.path))} />
              ))}
            </div>
          )}
          <div className="chat-compose">
            <button className="chat-attach" disabled={busy || files.length >= 10} onClick={act(async () => addFiles(await window.ivstudio.files.pick('chat')))} title="Add pictures, videos, sound or a script (or drop them on the chat)" aria-label="Add files">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              rows={2}
              value={text}
              placeholder={`Message ${NAMES[pick]}…`}
              aria-label={`Message ${NAMES[pick]}`}
              onChange={(ev) => setText(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                  ev.preventDefault()
                  send()
                }
              }}
            />
            {busy ? (
              <button className="btn chat-send" onClick={stop}>
                Stop
              </button>
            ) : (
              <button className="btn btn-primary chat-send" disabled={!text.trim() && !files.length} onClick={() => send()}>
                Send
              </button>
            )}
          </div>
          <p className="chat-foot small dim">
            Your own {NAMES[pick]}, on your {pick === 'claude' ? 'Claude' : 'ChatGPT'} plan. It asks before it deletes, spends money or changes a setting.
          </p>
        </>
      )}
    </aside>
  )
}

// A batch's dailies (dailies.js): the reel of every take with its title card, and notes on what to look at first.
// Reports from before dailies existed can make them here.
function Dailies({ entry }) {
  const [d, setD] = useState(entry.dailies || null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const make = async () => {
    setBusy(true)
    setErr(null)
    try {
      setD(await window.ivstudio.batches.dailies(entry.batchId))
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }
  const open = (f) => window.ivstudio.files.open(f).catch((x) => setErr(x.message))
  return (
    <div className="chat-report-dailies">
      {d?.reel && (
        <button className="btn btn-small btn-primary" onClick={() => open(d.reel)} title="Every take, the best of each shot first, each after a card with its seed and checks">
          ▶ Watch the dailies
        </button>
      )}
      {d?.notes && (
        <button className="btn btn-small" onClick={() => open(d.notes)} title="What to look at first, and every take with its checks">
          Read the notes
        </button>
      )}
      {!d && entry.batchId && (
        <button className="btn btn-small" disabled={busy} onClick={make}>
          {busy ? 'Making the dailies…' : 'Make the dailies'}
        </button>
      )}
      {err && <span className="small pink">{err}</span>}
    </div>
  )
}
