// MCP smoke test: launch the server the way an agent would and call the read-only tools.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'node:path'
import { createRequire } from 'node:module'

// MCP_COMMAND and MCP_ARGS (a JSON list) start a packaged copy instead, e.g. an AppImage on its starter script.
const transport = new StdioClientTransport({
  command: process.env.MCP_COMMAND || createRequire(import.meta.url)('electron'), // the electron package's binary (downloaded on first use)
  args: process.env.MCP_ARGS ? JSON.parse(process.env.MCP_ARGS) : [path.resolve('out/main/mcp.js')],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
const client = new Client({ name: 'smoke', version: '1' })
await client.connect(transport)
const { tools } = await client.listTools()
console.log(`tools (${tools.length}):`, tools.map((t) => t.name).join(', '))
if (tools.length < 100) throw new Error(`only ${tools.length} tools`)
const setup = await client.callTool({ name: 'check_setup', arguments: {} })
console.log('check_setup ready:', setup.structuredContent?.ready, '| items:', setup.structuredContent?.items?.length)
const plan = await client.callTool({ name: 'plan_render', arguments: { mode: 'reference', prompt: 'x', aspect: '9:16', megapixels: 0.4, seconds: 6, media: [{ kind: 'picture', file: 'minimax_h3/tess_pub_garden_ref.png' }], finish: { megapixels: 1.5, fps: 60 } } })
console.log('plan_render:', JSON.stringify(plan.structuredContent))
const bad = await client.callTool({ name: 'plan_render', arguments: { mode: 'frames', prompt: 'x' } })
console.log('invalid request ->', bad.isError, bad.content[0].text)
await client.close()
