# Monad Node Standard (MNS)

The Monad Node Standard (MNS) is a vendor-neutral, open specification that standardizes how autonomous Automated nodes and tooling providers interface with development workflows, templates, and execution layers on the Monad blockchain.

## Standard Specifications

1. **[Skill Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/skill_schema.md)**: Standardizes how node capabilities are declared, routed, and invoked.
2. **[Planning Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/planning_schema.md)**: Outlines the step-by-step developer intent breakdown.
3. **[Execution Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/execution_schema.md)**: Standardizes low-level compiler outputs and transaction payloads.
4. **[Memory Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/memory_schema.md)**: Defines local project state persistence to maintain context across sessions.
5. **[MCP Tool Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/mcp_tool_schema.md)**: Details Model Context Protocol tool description structures.
6. **[Composition Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/composition_schema.md)**: Specifies multi-skill dependency graphs.
7. **[Repair Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/repair_schema.md)**: Structures self-healing logs and explanations.
8. **[Audit Schema](file:///Users/mac/MONADFORGE%20AI/docs/MNS/audit_schema.md)**: Defines static analysis vulnerability report structures.

---

## Core Principles

- **Local-First Execution**: Standard schemas do not assume cloud dependencies or databases.
- **EVM Compatibility**: Built on EVM standards, optimized for Monad's high-throughput pipelined execution environment.
- **Node Native**: Formatted using JSON schema models easily generated and parsed by Automated Tools (Clients) and Model Context Protocol (MCP) clients.
