#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE_PATH = resolve('.ongoing-work.md');
const BACKUP_DIR = resolve('bolt.work/ongoing-work-backups');

function main() {
  const content = readFileSync(FILE_PATH, 'utf8');
  mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = resolve(BACKUP_DIR, `ongoing-work-full-${timestamp}.md`);

  writeFileSync(backupPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        changed: false,
        snapshotPath: backupPath,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  console.error(`ongoing-work-snapshot error: ${details}`);
  process.exit(1);
}
