#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

const FILE_PATH = resolve('.ongoing-work.md');
const WORKSPACE_CONFIG_PATH = resolve('..', 'listener-config.json');
const ROOT_CONFIG_PATH = resolve('listener-config.json');
const LEGACY_CONFIG_PATH = resolve('bolt.work/n8n/listener-config.json');
const TASK_ID_PREFIX_PATTERN = /^\[taskId:\s*([a-zA-Z0-9._:-]+)\]\s*(.*)$/i;

function resolveListenerConfigPath() {
  if (existsSync(WORKSPACE_CONFIG_PATH)) {
    return WORKSPACE_CONFIG_PATH;
  }

  if (existsSync(ROOT_CONFIG_PATH)) {
    return ROOT_CONFIG_PATH;
  }

  if (existsSync(LEGACY_CONFIG_PATH)) {
    return LEGACY_CONFIG_PATH;
  }

  return '';
}

function normalizeReturnAddress(returnAddress = {}) {
  const protocol = String(returnAddress.protocol || 'http').trim() || 'http';
  const pathRaw = String(returnAddress.path || '/publish-status').trim() || '/publish-status';
  const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
  const port = Number(returnAddress.port || 8788);
  const fqdn = String(returnAddress.fqdn || '').trim();
  const ip = String(returnAddress.ip || '').trim();
  const preferred = String(returnAddress.hostSelection || returnAddress.mode || 'fqdn').trim().toLowerCase();
  const hostSelection = preferred === 'ip' ? 'ip' : 'fqdn';
  const selectedHost = hostSelection === 'ip' ? ip || fqdn : fqdn || ip;
  const callbackUrl = selectedHost ? `${protocol}://${selectedHost}${port ? `:${port}` : ''}${path}` : '';

  return {
    protocol,
    port,
    path,
    hostSelection,
    mode: hostSelection,
    fqdn,
    ip,
    host: selectedHost,
    callbackUrl,
  };
}

function resolveRuntimeReturnAddress() {
  const fallback = normalizeReturnAddress({
    protocol: 'http',
    hostSelection: 'fqdn',
    fqdn: 'localhost',
    ip: '',
    port: 8788,
    path: '/publish-status',
  });

  const configPath = resolveListenerConfigPath();

  if (!configPath) {
    return fallback;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    return normalizeReturnAddress(raw?.returnAddress || {});
  } catch {
    return fallback;
  }
}

function parseStatusLine(line) {
  const match = line.match(/^\s*-\s*`(PARTIAL|TODO|BLOCKED)`\s+(.+)$/);

  if (!match) {
    return null;
  }

  const taskIdMatch = match[2].trim().match(TASK_ID_PREFIX_PATTERN);
  const taskId = taskIdMatch ? taskIdMatch[1] : '';
  const objectiveText = taskIdMatch ? taskIdMatch[2].trim() : match[2].trim();

  return {
    status: match[1],
    taskId,
    text: objectiveText,
  };
}

function extractObjectives(markdown) {
  const lines = markdown.split(/\r?\n/);
  const objectives = [];
  let inPrioritized = false;
  let currentPriority = '';

  for (const line of lines) {
    if (line.startsWith('## Prioritized Unfinished Work')) {
      inPrioritized = true;
      currentPriority = '';
      continue;
    }

    if (inPrioritized && line.startsWith('## ') && !line.startsWith('## Prioritized Unfinished Work')) {
      break;
    }

    if (!inPrioritized) {
      continue;
    }

    const priorityMatch = line.match(/^###\s+(P\d+)/);

    if (priorityMatch) {
      currentPriority = priorityMatch[1];
      continue;
    }

    const parsed = parseStatusLine(line);

    if (!parsed) {
      continue;
    }

    if (/^none\.?$/i.test(parsed.text)) {
      continue;
    }

    objectives.push({
      priority: currentPriority || 'UNSPECIFIED',
      status: parsed.status,
      taskId: parsed.taskId,
      text: parsed.text,
    });
  }

  return objectives;
}

function selectNextObjective(objectives) {
  const preferred = objectives.find((item) => item.status === 'PARTIAL') || objectives.find((item) => item.status === 'TODO');
  return preferred || null;
}

function normalizeAgentId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function resolveAgentId() {
  const candidates = [process.env.BOLT_AGENT_ID, process.env.N8N_AGENT_ID, process.env.AGENT_ID, os.hostname()];

  for (const candidate of candidates) {
    const normalized = normalizeAgentId(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return 'agent-unknown';
}

function buildAgenticHandoff(next, objectives, agentId) {
  const topOpenTask = next?.taskId || '';

  return {
    agentId,
    taskId: topOpenTask,
    openCount: objectives.filter((item) => item.status === 'PARTIAL' || item.status === 'TODO').length,
    closurePolicy: 'Keep PARTIAL until fully complete; use done only with --confirm-complete after all remaining work is finished.',
    commands: {
      start: 'pnpm run ongoing:bridge -- prompt',
      keepPartial: topOpenTask
        ? `pnpm run ongoing:cycle -- partial "[taskId: ${topOpenTask}] ..."`
        : 'pnpm run ongoing:cycle -- partial "[taskId: <id>] ..."',
      closeDone: topOpenTask
        ? `pnpm run ongoing:cycle -- done --confirm-complete "[taskId: ${topOpenTask}] ..."`
        : 'pnpm run ongoing:cycle -- done --confirm-complete "[taskId: <id>] ..."',
      next: 'pnpm run ongoing:bridge -- prompt',
    },
  };
}

function toCopilotPrompt(next, objectives, agentId) {
  if (!next) {
    return 'No PARTIAL/TODO objective found in .ongoing-work.md.';
  }

  const shortlist = objectives
    .filter((item) => item.status === 'PARTIAL' || item.status === 'TODO')
    .slice(0, 4)
    .map((item, index) => `${index + 1}. [${item.priority}] ${item.status}${item.taskId ? ` (${item.taskId})` : ''} ${item.text}`)
    .join('\n');
  const returnAddress = resolveRuntimeReturnAddress();
  const callbackUrl = returnAddress.callbackUrl || 'not-configured';

  return [
    'Continue execution from .ongoing-work.md using this next objective:',
    `[${next.priority}] ${next.status}${next.taskId ? ` (${next.taskId})` : ''} ${next.text}`,
    `Agent: ${agentId}`,
    'Execution policy: keep objective in PARTIAL until fully complete; only then close with done --confirm-complete.',
    `CallbackUrl: ${callbackUrl}`,
    `ReturnAddress: ${JSON.stringify(returnAddress)}`,
    'Reporting policy: in updates/final handoff, always inform callbackUrl and returnAddress explicitly.',
    '',
    'Top open objectives:',
    shortlist,
    '',
    'Update .ongoing-work.md before and after actions; move completed items to changelog.md.',
  ].join('\n');
}

function emitPayloadFiles(next, objectives) {
  const outDir = resolve('bolt.work/n8n/copilot-inbox');
  const timestamp = new Date().toISOString();
  const agentId = resolveAgentId();
  const prompt = toCopilotPrompt(next, objectives, agentId);
  const handoff = buildAgenticHandoff(next, objectives, agentId);

  const payload = {
    generatedAt: timestamp,
    source: FILE_PATH,
    agentId,
    next,
    objectives,
    handoff,
    prompt,
  };

  mkdirSync(outDir, { recursive: true });

  const jsonPath = resolve(outDir, 'latest.json');
  const promptPath = resolve(outDir, 'latest-prompt.md');

  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  writeFileSync(promptPath, `${prompt}\n`, 'utf8');

  return {
    jsonPath,
    promptPath,
    generatedAt: timestamp,
  };
}

function main() {
  const rawCommand = process.argv[2] || 'json';
  const command = String(rawCommand).replace(/^--/, '');
  const markdown = readFileSync(FILE_PATH, 'utf8');
  const objectives = extractObjectives(markdown);
  const next = selectNextObjective(objectives);
  const agentId = resolveAgentId();
  const handoff = buildAgenticHandoff(next, objectives, agentId);

  if (command === 'next') {
    if (!next) {
      console.log('NONE');
      return;
    }

    console.log(`[${next.priority}] ${next.status} ${next.text}`);
    return;
  }

  if (command === 'prompt') {
    console.log(toCopilotPrompt(next, objectives, agentId));
    return;
  }

  if (command === 'json') {
    console.log(
      JSON.stringify(
        {
          source: FILE_PATH,
          agentId,
          next,
          objectives,
          handoff,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'emit') {
    const emitted = emitPayloadFiles(next, objectives);

    console.log(
      JSON.stringify(
        {
          source: FILE_PATH,
          next,
          emitted,
        },
        null,
        2,
      ),
    );
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

try {
  main();
} catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  console.error(`ongoing-work-bridge error: ${details}`);
  process.exit(1);
}
