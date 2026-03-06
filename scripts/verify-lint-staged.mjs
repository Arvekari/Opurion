#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const stagedResult = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
});

if (stagedResult.status !== 0) {
  console.error(stagedResult.stderr || 'Failed to read staged files.');
  process.exit(stagedResult.status ?? 1);
}

const stagedFiles = stagedResult.stdout
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean);

const lintablePattern = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const lintTargets = stagedFiles.filter((file) => file.startsWith('app/') && lintablePattern.test(file));

if (lintTargets.length === 0) {
  console.log('No staged app files for lint check.');
  process.exit(0);
}

console.log(`Linting ${lintTargets.length} staged app file(s)...`);

const lintResult = spawnSync(
  'pnpm',
  ['exec', 'eslint', '--cache', '--cache-location', './node_modules/.cache/eslint', ...lintTargets],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

process.exit(lintResult.status ?? 1);
