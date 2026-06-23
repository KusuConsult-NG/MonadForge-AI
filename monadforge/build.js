const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function build() {
  console.log('Building MonadForge AI (Option B Monolithic Bundle)...');

  const distDir = path.resolve(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Define external dependencies that should not be bundled
  const externals = [
    'ethers',
    'zod',
    'dotenv',
    'commander',
    'solc',
    '@solidity-parser/parser',
    '@modelcontextprotocol/sdk',
    'fs',
    'path',
    'crypto',
    'os',
    'child_process',
    'http',
    'https',
    'url',
    'util',
    'stream'
  ];

  // 1. Build SDK wrapper
  console.log('Bundling SDK...');
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/index.ts')],
    outfile: path.resolve(distDir, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: externals,
  });

  // 2. Build CLI wrapper
  console.log('Bundling CLI...');
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../cli/src/index.ts')],
    outfile: path.resolve(distDir, 'cli.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: externals,
  });

  // 3. Build MCP server wrapper
  console.log('Bundling MCP Server...');
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../mcp/src/index.ts')],
    outfile: path.resolve(distDir, 'mcp.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: externals,
  });

  // 4. Generate bundled typings
  console.log('Generating bundled typings via dts-bundle-generator...');
  try {
    execSync(
      'npx dts-bundle-generator -o dist/index.d.ts src/index.ts --no-check',
      { cwd: __dirname, stdio: 'inherit' }
    );
    console.log('Typings generated successfully.');
  } catch (err) {
    console.error('Failed to generate typings:', err);
    process.exit(1);
  }

  console.log('Build completed successfully.');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
