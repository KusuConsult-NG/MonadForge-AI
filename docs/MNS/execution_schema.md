# Monad Node Standard (MNS): Execution Schema

Version: `1.0.0`

## Specification

The Execution Schema defines the payload exchanged when executing low-level blockchain transactions or deployments on Monad.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/execution.json",
  "type": "object",
  "properties": {
    "transactionHash": { "type": "string", "pattern": "^0x[a-fA-F0-9]{64}$" },
    "contractAddress": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "gasUsed": { "type": "string" },
    "status": { "type": "string", "enum": ["success", "failed"] },
    "network": { "type": "string" }
  },
  "required": ["status", "network"]
}
```
