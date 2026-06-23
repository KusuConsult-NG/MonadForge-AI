# Monad Agent Standard (MAS)

The Monad Agent Standard (MAS) is a vendor-neutral, open specification that standardizes how autonomous AI agents and tooling providers interface with development workflows, templates, and execution layers on the Monad blockchain.

## Standard Specifications

1. **[Skill Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/skill_schema.md)**: Standardizes how agent capabilities are declared, routed, and invoked.
2. **[Planning Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/planning_schema.md)**: Outlines the step-by-step developer intent breakdown.
3. **[Execution Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/execution_schema.md)**: Standardizes low-level compiler outputs and transaction payloads.
4. **[Memory Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/memory_schema.md)**: Defines local project state persistence to maintain context across sessions.
5. **[MCP Tool Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/mcp_tool_schema.md)**: Details Model Context Protocol tool description structures.
6. **[Composition Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/composition_schema.md)**: Specifies multi-skill dependency graphs.
7. **[Repair Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/repair_schema.md)**: Structures self-healing logs and explanations.
8. **[Audit Schema](file:///Users/mac/MONADFORGE%20AI/docs/MAS/audit_schema.md)**: Defines static analysis vulnerability report structures.

---

## Core Principles

- **Local-First Execution**: Standard schemas do not assume cloud dependencies or databases.
- **EVM Compatibility**: Built on EVM standards, optimized for Monad's high-throughput pipelined execution environment.
- **Agent Native**: Formatted using JSON schema models easily generated and parsed by Large Language Models (LLMs) and Model Context Protocol (MCP) clients.
