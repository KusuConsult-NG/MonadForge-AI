# Monad Node Standard (MNS): Composition Schema

Version: `1.0.0`

## Specification

The Composition Schema specifies how individual workflow steps depend on each other and combine into multi-skill systems.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/composition.json",
  "type": "object",
  "properties": {
    "goal": { "type": "string" },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "skill": { "type": "string" },
          "params": { "type": "object" },
          "dependsOn": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["id", "skill", "params"]
      }
    }
  },
  "required": ["goal", "steps"]
}
```
