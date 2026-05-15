# dual-brain MCP Server

Exposes dual-brain's routing engine as MCP tools so any MCP-compatible client (VS Code, Cursor, Windsurf, etc.) can use smart provider/model routing.

## Usage

Add to your MCP client config:

```json
{
  "mcpServers": {
    "dual-brain": {
      "command": "node",
      "args": ["node_modules/dual-brain/mcp-server/index.mjs"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "dual-brain": {
      "command": "node",
      "args": ["/path/to/dual-brain/mcp-server/index.mjs"]
    }
  }
}
```

## Tools

### `dual_brain_detect`
Classify a task into intent, risk, complexity, and tier.

```json
{ "prompt": "refactor the auth module", "files": ["src/auth.mjs"] }
```

Returns: `{ intent, risk, complexity, effort, tier, requiresWrite, explanation }`

### `dual_brain_decide`
Full routing decision — detect + route to provider and model.

```json
{ "prompt": "fix the login bug", "files": ["src/auth.mjs"], "profile": "quality-first" }
```

Returns: `{ provider, model, effort, tier, dualBrain, explanation, detection }`

### `dual_brain_status`
Provider health, routing scores, and session stats.

```json
{}
```

Returns: `{ providers: { claude: {...}, openai: {...} }, session, profile }`

### `dual_brain_remember`
Save a routing preference that persists across sessions.

```json
{ "preference": "prefer claude for architecture tasks" }
```

Returns: `{ saved: true, preference, preferences: string[] }`

## Standalone test

```bash
node mcp-server/index.mjs
```

Then send JSON-RPC over stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node mcp-server/index.mjs
```
