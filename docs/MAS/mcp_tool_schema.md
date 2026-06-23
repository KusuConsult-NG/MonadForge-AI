# Monad Agent Standard (MAS): MCP Tool Schema

Version: `1.0.0`

## Specification

The Model Context Protocol (MCP) Tool Schema specifies how tools are registered and called via stdio or SSE transport.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/mcp_tool.json",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "description": { "type": "string" },
    "inputSchema": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "const": "object" },
        "properties": { "type": "object" },
        "required": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["type", "properties"]
    }
  },
  "required": ["name", "description", "inputSchema"]
}
```
