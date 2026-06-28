# Monad Node Standard (MNS) Specification

Version: 1.0.0  
Status: Proposal  

The Monad Node Standard (MNS) defines schemas, protocols, and interfaces for interoperability between autonomous Automated nodes operating within the Monad blockchain ecosystem.

---

## 1. Skill Schema

A Skill defines a reusable, atomic capability that an node can route tasks to.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Skill",
  "type": "object",
  "properties": {
    "skill": {
      "type": "string",
      "description": "Unique identifier of the skill."
    },
    "version": {
      "type": "string",
      "description": "Semantic versioning representation."
    },
    "description": {
      "type": "string",
      "description": "What this skill does."
    },
    "inputs": {
      "type": "object",
      "description": "Required parameters schema."
    },
    "outputs": {
      "type": "object",
      "description": "Returned properties schema."
    },
    "permissions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Required scopes (e.g. read_docs, write_tx)."
    }
  },
  "required": ["skill", "version", "inputs", "outputs", "permissions"]
}
```

### Example
```json
{
  "skill": "create_erc20",
  "version": "1.0",
  "description": "Generates a standard ERC20 contract token.",
  "inputs": {
    "name": "string",
    "symbol": "string",
    "supply": "string"
  },
  "outputs": {
    "contracts": {
      "contracts/Token.sol": "string"
    }
  },
  "permissions": ["local_write"]
}
```

---

## 2. Tool Schema

A Tool defines a schema registered with the Model Context Protocol (MCP) for standard client invocation.

```json
{
  "name": "deploy_contract",
  "description": "Deploys compiled EVM bytecode onto Monad.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compiledArtifact": {
        "type": "object",
        "properties": {
          "abi": { "type": "array" },
          "bytecode": { "type": "string" }
        },
        "required": ["abi", "bytecode"]
      },
      "network": { "type": "string" }
    },
    "required": ["compiledArtifact", "network"]
  }
}
```

---

## 3. Memory Schema

Memory is the persistent local project context enabling cross-session continuation.

```json
{
  "projectId": "my-monad-project",
  "contracts": {
    "contracts/Staking.sol": "contract Staking {}"
  },
  "deployments": [
    {
      "contractName": "Staking",
      "contractAddress": "0xAddress",
      "transactionHash": "0xTx",
      "network": "monad-testnet",
      "timestamp": "2026-06-22T22:15:00Z"
    }
  ],
  "planningHistory": [
    {
      "goal": "Build staking protocol",
      "steps": []
    }
  ],
  "decisions": [
    "Used standard emission curves"
  ],
  "detectedIssues": [
    "None"
  ],
  "auditResults": [
    {
      "score": 0,
      "issues": []
    }
  ]
}
```

---

## 4. Planning Schema

Planning describes how goals are decomposed into structured execution plans.

```json
{
  "goal": "Build staking",
  "steps": [
    {
      "id": "step-1",
      "skill": "generate_contract",
      "params": {},
      "dependencies": []
    }
  ]
}
```

---

## 5. Execution Schema

Execution schemas describe the outcomes of running atomic steps or workflows.

```json
{
  "success": true,
  "stepResults": {
    "step-1": {
      "status": "success",
      "contractAddress": "0x123..."
    }
  },
  "errors": []
}
```
