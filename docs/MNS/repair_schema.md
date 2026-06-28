# Monad Node Standard (MNS): Repair Schema

Version: `1.0.0`

## Specification

The Repair Schema defines the layout of diagnosis and healing records generated when recovering from compilation or test failures.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/repair.json",
  "type": "object",
  "properties": {
    "issue": { "type": "string" },
    "diagnosis": { "type": "string" },
    "applied fix": { "type": "string" },
    "validation result": { "type": "string" }
  },
  "required": ["issue", "diagnosis", "applied fix", "validation result"]
}
```
