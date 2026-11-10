import { useEffect, useRef, useState } from 'react'
import { AgentRows, useAgentSetup } from './AgentSetup'

// The chat with the person's own Claude Code or Codex (src/service/agentchat.js): a panel down the right side, over
// whatever page is open. Every IV Studio tool; anything that deletes, costs money, installs or changes Settings shows
// an Allow card first.
const NAMES = { claude: 'Claude Code', codex: 'Codex' }
const RENDER = { queued: 'waiting', running: 'rendering', success: 'done', error: 'failed', cancelled: 'cancelled', unknown: '' }
const KIND = { previews: 'Previews', finish: 'Finish', enhance: 'Enhance' }
const IDEAS = ['What can you do in IV Studio?', 'Make a 5 second shot of a fox crossing a frozen lake at dawn', 'Which of my shots aren’t finished yet?']

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

function Entry({ e, onAnswer }) {
  if (e.kind === 'you') return <div className="chat-you">{e.text}</div>
  if (e.kind === 'agent') return <div className="chat-agent">{e.text}</div>
  if (e.kind === 'problem') return <div className="chat-problem small" role="alert">{e.text}</div>
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

export default function ChatPanel({ status, reload, onClose, context, go, notify }) {
  const setup = useAgentSetup()
  const [text, setText] = useState('')
  const [engine, setEngine] = useState(null)
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

  const send = act(async (words) => {
    const t = (words ?? text).trim()
    if (!t || busy) return
    setText('')
    await window.ivstudio.chat.send({ text: t, context, engine: pick })
  })
  const fresh = act(async (e) => {
    await window.ivstudio.chat.new(e || pick)
    reload?.()
  })
  const openChat = act(async (id) => {
    await window.ivstudio.chat.open(id)
    reload?.()
  })
  const answer = act((id, allow) => window.ivstudio.chat.answer({ id, allow }))
  const stop = act(() => window.ivstudio.chat.stop())
  const others = (status?.chats || []).filter((c) => c.id !== chat?.id)

  return (
    <aside className="chat-panel" aria-label="Chat">
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
                  {IDEAS.map((i) => (
                    <button key={i} className="chat-idea small" onClick={() => (setText(i), inputRef.current?.focus())}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.entries.map((e, i) => <Entry key={i} e={e} onAnswer={answer} />)
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
          <div className="chat-compose">
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
              <button className="btn btn-primary chat-send" disabled={!text.trim()} onClick={() => send()}>
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
