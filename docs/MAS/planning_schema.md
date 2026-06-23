# Monad Agent Standard (MAS): Planning Schema

Version: `1.0.0`

## Specification

The Planning Schema defines how developer intent is broken down into sequential execution steps.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/plan.json",
  "type": "object",
  "properties": {
    "projectId": { "type": "string" },
    "goal": { "type": "string" },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "description": { "type": "string" },
          "skillName": { "type": "string" },
          "params": { "type": "object" },
          "status": { "type": "string", "enum": ["pending", "completed", "failed"] }
        },
        "required": ["id", "description", "skillName", "status"]
      }
    }
  },
  "required": ["projectId", "goal", "steps"]
}
```
