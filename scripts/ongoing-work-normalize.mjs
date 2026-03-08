#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE_PATH = resolve('.ongoing-work.md');
const BACKUP_DIR = resolve('bolt.work/ongoing-work-backups');
const UNCATEGORIZED_MARKER = 'Uncategorized and not yet id:t TODO Work';
const P5_HEADER_PREFIX = '### P5';
const TASK_ID_PATTERN = /\[taskId:\s*([a-zA-Z0-9._:-]+)\]/i;

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
}

function parseUncategorizedEntry(line) {
  const bulletMatch = line.match(/^\s*-\s+(.+)$/);

  if (!bulletMatch) {
    return null;
  }

  const content = bulletMatch[1].trim();

  if (/^`?TODO`?\s+None\.?$/i.test(content) || /^None\.?$/i.test(content)) {
    return null;
  }

  const fullMatch = content.match(/^`(PARTIAL|TODO|BLOCKED)`\s+\[taskId:\s*([a-zA-Z0-9._:-]+)\]\s+(.+)$/i);

  if (fullMatch) {
    return {
      status: fullMatch[1].toUpperCase(),
      taskId: fullMatch[2],
      text: fullMatch[3].trim(),
    };
  }

  const statusOnlyMatch = content.match(/^`(PARTIAL|TODO|BLOCKED)`\s+(.+)$/i);

  if (statusOnlyMatch) {
    return {
      status: statusOnlyMatch[1].toUpperCase(),
      taskId: '',
      text: statusOnlyMatch[2].trim(),
    };
  }

  return {
    status: 'TODO',
    taskId: '',
    text: content,
  };
}

function main() {
  const original = readFileSync(FILE_PATH, 'utf8');
  const fullSnapshotPath = writeFullSnapshotBackup(original);
  const lines = original.split(/\r?\n/);

  const uncategorizedStart = lines.findIndex((line) => line.startsWith('## ') && line.includes(UNCATEGORIZED_MARKER));

  if (uncategorizedStart === -1) {
    console.log(JSON.stringify({ changed: false, reason: 'uncategorized-section-missing', fullSnapshotPath }, null, 2));
    return;
  }

  let uncategorizedEnd = lines.length;

  for (let index = uncategorizedStart + 1; index < lines.length; index++) {
    if (lines[index].startsWith('## ')) {
      uncategorizedEnd = index;
      break;
    }
  }

  const rawUncategorized = lines.slice(uncategorizedStart + 1, uncategorizedEnd);
  const entries = rawUncategorized.map(parseUncategorizedEntry).filter(Boolean);

  if (entries.length === 0) {
    console.log(JSON.stringify({ changed: false, migrated: 0, fullSnapshotPath }, null, 2));
    return;
  }

  const p5Start = lines.findIndex((line) => line.startsWith(P5_HEADER_PREFIX));

  if (p5Start === -1) {
    throw new Error('P5 section not found in .ongoing-work.md');
  }

  let p5End = lines.length;

  for (let index = p5Start + 1; index < lines.length; index++) {
    if (lines[index].startsWith('### ') || lines[index].startsWith('## ')) {
      p5End = index;
      break;
    }
  }

  const existingTaskIds = new Set();
  const existingTexts = new Set();

  for (let index = 0; index < lines.length; index++) {
    if (index > uncategorizedStart && index < uncategorizedEnd) {
      continue;
    }

    const line = lines[index];
    const taskIdMatch = line.match(TASK_ID_PATTERN);

    if (taskIdMatch) {
      existingTaskIds.add(taskIdMatch[1].trim());
    }

    const taskLineMatch = line.match(/^\s*-\s*`(PARTIAL|TODO|BLOCKED|DONE)`\s+(?:\[taskId:\s*[a-zA-Z0-9._:-]+\]\s+)?(.+)$/i);

    if (taskLineMatch) {
      existingTexts.add(taskLineMatch[2].trim().toLowerCase());
    }
  }

  const migrated = [];

  for (const entry of entries) {
    if (!entry.text || /^none\.?$/i.test(entry.text)) {
      continue;
    }

    if (existingTexts.has(entry.text.toLowerCase())) {
      continue;
    }

    let taskId = entry.taskId;

    if (!taskId) {
      const base = slugify(entry.text) || 'task';
      taskId = `bolt2-uncat-${base}`;
      let counter = 2;

      while (existingTaskIds.has(taskId)) {
        taskId = `bolt2-uncat-${base}-${counter}`;
        counter += 1;
      }
    }

    existingTaskIds.add(taskId);
    existingTexts.add(entry.text.toLowerCase());

    migrated.push(`- \`${entry.status === 'PARTIAL' ? 'PARTIAL' : 'TODO'}\` [taskId: ${taskId}] ${entry.text}`);
  }

  if (migrated.length === 0) {
    console.log(
      JSON.stringify(
        {
          changed: false,
          migrated: 0,
          preservedUncategorized: true,
          reason: 'no-confident-migration',
          fullSnapshotPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  const backupPath = writeUncategorizedBackup(rawUncategorized);
  const insertionPoint = p5End;
  const withMigrated = [...lines.slice(0, insertionPoint), ...migrated, ...lines.slice(insertionPoint)];

  const uncategorizedStart2 = withMigrated.findIndex(
    (line) => line.startsWith('## ') && line.includes(UNCATEGORIZED_MARKER),
  );
  let uncategorizedEnd2 = withMigrated.length;

  for (let index = uncategorizedStart2 + 1; index < withMigrated.length; index++) {
    if (withMigrated[index].startsWith('## ')) {
      uncategorizedEnd2 = index;
      break;
    }
  }

  const replacement = ['', '- `TODO` None.', ''];
  const nextLines = [
    ...withMigrated.slice(0, uncategorizedStart2 + 1),
    ...replacement,
    ...withMigrated.slice(uncategorizedEnd2),
  ];

  const nextContent = `${nextLines.join('\n').replace(/\n+$/g, '')}\n`;

  if (nextContent !== original) {
    writeFileSync(FILE_PATH, nextContent, 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        changed: nextContent !== original,
        migrated: migrated.length,
        movedTo: 'P5',
        fullSnapshotPath,
        backupPath,
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
  console.error(`ongoing-work-normalize error: ${details}`);
  process.exit(1);
}

function writeUncategorizedBackup(rawSectionLines) {
  const meaningfulLines = rawSectionLines.filter((line) => line.trim().length > 0);

  if (meaningfulLines.length === 0) {
    return null;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = resolve(BACKUP_DIR, `uncategorized-${timestamp}.md`);
  const backupContent = ['# Uncategorized Snapshot', '', `## ${UNCATEGORIZED_MARKER}`, '', ...meaningfulLines, ''].join('\n');

  writeFileSync(backupPath, backupContent, 'utf8');
  return backupPath;
}

function writeFullSnapshotBackup(content) {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = resolve(BACKUP_DIR, `ongoing-work-full-${timestamp}.md`);

  writeFileSync(backupPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  return backupPath;
}