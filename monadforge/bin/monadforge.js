#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const cliPath = path.resolve(__dirname, '../dist/cli.js');
if (fs.existsSync(cliPath)) {
  const { program } = require(cliPath);
  program.parse(process.argv);
} else {
  console.error('Error: MonadForge CLI binary not found. Please run npm run build.');
  process.exit(1);
}
