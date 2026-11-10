// A stand-in for Claude Code in a chat turn (src/service/agentchat.js tests and test copies): prints Claude Code's
// stream-json for one message.
//   message with "delete": asks like IV Studio's MCP server does (an ask file in the chat's ask folder, read from the
//                          --mcp-config file) and waits for the answer
//   "render":              "starts" a render (its id into the chat's jobs file) and watches it
//   "slow":                waits 60 s (for Stop)
//   anything else:         answers with what it was told, the context line and the session it continued
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const resumed = opt('--resume')
const session = resumed || `stub-session-${Math.random().toString(36).slice(2, 8)}`
const mcp = JSON.parse(fs.readFileSync(opt('--mcp-config'), 'utf8')).mcpServers['iv-studio']
const askDir = mcp.env.IV_STUDIO_AGENT_ASK
const jobsFile = mcp.env.IV_STUDIO_AGENT_JOBS
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)
const say = (text) => out({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const use = (id, name, input = {}) => out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__iv-studio__${name}`, input }] } })
const result = (id, text, isError = false) => out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: [{ type: 'text', text }] }] } })

let input = ''
for await (const chunk of process.stdin) input += chunk
const lines = input.trim().split('\n')
const context = lines[0].startsWith('[') ? lines[0] : null
const message = lines.filter((l) => !l.startsWith('[')).join(' ').trim()

out({ type: 'system', subtype: 'init', session_id: session })
await wait(300)
let last
if (/delete/i.test(message)) {
  use('t1', 'list_projects')
  result('t1', '{"items":[]}')
  use('t2', 'delete_project', { projectId: 'p1' })
  const id = `ask-${Date.now().toString(36)}`
  const askFile = path.join(askDir, `${id}.ask.json`)
  const answerFile = path.join(askDir, `${id}.answer.json`)
  fs.writeFileSync(askFile, JSON.stringify({ id, tool: 'delete_project', why: 'This deletes something and can’t be undone.', args: { projectId: 'p1' } }))
  let answer = null
  for (let i = 0; i < 300 && !answer; i++) {
    try {
      answer = JSON.parse(fs.readFileSync(answerFile, 'utf8'))
    } catch {
      await wait(200)
    }
  }
  if (answer?.allow) {
    result('t2', '{"deleted":true}')
    last = 'Deleted it.'
  } else {
    result('t2', "The person chose Don't allow for delete_project, so it didn't run.", true)
    last = 'Okay, I left it as it is.'
  }
} else if (/render/i.test(message)) {
  use('t1', 'generate_previews', { engine: 'h3' })
  fs.appendFileSync(jobsFile, 'stub-job-1\n')
  result('t1', '{"id":"stub-job-1","status":"queued","kind":"previews"}')
  for (let i = 0; i < 3; i++) {
    use(`g${i}`, 'get_job', { jobId: 'stub-job-1' })
    result(`g${i}`, '{"status":"running"}')
    await wait(150)
  }
  last = 'It’s rendering three takes now; they’ll be in Shots.'
} else if (/slow/i.test(message)) {
  say('Working on it…')
  await wait(60000)
  last = 'Done after a long time.'
} else {
  last = `You said: ${message}.${context ? ` I can see ${context}.` : ''}${resumed ? ` (continuing ${resumed})` : ' (a new chat)'}`
}
say(last)
out({ type: 'result', subtype: 'success', is_error: false, result: last, session_id: session })
