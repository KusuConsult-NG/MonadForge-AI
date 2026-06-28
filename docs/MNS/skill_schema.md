# Monad Node Standard (MNS): Skill Schema

Version: `1.0.0`

## Specification

The Skill Schema defines how individual capability tools are declared and discovered by Automated nodes. Each skill must declare its type, required parameters, and return types.

### Schema format

```json
{
  "$schema": "https://monad.xyz/schemas/mas/skill.json",
  "name": "generate_contract",
  "version": "1.0.0",
  "description": "Generate a new Solidity contract files from templates.",
  "inputs": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "symbol": { "type": "string" },
      "domain": { "type": "string", "enum": ["erc20", "erc721", "staking", "dao", "amm"] }
    },
    "required": ["name", "domain"]
  },
  "outputs": {
    "type": "object",
    "properties": {
      "contracts": {
        "type": "object",
        "additionalProperties": { "type": "string" }
      },
      "tests": {
        "type": "object",
        "additionalProperties": { "type": "string" }
      }
    }
  }
}
```
