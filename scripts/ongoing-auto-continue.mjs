#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ONGOING_WORK_FILE = resolve('.ongoing-work.md');
const CAPTURE_OUT = 'bolt.work/n8n/copilot-inbox/latest-next.json';

function parseArgs(argv) {
  let retries = 3;

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];

    if (token === '--retries') {
      const value = Number(argv[index + 1]);

      if (Number.isFinite(value) && value >= 0) {
        retries = Math.floor(value);
      }

      index += 1;
    }
  }

  return { retries };
}

function runNodeScript(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: resolve('.'),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(stderr || stdout || `Command failed: node ${args.join(' ')}`);
  }

  return (result.stdout || '').trim();
}

function runVerifyAndCapture() {
  const verifyOutput = runNodeScript(['scripts/verify-ongoing-work.mjs']);
  const captureOutput = runNodeScript(['scripts/ongoing-cycle-capture.mjs', 'next', '--out', CAPTURE_OUT]);

  return {
    ok: true,
    verifyCommand: 'pnpm run verify:ongoing-work',
    captureCommand: 'pnpm run ongoing:cycle:next:capture',
    verifyOutputTail: verifyOutput.split(/\r?\n/).slice(-3),
    captureOutputTail: captureOutput.split(/\r?\n/).slice(-3),
  };
}

function updateLiveCommands(lastCommand, nextCommand) {
  const content = readFileSync(ONGOING_WORK_FILE, 'utf8');
  const lines = content.split(/\r?\n/);

  const rewritten = lines.map((line) => {
    const normalized = line.trimStart().replace(/^[-*]\s+/, '');

    if (normalized.startsWith('Last command run:')) {
      return `- Last command run: \`${lastCommand}\`.`;
    }

    if (normalized.startsWith('Next exact command:')) {
      return `- Next exact command: \`${nextCommand}\`.`;
    }

    return line;
  });

  writeFileSync(ONGOING_WORK_FILE, `${rewritten.join('\n')}\n`, 'utf8');
}

function readBridgeJson() {
  const raw = runNodeScript(['scripts/ongoing-work-bridge.mjs', 'json']);
  const payload = JSON.parse(raw);

  return {
    next: payload?.next || null,
    objectives: Array.isArray(payload?.objectives) ? payload.objectives : [],
  };
}

function runCycleNext() {
  const raw = runNodeScript(['scripts/n8n-ongoing-cycle.mjs', 'next']);

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function resolveNextWithRetries(retries) {
  const initial = readBridgeJson();

  if (initial.next) {
    return {
      status: 'execute-now',
      reason: 'next-objective-present',
      next: initial.next,
      retriesAttempted: 0,
      promptCommand: 'pnpm run ongoing:bridge -- prompt',
      attempts: [],
    };
  }

  const attempts = [];

  for (let attempt = 1; attempt <= retries; attempt++) {
    const cycleResult = runCycleNext();
    const after = readBridgeJson();

    attempts.push({
      attempt,
      cycleAction: cycleResult?.action || 'next',
      openCount: Number.isFinite(cycleResult?.openCount) ? cycleResult.openCount : null,
      hasNextAfterAttempt: Boolean(after.next),
    });

    if (after.next) {
      return {
        status: 'execute-now',
        reason: 'recovered-after-next-retry',
        next: after.next,
        retriesAttempted: attempt,
        attempts,
        promptCommand: 'pnpm run ongoing:bridge -- prompt',
      };
    }
  }

  return {
    status: 'queue-empty-confirmed',
    reason: 'no-next-objective-after-retries',
    retriesAttempted: retries,
    attempts,
    followUpCommand: 'pnpm run ongoing:cycle -- scan',
  };
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function main() {
  const { retries } = parseArgs(process.argv.slice(2));
  const gate = resolveNextWithRetries(retries);

  if (gate.status !== 'execute-now') {
    emit(gate);
    return;
  }

  const validation = runVerifyAndCapture();
  updateLiveCommands(
    'pnpm run verify:ongoing-work; pnpm run ongoing:cycle:next:capture',
    'pnpm run ongoing:auto:continue',
  );
  const followUpGate = resolveNextWithRetries(retries);

  emit({
    ...gate,
    validation,
    ongoingWorkUpdated: true,
    followUpGate,
  });
}

try {
  main();
} catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  console.error(`ongoing-auto-continue error: ${details}`);
  process.exit(1);
}
