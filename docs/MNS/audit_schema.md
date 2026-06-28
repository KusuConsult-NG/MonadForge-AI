# Monad Node Standard (MNS): Audit Schema

Version: `1.0.0`

## Specification

The Audit Schema outlines the format of vulnerability assessment reports produced by the security analyzer.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/audit.json",
  "type": "object",
  "properties": {
    "riskScore": { "type": "integer", "minimum": 0, "maximum": 100 },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "severity": { "type": "string", "enum": ["Critical", "High", "Medium", "Low", "Optimization"] },
          "category": { "type": "string" },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "recommendation": { "type": "string" }
        },
        "required": ["id", "severity", "category", "title", "description", "recommendation"]
      }
    },
    "recommendations": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["riskScore", "issues", "recommendations"]
}
```
