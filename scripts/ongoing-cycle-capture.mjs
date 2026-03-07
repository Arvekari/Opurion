#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const [command = 'scan', ...rest] = argv;
  let outPath = '';
  const passthrough = [];

  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];

    if (token === '--out') {
      outPath = rest[index + 1] || '';
      index += 1;
      continue;
    }

    passthrough.push(token);
  }

  return {
    command,
    outPath,
    passthrough,
  };
}

function main() {
  const { command, outPath, passthrough } = parseArgs(process.argv.slice(2));
  const cycleArgs = ['scripts/n8n-ongoing-cycle.mjs', command, ...passthrough];
  const result = spawnSync(process.execPath, cycleArgs, {
    cwd: resolve('.'),
    encoding: 'utf8',
  });

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  const output = result.stdout || '';
  process.stdout.write(output);

  if (outPath) {
    const absoluteOutPath = resolve(outPath);
    mkdirSync(dirname(absoluteOutPath), { recursive: true });
    writeFileSync(absoluteOutPath, output, 'utf8');
  }
}

main();