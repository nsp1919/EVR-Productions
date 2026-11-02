'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (typeof process.loadEnvFile !== 'function') {
  console.error('Use Node.js 20.12 or newer so the local .env.local file can be loaded securely.');
  process.exit(1);
}

try {
  process.loadEnvFile(path.join(__dirname, '.env.local'));
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.error(`Could not load .env.local: ${error.message}`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'production' &&
    process.env.VERCEL_ENV !== 'production' &&
    process.env.VERCEL_ENV !== 'preview') {
  process.env.EVR_LOCAL_ADMIN_BYPASS = '1';
}

const windows = process.platform === 'win32';
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
if (windows && !fs.existsSync(npxCli)) {
  console.error('Could not find npm’s npx CLI beside Node.js. Repair or reinstall Node.js, then try again.');
  process.exit(1);
}
const command = windows ? process.execPath : 'npx';
const args = windows
  ? [npxCli, 'vercel', 'dev', ...process.argv.slice(2)]
  : ['vercel', 'dev', ...process.argv.slice(2)];
const server = spawn(command, args, {
  cwd: __dirname,
  env: process.env,
  stdio: 'inherit'
});

server.on('error', error => {
  console.error(`Could not start Vercel development server: ${error.message}`);
  process.exitCode = 1;
});

server.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : code === null ? 1 : code;
});
