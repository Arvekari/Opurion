import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

function getChangedFiles() {
  const commands = [
    'git diff --cached --name-only --diff-filter=ACMR',
    'git diff --name-only --diff-filter=ACMR HEAD',
  ];

  for (const command of commands) {
    try {
      const output = execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();

      if (!output) {
        continue;
      }

      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      continue;
    }
  }

  return [];
}

function isSourceFile(file) {
  if (!file.startsWith('app/')) {
    return false;
  }

  if (!/\.(ts|tsx|js|jsx)$/.test(file)) {
    return false;
  }

  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) {
    return false;
  }

  if (file.endsWith('.d.ts')) {
    return false;
  }

  return true;
}

function fileExistsInHead(file) {
  try {
    execSync(`git cat-file -e HEAD:${file}`, { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function getTestCandidates(file) {
  const ext = path.extname(file);
  const base = file.slice(0, -ext.length);
  const relNoApp = file.replace(/^app\//, '');
  const relBase = relNoApp.slice(0, -ext.length);

  return [
    `${base}.test${ext}`,
    `${base}.spec${ext}`,
    `unit-tests/${relBase}.test.ts`,
    `unit-tests/${relBase}.spec.ts`,
  ];
}

function hasMatchingTest(file) {
  const candidates = getTestCandidates(file);

  return candidates.some((candidate) => existsSync(candidate));
}

function hasMatchingTestInHead(file) {
  const candidates = getTestCandidates(file);

  return candidates.some((candidate) => fileExistsInHead(candidate));
}

function getGeneratedTestPath(file) {
  const ext = path.extname(file);
  const relNoApp = file.replace(/^app\//, '');
  const relBase = relNoApp.slice(0, -ext.length);

  return `unit-tests/${relBase}.test.ts`;
}

function createMissingTest(file) {
  const targetPath = getGeneratedTestPath(file);

  if (existsSync(targetPath)) {
    return null;
  }

  const dir = path.dirname(targetPath);
  mkdirSync(dir, { recursive: true });

  const content = [
    "import { describe, it } from 'vitest';",
    '',
    `describe('${file}', () => {`,
    "  it.todo('add unit tests for this source file');",
    '});',
    '',
  ].join('\n');

  writeFileSync(targetPath, content, 'utf8');
  return targetPath;
}

const shouldCreateMissing = process.argv.includes('--create-missing');

const changed = getChangedFiles();

if (changed.length === 0) {
  console.log('No changed files detected by git diff; skipping unit-test mapping check.');
  process.exit(0);
}

const sourceFiles = changed.filter(isSourceFile);
const missing = sourceFiles.filter((file) => !hasMatchingTest(file));
const sequenceViolations = sourceFiles.filter((file) => fileExistsInHead(file) && !hasMatchingTestInHead(file));

if (missing.length > 0 || sequenceViolations.length > 0) {
  const created = [];

  if (shouldCreateMissing) {
    for (const file of missing) {
      const createdPath = createMissingTest(file);
      if (createdPath) {
        created.push(createdPath);
      }
    }
  }

  if (sequenceViolations.length > 0) {
    console.error('Test-first sequence violation (source files changed before baseline test existed):');
    for (const file of sequenceViolations) {
      console.error(` - ${file}`);
    }
  }

  if (missing.length > 0) {
    console.error('Missing unit tests for changed source files:');
    for (const file of missing) {
      console.error(` - ${file}`);
    }
  }

  if (created.length > 0) {
    console.error('\nCreated missing test files:');
    for (const file of created) {
      console.error(` + ${file}`);
    }
  }

  console.error('\nBefore code changes: check whether a matching unit test already exists.');
  console.error('If missing, create one first based on an existing similar test under unit-tests/.');
  console.error('If behavior changed, update the related test content in the same commit.');

  if (sequenceViolations.length > 0) {
    console.error('For existing source files with no prior tests, add/commit the baseline test first, then apply source changes.');
  }

  if (created.length > 0) {
    console.error('Stage the newly created test file(s), implement real assertions, and commit again.');
  }
  process.exit(1);
}

console.log('Unit-test mapping check passed for changed files.');
