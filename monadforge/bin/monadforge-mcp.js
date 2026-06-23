#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const mcpPath = path.resolve(__dirname, '../dist/mcp.js');
if (fs.existsSync(mcpPath)) {
  const { startServer } = require(mcpPath);
  startServer().catch((err) => {
    console.error('MCP Server crash:', err);
    process.exit(1);
  });
} else {
  console.error('Error: MonadForge AI MCP binary not found. Please run npm run build.');
  process.exit(1);
}
