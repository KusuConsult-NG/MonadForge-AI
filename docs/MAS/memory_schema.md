# Monad Agent Standard (MAS): Memory Schema

Version: `1.0.0`

## Specification

The Memory Schema outlines the project metadata stored locally to preserve historical context across agent restarts.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/memory.json",
  "type": "object",
  "properties": {
    "projectId": { "type": "string" },
    "contracts": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "deployments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "contractName": { "type": "string" },
          "contractAddress": { "type": "string" },
          "transactionHash": { "type": "string" },
          "network": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" }
        },
        "required": ["contractName", "contractAddress", "network", "timestamp"]
      }
    },
    "planningHistory": { "type": "array", "items": { "type": "object" } },
    "decisions": { "type": "array", "items": { "type": "string" } },
    "detectedIssues": { "type": "array", "items": { "type": "string" } },
    "auditResults": { "type": "array", "items": { "type": "object" } },
    "skillHistory": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["projectId", "contracts", "deployments"]
}
```
