#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const FILE_PATH = resolve('.ongoing-work.md');
const LOOP_STATE = resolve('.n8n-ongoing-cycle.json');
const LOOP_LOG = resolve('bolt.work/n8n/copilot-inbox/cycle.log');
const ORCHESTRATOR_STATE = resolve('.n8n-dev-workflows.json');
const ORCHESTRATION_STATS_FILE = resolve('bolt.work/n8n/orchestration-stats.latest.json');
const OPEN_TASKS_FALLBACK_FILE = resolve('bolt.work/n8n/open-tasks-table.json');
const TASK_STATUS_TABLE_MAX_ROWS = 100;
const EMPTY_SCAN_STOP_THRESHOLD = 2;
const TASK_ID_PREFIX_PATTERN = /^\[taskId:\s*([a-zA-Z0-9._:-]+)\]\s*(.*)$/i;

function readMarkdown() {
  return readFileSync(FILE_PATH, 'utf8');
}

function parseObjectives(markdown) {
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

    const entry = line.match(/^\s*-\s*`(PARTIAL|TODO|BLOCKED)`\s+(.+)$/);

    if (!entry) {
      continue;
    }

    const taskIdMatch = entry[2].trim().match(TASK_ID_PREFIX_PATTERN);
    const taskId = taskIdMatch ? taskIdMatch[1] : '';
    const objectiveText = taskIdMatch ? taskIdMatch[2].trim() : entry[2].trim();

    if (/^none\.?$/i.test(objectiveText)) {
      continue;
    }

    objectives.push({
      priority: currentPriority || 'UNSPECIFIED',
      status: entry[1],
      taskId,
      text: objectiveText,
    });
  }

  return objectives;
}

function readOrchestrationPolicy(markdown) {
  const lines = markdown.split(/\r?\n/);
  let inSection = false;
  let mode = 'REQUIRED';
  let exception = 'OFF';
  let reason = '';

  for (const line of lines) {
    if (line.startsWith('## Orchestration Enforcement')) {
      inSection = true;
      continue;
    }

    if (inSection && line.startsWith('## ') && !line.startsWith('## Orchestration Enforcement')) {
      break;
    }

    if (!inSection) {
      continue;
    }

    const modeMatch = line.match(/^\s*-\s*Mode:\s*(REQUIRED|EXCEPTION)\s*$/i);

    if (modeMatch) {
      mode = modeMatch[1].toUpperCase();
      continue;
    }

    const exceptionMatch = line.match(/^\s*-\s*Exception:\s*(ON|OFF)\s*$/i);

    if (exceptionMatch) {
      exception = exceptionMatch[1].toUpperCase();
      continue;
    }

    const reasonMatch = line.match(/^\s*-\s*ExceptionReason:\s*(.*)$/i);

    if (reasonMatch) {
      reason = reasonMatch[1].trim();
    }
  }

  const exceptionEnabled = mode === 'EXCEPTION' || exception === 'ON';

  return {
    mode,
    exception: exceptionEnabled ? 'ON' : 'OFF',
    exceptionEnabled,
    exceptionReason: reason,
  };
}

function nextObjective(objectives) {
  return objectives.find((item) => item.status === 'PARTIAL') || objectives.find((item) => item.status === 'TODO') || null;
}

function loadState() {
  if (!existsSync(LOOP_STATE)) {
    return { completed: [], emptyScanStreak: 0, cycleStopRecommended: false };
  }

  const parsed = JSON.parse(readFileSync(LOOP_STATE, 'utf8'));
  return {
    completed: Array.isArray(parsed.completed) ? parsed.completed : [],
    emptyScanStreak: Number.isInteger(parsed.emptyScanStreak) ? parsed.emptyScanStreak : 0,
    cycleStopRecommended: Boolean(parsed.cycleStopRecommended),
  };
}

function saveState(state) {
  writeFileSync(LOOP_STATE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function updateCycleGuardState(state, { hasOpenObjectives, command }) {
  if (hasOpenObjectives) {
    state.emptyScanStreak = 0;
    state.cycleStopRecommended = false;
    return {
      emptyScanStreak: state.emptyScanStreak,
      cycleStopRecommended: state.cycleStopRecommended,
    };
  }

  if (command === 'scan') {
    state.emptyScanStreak = Math.max(0, Number(state.emptyScanStreak || 0)) + 1;
  } else {
    state.emptyScanStreak = 0;
  }

  state.cycleStopRecommended = state.emptyScanStreak >= EMPTY_SCAN_STOP_THRESHOLD;

  return {
    emptyScanStreak: state.emptyScanStreak,
    cycleStopRecommended: state.cycleStopRecommended,
  };
}

function toSlotKey(index) {
  return `slot-${String(index).padStart(3, '0')}`;
}

function sanitizeRefPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function loadCompletedEntries() {
  const state = loadState();
  return Array.isArray(state.completed) ? state.completed : [];
}

function buildTaskStatusTableRows(objectives, measuredAt) {
  const activeRows = objectives
    .filter((item) => item.status === 'PARTIAL' || item.status === 'TODO' || item.status === 'BLOCKED')
    .map((item, index) => ({
      taskRef:
        item.taskId && item.taskId.trim().length > 0
          ? `active-${sanitizeRefPart(item.taskId)}`
          : `active-${sanitizeRefPart(item.priority)}-${index + 1}-${sanitizeRefPart(item.text)}`,
      priority: item.priority,
      status: item.status,
      objective: item.text,
      isActive: item.status !== 'BLOCKED',
      rowType: item.status === 'BLOCKED' ? 'blocked' : 'active',
      completedAt: '',
      updatedAt: measuredAt,
    }));

  const completedRows = loadCompletedEntries()
    .slice()
    .sort((a, b) => {
      const aTime = Date.parse(a?.completedAt || '') || 0;
      const bTime = Date.parse(b?.completedAt || '') || 0;
      return bTime - aTime;
    })
    .map((item, index) => ({
      taskRef: `completed-${index + 1}-${sanitizeRefPart(item?.text || '')}`,
      priority: 'P0',
      status: 'COMPLETED',
      objective: String(item?.text || '').trim(),
      isActive: false,
      rowType: 'completed',
      completedAt: item?.completedAt || measuredAt,
      updatedAt: measuredAt,
    }));

  const selected = [...activeRows, ...completedRows].slice(0, TASK_STATUS_TABLE_MAX_ROWS);
  const padded = [];

  for (let index = 0; index < TASK_STATUS_TABLE_MAX_ROWS; index++) {
    const source = selected[index];

    if (source) {
      padded.push({
        taskKey: toSlotKey(index + 1),
        slotIndex: index + 1,
        ...source,
      });
      continue;
    }

    padded.push({
      taskKey: toSlotKey(index + 1),
      slotIndex: index + 1,
      taskRef: '',
      priority: '',
      status: 'EMPTY',
      objective: '',
      isActive: false,
      rowType: 'placeholder',
      completedAt: '',
      updatedAt: measuredAt,
    });
  }

  return padded;
}

function buildCheckupTable(eventType, nextObjectiveItem, measuredAt) {
  const checkupId = `checkup-${Date.now()}`;
  const linkedTaskRef = nextObjectiveItem
    ? nextObjectiveItem.taskId && nextObjectiveItem.taskId.trim().length > 0
      ? `active-${sanitizeRefPart(nextObjectiveItem.taskId)}`
      : `active-${sanitizeRefPart(nextObjectiveItem.priority)}-${sanitizeRefPart(nextObjectiveItem.text)}`
    : 'queue-empty';

  return [
    {
      checkupId,
      linkedTaskRef,
      eventType,
      status: 'STARTED',
      updatedAt: measuredAt,
    },
  ];
}

function buildFailureTable(checkupTable, orchestrationStats, measuredAt) {
  const checkupId = checkupTable[0]?.checkupId || `checkup-${Date.now()}`;

  if (orchestrationStats?.available === false) {
    return [
      {
        failureId: `failure-${checkupId}`,
        checkupId,
        linkedTaskRef: checkupTable[0]?.linkedTaskRef || 'unknown',
        source: 'orchestration-stats',
        failureReason: orchestrationStats.reason || 'stats unavailable',
        detail: orchestrationStats.detail || '',
        updatedAt: measuredAt,
      },
    ];
  }

  if ((orchestrationStats?.failedProductionExecutions || 0) > 0) {
    return [
      {
        failureId: `failure-${checkupId}`,
        checkupId,
        linkedTaskRef: checkupTable[0]?.linkedTaskRef || 'unknown',
        source: 'execution-failures',
        failureReason: `failedProductionExecutions=${orchestrationStats.failedProductionExecutions}`,
        detail: '',
        updatedAt: measuredAt,
      },
    ];
  }

  return [];
}

function logLine(message) {
  mkdirSync(resolve('bolt.work/n8n/copilot-inbox'), { recursive: true });
  appendFileSync(LOOP_LOG, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
}

function persistOrchestrationStats(stats) {
  mkdirSync(resolve('bolt.work', 'n8n'), { recursive: true });
  writeFileSync(ORCHESTRATION_STATS_FILE, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');

  return {
    ...stats,
    statsFile: ORCHESTRATION_STATS_FILE,
  };
}

function persistOpenTasksTable(rows, stats) {
  mkdirSync(resolve('bolt.work', 'n8n'), { recursive: true });

  const payload = {
    tableName: 'Project-bolt2-open-tasks',
    generatedAt: new Date().toISOString(),
    rows,
    stats,
  };

  writeFileSync(OPEN_TASKS_FALLBACK_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return {
    openTasksFile: OPEN_TASKS_FALLBACK_FILE,
  };
}

function validateOpenTaskRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error('openTasksTable must be an array.');
  }

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      throw new Error('openTasksTable entries must be objects.');
    }

    if (!row.taskKey || !row.priority || !row.status || !row.objective) {
      throw new Error('openTasksTable entries must include taskKey, priority, status, and objective.');
    }
  }
}

function assertTaskStatusSemantics(taskStatusTable, openTasksTable) {
  if (!Array.isArray(taskStatusTable) || taskStatusTable.length === 0) {
    throw new Error('taskStatusTable must be a non-empty array.');
  }

  const activeRows = taskStatusTable.filter((row) => row?.rowType === 'active');
  const blockedRows = taskStatusTable.filter((row) => row?.rowType === 'blocked');
  const completedRows = taskStatusTable.filter((row) => row?.rowType === 'completed');
  const placeholderRows = taskStatusTable.filter((row) => row?.rowType === 'placeholder');

  for (const row of activeRows) {
    if (row.isActive !== true) {
      throw new Error(`Active row ${row.taskKey || row.taskRef || 'unknown'} must have isActive=true.`);
    }

    if (row.status !== 'PARTIAL' && row.status !== 'TODO') {
      throw new Error(`Active row ${row.taskKey || row.taskRef || 'unknown'} has invalid status=${row.status}.`);
    }
  }

  for (const row of blockedRows) {
    if (row.isActive !== false) {
      throw new Error(`Blocked row ${row.taskKey || row.taskRef || 'unknown'} must have isActive=false.`);
    }

    if (row.status !== 'BLOCKED') {
      throw new Error(`Blocked row ${row.taskKey || row.taskRef || 'unknown'} has invalid status=${row.status}.`);
    }
  }

  for (const row of completedRows) {
    if (row.isActive !== false) {
      throw new Error(`Completed row ${row.taskKey || row.taskRef || 'unknown'} must have isActive=false.`);
    }

    if (row.status !== 'COMPLETED') {
      throw new Error(`Completed row ${row.taskKey || row.taskRef || 'unknown'} has invalid status=${row.status}.`);
    }
  }

  const firstCompletedIndex = taskStatusTable.findIndex((row) => row?.rowType === 'completed');
  const firstPlaceholderIndex = taskStatusTable.findIndex((row) => row?.rowType === 'placeholder');
  const placeholderStart = firstPlaceholderIndex === -1 ? taskStatusTable.length : firstPlaceholderIndex;

  if (firstCompletedIndex !== -1) {
    for (let index = firstCompletedIndex; index < placeholderStart; index++) {
      if (taskStatusTable[index]?.rowType !== 'completed') {
        throw new Error('Completed rows must be contiguous and appear before placeholders.');
      }
    }
  }

  if (firstPlaceholderIndex !== -1) {
    for (let index = firstPlaceholderIndex; index < taskStatusTable.length; index++) {
      if (taskStatusTable[index]?.rowType !== 'placeholder') {
        throw new Error('Placeholder rows must stay at the end of taskStatusTable.');
      }
    }
  }

  for (let index = 1; index < completedRows.length; index++) {
    const previous = Date.parse(completedRows[index - 1]?.completedAt || '');
    const current = Date.parse(completedRows[index]?.completedAt || '');

    if (Number.isFinite(previous) && Number.isFinite(current) && previous < current) {
      throw new Error('Completed rows must be ordered by completedAt descending (sliding window behavior).');
    }
  }

  const expectedActiveRows = openTasksTable.filter((row) => row.status === 'PARTIAL' || row.status === 'TODO').length;
  const expectedBlockedRows = openTasksTable.filter((row) => row.status === 'BLOCKED').length;

  if (activeRows.length !== expectedActiveRows) {
    throw new Error(`Active row count mismatch: expected=${expectedActiveRows}, actual=${activeRows.length}.`);
  }

  if (blockedRows.length !== expectedBlockedRows) {
    throw new Error(`Blocked row count mismatch: expected=${expectedBlockedRows}, actual=${blockedRows.length}.`);
  }

  return {
    ok: true,
    activeRows: activeRows.length,
    blockedRows: blockedRows.length,
    completedRows: completedRows.length,
    placeholderRows: placeholderRows.length,
  };
}

function buildOpenTasksTableRows(objectives, measuredAt) {
  return objectives
    .filter((item) => item.status === 'PARTIAL' || item.status === 'TODO' || item.status === 'BLOCKED')
    .map((item, index) => ({
      taskKey: item.taskId && item.taskId.trim().length > 0 ? item.taskId.trim() : `${item.priority}-${index + 1}`,
      priority: item.priority,
      status: item.status,
      objective: item.text,
      updatedAt: measuredAt,
    }));
}

function validateStatsPayload(stats) {
  if (!stats || typeof stats !== 'object') {
    throw new Error('orchestrationStats must be an object.');
  }

  if (stats.available === true && !stats.measuredAt) {
    throw new Error('orchestrationStats.available=true requires measuredAt.');
  }

  if (stats.available === false && !stats.reason) {
    throw new Error('orchestrationStats.available=false requires reason.');
  }
}

function bridgeEmit() {
  const result = spawnSync(process.execPath, ['scripts/ongoing-work-bridge.mjs', 'emit'], {
    cwd: resolve('.'),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'bridge emit failed');
  }

  return JSON.parse(result.stdout);
}

function normalizeOngoingWork() {
  const result = spawnSync(process.execPath, ['scripts/ongoing-work-normalize.mjs'], {
    cwd: resolve('.'),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'ongoing-work normalize failed');
  }
}

function loadManagedWorkflowIds() {
  if (!existsSync(ORCHESTRATOR_STATE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(ORCHESTRATOR_STATE, 'utf8'));
    const workflows = parsed && typeof parsed === 'object' ? parsed.workflows : null;

    if (!workflows || typeof workflows !== 'object') {
      return [];
    }

    return Object.values(workflows)
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hasDefinedOrchestrationLayer() {
  if (!existsSync(ORCHESTRATOR_STATE)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(ORCHESTRATOR_STATE, 'utf8'));
    const workflows = parsed && typeof parsed === 'object' ? parsed.workflows : null;

    if (!workflows || typeof workflows !== 'object') {
      return false;
    }

    const entries = Object.values(workflows).filter((item) => item && typeof item === 'object');

    if (entries.length === 0) {
      return false;
    }

    return entries.some((item) => String(item?.id || '').trim().length > 0 && item?.active !== false);
  } catch {
    return false;
  }
}

function enforceOrchestrationDelivery(notifyResult, policy) {
  const orchestrationDefined = hasDefinedOrchestrationLayer();

  if (!orchestrationDefined) {
    return;
  }

  if (policy.exceptionEnabled) {
    logLine(
      `orchestration exception active; bypassing strict delivery check. reason=${policy.exceptionReason || 'not provided'}`,
    );
    return;
  }

  if (!notifyResult?.sent) {
    const reason = notifyResult?.reason || 'unknown-notify-error';
    throw new Error(
      `Orchestration layer is defined and required, but notify failed (${reason}). ` +
        `Fix orchestration delivery or set explicit exception in .ongoing-work.md under '## Orchestration Enforcement' before continuing.`,
    );
  }
}

function durationMs(execution) {
  const started = execution?.startedAt ? Date.parse(execution.startedAt) : NaN;
  const stopped = execution?.stoppedAt ? Date.parse(execution.stoppedAt) : NaN;

  if (!Number.isFinite(started) || !Number.isFinite(stopped) || stopped < started) {
    return 0;
  }

  return stopped - started;
}

async function collectOrchestrationStats() {
  const { baseUrl, apiKey } = getN8nConfig();

  if (!baseUrl || !apiKey) {
    return {
      available: false,
      reason: 'missing endpoint or api key',
    };
  }

  const managedWorkflowIds = new Set(loadManagedWorkflowIds());

  if (managedWorkflowIds.size === 0) {
    return {
      available: false,
      reason: 'no managed workflows deployed yet',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/executions?limit=250`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        available: false,
        reason: `executions api failed: ${response.status}`,
        detail: text.slice(0, 240),
      };
    }

    const payload = await response.json();
    const executions = Array.isArray(payload?.data) ? payload.data : [];

    const managedExecutions = executions.filter((execution) => managedWorkflowIds.has(String(execution?.workflowId || '')));
    const productionExecutions = managedExecutions.filter((execution) => String(execution?.mode || '').toLowerCase() === 'webhook');
    const failedProductionExecutions = productionExecutions.filter(
      (execution) => String(execution?.status || '').toLowerCase() !== 'success',
    );

    const runtimeMs = productionExecutions.map(durationMs).filter((value) => value > 0);
    const totalRuntimeMs = runtimeMs.reduce((sum, value) => sum + value, 0);
    const averageRuntimeMs = runtimeMs.length > 0 ? Math.round(totalRuntimeMs / runtimeMs.length) : 0;
    const failureRatePercent =
      productionExecutions.length > 0
        ? Number(((failedProductionExecutions.length / productionExecutions.length) * 100).toFixed(2))
        : 0;

    // --- Custom: 30 min saved per successful full round ---
    // Count successful full rounds (all open objectives completed in a cycle)
    // For now, treat each successful production execution as a round (if more logic needed, adjust here)
    const minutesSavedPerRound = 30;
    const successfulRounds = productionExecutions.length - failedProductionExecutions.length;
    const estimatedTimeSavedMinutes = Math.max(0, successfulRounds * minutesSavedPerRound);

    return {
      available: true,
      sampledExecutions: executions.length,
      managedExecutions: managedExecutions.length,
      productionExecutions: productionExecutions.length,
      failedProductionExecutions: failedProductionExecutions.length,
      failureRatePercent,
      averageRuntimeMs,
      estimatedTimeSavedMinutes,
      minutesSavedPerRound,
      successfulRounds,
      manualMinutesPerRun: 6,
      measuredAt: new Date().toISOString(),
      note: 'Each successful full rotation of project-bolt2-ongoing-work-dispatch saves 30 min as orchestrated.'
    };
  } catch (error) {
    return {
      available: false,
      reason: 'stats collection error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function getN8nConfig() {
  const endpoint = process.env.N8N_BASE_URL || process.env.n8n_Arvekari_endpoint || '';
  const explicitWebhookBase = process.env.N8N_WEBHOOK_BASE_URL || process.env.n8n_Arvekari_webhookEndpoint || '';
  const apiKey = process.env.N8N_API_KEY || process.env.n8n_Arvekari_ApiKey || '';

  const normalizedEndpoint = endpoint.trim().replace(/\/$/, '');
  const normalizedWebhook = explicitWebhookBase.trim().replace(/\/$/, '');
  const webhookCandidates = new Set();

  if (normalizedWebhook) {
    webhookCandidates.add(normalizedWebhook);
  }

  if (normalizedEndpoint) {
    webhookCandidates.add(normalizedEndpoint);
    webhookCandidates.add(normalizedEndpoint.replace(/\/api(?:\/v\d+)?$/i, ''));
  }

  const webhookBaseUrls = Array.from(webhookCandidates).filter(Boolean);

  return {
    baseUrl: normalizedEndpoint,
    webhookBaseUrls,
    apiKey: apiKey.trim(),
  };
}

async function notifyN8n(eventType, payload) {
  const { baseUrl, webhookBaseUrls, apiKey } = getN8nConfig();

  if (!baseUrl && webhookBaseUrls.length === 0) {
    return { sent: false, reason: 'missing endpoint' };
  }

  // Detect model from environment or payload
  const model = process.env.OPENAI_MODEL || process.env.MODEL || (payload && payload.model) || '';
  const isGpt41 = typeof model === 'string' && model.toLowerCase().includes('gpt-4.1');

  // If model is GPT-4.1, always require the receiving party to act (managed/physical changes)
  if (isGpt41) {
    payload.orchestratorInstruction = 'Model is GPT-4.1: Receiving party MUST perform the required managed work or physical changes, even if not triggered manually.';
    payload.responseFormat = {
      required: true,
      fields: ['status', 'workflow', 'action', 'queueState', 'commands'],
    };
  }

  const body = {
    eventType,
    emittedAt: new Date().toISOString(),
    payload,
  };

  const pathTargets = [
    '/webhook/ongoing-work-dispatch',
    '/webhook/ci-publish-watch-sync',
    '/webhook-prod/ongoing-work-dispatch',
    '/webhook-prod/ci-publish-watch-sync',
  ];

  const attempts = [];

  for (const baseUrlCandidate of webhookBaseUrls) {
    for (const target of pathTargets) {
      const targetUrl = `${baseUrlCandidate}${target}`;
      attempts.push(targetUrl);

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-N8N-API-KEY': apiKey } : {}),
          },
          body: JSON.stringify(body),
        });

        const text = await response.text();
        const parsed = (() => {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        })();

        if (response.ok) {
          return { sent: true, target, targetUrl, status: response.status, body: parsed };
        }

        const bodySnippet = typeof parsed === 'string' ? parsed.slice(0, 180) : JSON.stringify(parsed).slice(0, 180);
        logLine(`n8n notify ${targetUrl} failed status=${response.status} body=${bodySnippet}`);
      } catch (error) {
        logLine(`n8n notify ${targetUrl} error=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    sent: false,
    reason: 'all webhook targets failed',
    attemptedTargets: attempts,
  };
}

function normalizeDispatchResponse(responseBody) {
  if (!responseBody || typeof responseBody !== 'object' || Array.isArray(responseBody)) {
    return null;
  }

  const candidate =
    responseBody.response && typeof responseBody.response === 'object' && !Array.isArray(responseBody.response)
      ? responseBody.response
      : responseBody;

  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;
}

function translateLegacyDispatchResponse(raw, hasOpenObjectives) {
  const queueIsEmptyByLegacySignals =
    String(raw?.jobPulse || '').trim() === 'start-new-ongoing-check-job' ||
    (typeof raw?.restartCommand === 'string' && raw.restartCommand.trim().length > 0);

  const queueState = hasOpenObjectives && !queueIsEmptyByLegacySignals ? 'open' : 'empty';
  const action = queueState === 'empty' ? 'restart-cycle' : 'continue-objective';
  const commands =
    action === 'restart-cycle'
      ? [{ type: 'cycle.restart', command: (raw?.restartCommand || 'pnpm run ongoing:cycle -- scan').trim() }]
      : [{ type: 'objective.executeNext' }];

  return {
    status: typeof raw?.status === 'string' && raw.status.trim().length > 0 ? raw.status.trim() : 'accepted',
    workflow: typeof raw?.workflow === 'string' && raw.workflow.trim().length > 0 ? raw.workflow.trim() : 'ongoing-work-dispatch',
    action,
    queueState,
    commands,
    translatedFromLegacy: true,
  };
}

function resolveStructuredDispatchResponse(responseBody, hasOpenObjectives) {
  const raw = normalizeDispatchResponse(responseBody);

  if (!raw) {
    return {
      status: 'accepted',
      workflow: 'ongoing-work-dispatch',
      action: hasOpenObjectives ? 'continue-objective' : 'restart-cycle',
      queueState: hasOpenObjectives ? 'open' : 'empty',
      commands: hasOpenObjectives
        ? [{ type: 'objective.executeNext' }]
        : [{ type: 'cycle.restart', command: 'pnpm run ongoing:cycle -- scan' }],
      translatedFromLegacy: false,
    };
  }

  const hasStructuredFields =
    typeof raw?.action === 'string' &&
    typeof raw?.queueState === 'string' &&
    Array.isArray(raw?.commands) &&
    raw.commands.length > 0;

  if (hasStructuredFields) {
    return {
      status: typeof raw?.status === 'string' && raw.status.trim().length > 0 ? raw.status.trim() : 'accepted',
      workflow: typeof raw?.workflow === 'string' && raw.workflow.trim().length > 0 ? raw.workflow.trim() : 'ongoing-work-dispatch',
      action: raw.action,
      queueState: raw.queueState,
      commands: raw.commands,
      translatedFromLegacy: false,
    };
  }

  return translateLegacyDispatchResponse(raw, hasOpenObjectives);
}

function buildNextRequest(nextObjectiveItem, notified, cycleGuard = { emptyScanStreak: 0, cycleStopRecommended: false }) {
  const hasOpenObjectives = Boolean(nextObjectiveItem);
  const structured = resolveStructuredDispatchResponse(notified?.body, hasOpenObjectives);

  const model = process.env.OPENAI_MODEL || process.env.MODEL || '';
  const isGpt41 = typeof model === 'string' && model.toLowerCase().includes('gpt-4.1');

  if (nextObjectiveItem) {
    return {
      message: `Execute objective: [${nextObjectiveItem.priority}] ${nextObjectiveItem.status} ${nextObjectiveItem.text}`,
      finalRemark: 'After finishing this objective, notify done and request the next one from the queue.',
      orchestrationPulse: {
        jobPulse: structured.queueState === 'empty' ? 'start-new-ongoing-check-job' : 'continue-current-ongoing-job',
        restartCommand: structured.queueState === 'empty' ? 'pnpm run ongoing:cycle -- scan' : '',
        reason: structured.queueState === 'empty' ? 'Queue drained in this cycle; restart as a new job.' : 'Unfinished objectives remain in queue.',
      },
      response: {
        ...structured,
        gpt41RequiresAction: isGpt41,
      },
      cycleGuard,
    };
  }

  if (cycleGuard.cycleStopRecommended) {
    return {
      message: 'No unfinished objectives detected for two consecutive scan cycles.',
      finalRemark: 'Stop this check job now. If new unfinished work appears later, run a new cycle start command.',
      orchestrationPulse: {
        jobPulse: 'stop-ongoing-check-job',
        restartCommand: '',
        reason: `Queue remained empty for ${cycleGuard.emptyScanStreak} consecutive scans; stopping until new work appears.`,
      },
      response: {
        ...structured,
        action: 'stop-cycle',
        queueState: 'empty',
        commands: [{ type: 'cycle.stop' }],
        gpt41RequiresAction: isGpt41,
      },
      cycleGuard,
    };
  }

  return {
    message: 'All listed unfinished objectives appear completed.',
    finalRemark: 'Please check .ongoing-work.md again for newly added unfinished work and restart the cycle if found.',
    orchestrationPulse: {
      jobPulse: 'start-new-ongoing-check-job',
      restartCommand: 'pnpm run ongoing:cycle -- scan',
      reason: 'Queue drained in this cycle; start a fresh check as a new orchestration job.',
    },
    response: {
      ...structured,
      gpt41RequiresAction: isGpt41,
    },
    cycleGuard,
  };
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function commandNext() {
  normalizeOngoingWork();
  const state = loadState();
  const markdown = readMarkdown();
  const policy = readOrchestrationPolicy(markdown);
  const objectives = parseObjectives(markdown);
  const actionableObjectives = objectives.filter((item) => item.status !== 'BLOCKED');
  const next = nextObjective(actionableObjectives);
  const cycleGuard = updateCycleGuardState(state, { hasOpenObjectives: Boolean(next), command: 'next' });
  saveState(state);
  const emitted = bridgeEmit();
  const orchestrationStats = persistOrchestrationStats(await collectOrchestrationStats());
  const measuredAt = orchestrationStats.measuredAt || new Date().toISOString();
  const openTasksTable = buildOpenTasksTableRows(objectives, measuredAt);
  const taskStatusTable = buildTaskStatusTableRows(objectives, measuredAt);
  const checkupTable = buildCheckupTable('objective.next', next, measuredAt);
  const failureTable = buildFailureTable(checkupTable, orchestrationStats, measuredAt);
  const rowSemantics = assertTaskStatusSemantics(taskStatusTable, openTasksTable);
  validateStatsPayload(orchestrationStats);
  validateOpenTaskRows(openTasksTable);
  const openTasksPersisted = persistOpenTasksTable(openTasksTable, orchestrationStats);
  const notify = await notifyN8n('objective.next', {
    next,
    openCount: openTasksTable.length,
    emitted,
    openTasksTable,
    orchestrationStats,
    taskStatusTable,
    checkupTable,
    failureTable,
    rowSemantics,
  });
  enforceOrchestrationDelivery(notify, policy);
  const request = buildNextRequest(next, notify, cycleGuard);

  printJson({
    action: 'next',
    next,
    openCount: openTasksTable.length,
    emitted,
    notified: notify,
    request,
    orchestrationStats,
    openTasksTable,
    taskStatusTable,
    checkupTable,
    failureTable,
    rowSemantics,
    cycleGuard,
    orchestrationPolicy: policy,
    ...openTasksPersisted,
  });
}

async function commandDone(args) {
  normalizeOngoingWork();
  const state = loadState();
  const text = args.join(' ').trim();

  if (!text) {
    throw new Error('done requires objective text, e.g. pnpm run ongoing:cycle -- done "objective text"');
  }

  state.completed.push({
    text,
    completedAt: new Date().toISOString(),
  });
  const markdown = readMarkdown();
  const policy = readOrchestrationPolicy(markdown);
  const objectives = parseObjectives(markdown);
  const actionableObjectives = objectives.filter((item) => item.status !== 'BLOCKED');
  const next = nextObjective(actionableObjectives);
  const cycleGuard = updateCycleGuardState(state, { hasOpenObjectives: Boolean(next), command: 'done' });
  saveState(state);
  const emitted = bridgeEmit();
  const orchestrationStats = persistOrchestrationStats(await collectOrchestrationStats());
  const measuredAt = orchestrationStats.measuredAt || new Date().toISOString();
  const openTasksTable = buildOpenTasksTableRows(objectives, measuredAt);
  const taskStatusTable = buildTaskStatusTableRows(objectives, measuredAt);
  const checkupTable = buildCheckupTable('objective.done', next, measuredAt);
  const failureTable = buildFailureTable(checkupTable, orchestrationStats, measuredAt);
  const rowSemantics = assertTaskStatusSemantics(taskStatusTable, openTasksTable);
  validateStatsPayload(orchestrationStats);
  validateOpenTaskRows(openTasksTable);
  const openTasksPersisted = persistOpenTasksTable(openTasksTable, orchestrationStats);
  const notify = await notifyN8n('objective.done', {
    done: text,
    next,
    openCount: openTasksTable.length,
    emitted,
    openTasksTable,
    orchestrationStats,
    taskStatusTable,
    checkupTable,
    failureTable,
    rowSemantics,
  });
  enforceOrchestrationDelivery(notify, policy);
  const request = buildNextRequest(next, notify, cycleGuard);

  printJson({
    action: 'done',
    done: text,
    next,
    openCount: openTasksTable.length,
    completedCount: state.completed.length,
    emitted,
    notified: notify,
    request,
    orchestrationStats,
    openTasksTable,
    taskStatusTable,
    checkupTable,
    failureTable,
    rowSemantics,
    cycleGuard,
    orchestrationPolicy: policy,
    ...openTasksPersisted,
  });
}

async function commandLoop() {
  normalizeOngoingWork();
  const state = loadState();
  const markdown = readMarkdown();
  const policy = readOrchestrationPolicy(markdown);
  const objectives = parseObjectives(markdown);
  const actionableObjectives = objectives.filter((item) => item.status === 'PARTIAL' || item.status === 'TODO');
  const next = nextObjective(actionableObjectives);
  const cycleGuard = updateCycleGuardState(state, { hasOpenObjectives: Boolean(next), command: 'scan' });
  saveState(state);
  const emitted = bridgeEmit();
  const orchestrationStats = persistOrchestrationStats(await collectOrchestrationStats());
  const measuredAt = orchestrationStats.measuredAt || new Date().toISOString();
  const openTasksTable = buildOpenTasksTableRows(objectives, measuredAt);
  const taskStatusTable = buildTaskStatusTableRows(objectives, measuredAt);
  const checkupTable = buildCheckupTable('objective.scan', next, measuredAt);
  const failureTable = buildFailureTable(checkupTable, orchestrationStats, measuredAt);
  const rowSemantics = assertTaskStatusSemantics(taskStatusTable, openTasksTable);
  validateStatsPayload(orchestrationStats);
  validateOpenTaskRows(openTasksTable);
  const openTasksPersisted = persistOpenTasksTable(openTasksTable, orchestrationStats);
  const notify = await notifyN8n('objective.scan', {
    openCount: openTasksTable.length,
    emitted,
    openTasksTable,
    orchestrationStats,
    taskStatusTable,
    checkupTable,
    failureTable,
    rowSemantics,
  });
  enforceOrchestrationDelivery(notify, policy);
  const request = buildNextRequest(next, notify, cycleGuard);

  printJson({
    action: 'loop-scan',
    openCount: openTasksTable.length,
    hasOpenObjectives: openTasksTable.length > 0,
    emitted,
    notified: notify,
    request,
    orchestrationStats,
    openTasksTable,
    taskStatusTable,
    checkupTable,
    failureTable,
    rowSemantics,
    cycleGuard,
    orchestrationPolicy: policy,
    ...openTasksPersisted,
  });
}

async function commandAssert() {
  normalizeOngoingWork();
  const markdown = readMarkdown();
  const objectives = parseObjectives(markdown);
  const orchestrationStats = persistOrchestrationStats(await collectOrchestrationStats());
  const measuredAt = orchestrationStats.measuredAt || new Date().toISOString();
  const openTasksTable = buildOpenTasksTableRows(objectives, measuredAt);
  const taskStatusTable = buildTaskStatusTableRows(objectives, measuredAt);
  validateStatsPayload(orchestrationStats);
  validateOpenTaskRows(openTasksTable);
  const rowSemantics = assertTaskStatusSemantics(taskStatusTable, openTasksTable);

  printJson({
    action: 'assert',
    assertions: {
      rowSemantics,
    },
    openCount: openTasksTable.length,
    orchestrationStats,
  });
}

async function main() {
  const [command = 'next', ...rest] = process.argv.slice(2);

  if (command === 'next') {
    await commandNext();
    return;
  }

  if (command === 'done') {
    await commandDone(rest);
    return;
  }

  if (command === 'scan') {
    await commandLoop();
    return;
  }

  if (command === 'assert') {
    await commandAssert();
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`n8n-ongoing-cycle error: ${message}`);
  process.exit(1);
});
