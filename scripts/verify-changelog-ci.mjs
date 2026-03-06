import { execSync } from 'node:child_process';

function run(command) {
  return execSync(command, {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).trim();
}

function splitLines(value) {
  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const baseRef = process.env.CHANGELOG_BASE_REF;
const headRef = process.env.CHANGELOG_HEAD_REF || 'HEAD';

let changedFiles = [];

try {
  if (baseRef) {
    changedFiles = splitLines(run(`git diff --name-only --diff-filter=ACMR ${baseRef}...${headRef}`));
  } else {
    changedFiles = splitLines(run('git show --name-only --diff-filter=ACMR --pretty="" HEAD'));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to detect changed files for changelog verification: ${message}`);
  process.exit(1);
}

if (changedFiles.length === 0) {
  console.log('No changed files detected; skipping changelog CI check.');
  process.exit(0);
}

if (!changedFiles.includes('changelog.md')) {
  console.error('changelog.md was not updated in this change set.');
  console.error('Policy: every change must include a changelog.md update.');
  process.exit(1);
}

console.log('Changelog CI check passed.');
