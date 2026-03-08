#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STATE_FILE = resolve('.n8n-dev-workflows.json');
const WORKFLOW_PREFIX = 'Project-bolt2-';
const ONGOING_WORK_FILE = resolve('.ongoing-work.md');
const WORKFLOW_REPO_ROOT = resolve('..', 'n8n');
const WORKFLOW_REPO_ACTIVE_DIR = resolve(WORKFLOW_REPO_ROOT, 'active');
const WORKFLOW_REPO_RETIRED_DIR = resolve(WORKFLOW_REPO_ROOT, 'retired');
const RETIRED_WORKFLOW_NAMES = ['overnight-ongoing-work-loop', 'Project-bolt2-overnight-ongoing-work-loop'];
const DEFAULT_OPEN_TASKS_TABLE_NAME = 'Project-bolt2-open-tasks';
const OPEN_TASKS_FALLBACK_FILE = resolve('bolt.work', 'n8n', 'open-tasks-table.json');
const ORCHESTRATION_STATS_FILE = resolve('bolt.work', 'n8n', 'orchestration-stats.latest.json');

const WORKFLOWS = [
  {
    key: 'ongoing-work-dispatch',
    name: 'Project-bolt2-ongoing-work-dispatch',
    webhookPath: 'ongoing-work-dispatch',
    purpose:
      'Receives ongoing-work objective events and returns next-action guidance for iterative execution until no unfinished objectives remain.',
    definition: {
      name: 'Project-bolt2-ongoing-work-dispatch',
      nodes: [
        {
          id: 'node-ongoing-dispatch-webhook',
          name: 'Ongoing Work Dispatch Webhook',
          webhookId: 'project-bolt2-ongoing-work-dispatch',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [320, 260],
          parameters: {
            path: 'ongoing-work-dispatch',
            httpMethod: 'POST',
            responseMode: 'lastNode',
          },
        },
        {
          id: 'node-ongoing-dispatch-ack',
          name: 'Ongoing Work Dispatch Ack',
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [620, 260],
          parameters: {
            keepOnlySet: false,
            values: {
              string: [
                {
                  name: 'status',
                  value: 'accepted',
                },
                {
                  name: 'workflow',
                  value: 'ongoing-work-dispatch',
                },
                {
                  name: 'action',
                  value:
                    "={{ (((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? 'restart-cycle' : 'continue-objective') }}",
                },
                {
                  name: 'queueState',
                  value:
                    "={{ (((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? 'empty' : 'open') }}",
                },
                {
                  name: 'jobPulse',
                  value:
                    "={{ (((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? 'start-new-ongoing-check-job' : 'continue-current-job') }}",
                },
                {
                  name: 'restartCommand',
                  value:
                    "={{ (((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? 'pnpm run ongoing:cycle -- scan' : '') }}",
                },
                {
                  name: 'nextAction',
                  value:
                    "={{ (((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? 'Start a new ongoing-work check job immediately' : 'Continue current objective execution') }}",
                },
                {
                  name: 'finalRemark',
                  value:
                    "={{ (((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? 'Trigger a fresh ongoing-work scan as a new job' : 'Proceed with the current queued objective') }}",
                },
                {
                  name: 'commandsJson',
                  value:
                    "={{ JSON.stringify((((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? [{ type: 'cycle.restart', command: 'pnpm run ongoing:cycle -- scan' }] : [{ type: 'objective.executeNext' }])) }}",
                },
              ],
            },
          },
        },
        {
          id: 'node-upsert-open-tasks-table',
          name: 'Upsert Open Tasks Table',
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [900, 260],
          parameters: {
            keepOnlySet: false,
            values: {
              string: [
                {
                  name: 'openTasksTableFlowStatus',
                  value: "={{ ((($json.payload || {}).openTasksTable || (($json.body || {}).payload || {}).openTasksTable) ? 'payload-ready' : 'payload-missing') }}",
                },
              ],
            },
          },
        },
        {
          id: 'node-upsert-orchestration-stats',
          name: 'Upsert Orchestration Stats',
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [1100, 260],
          parameters: {
            keepOnlySet: false,
            values: {
              string: [
                {
                  name: 'orchestrationStatsFlowStatus',
                  value: "={{ ((($json.payload || {}).orchestrationStats || (($json.body || {}).payload || {}).orchestrationStats) ? 'payload-ready' : 'payload-missing') }}",
                },
              ],
            },
          },
        },
      ],
      connections: {
        'Ongoing Work Dispatch Webhook': {
          main: [
            [
              {
                node: 'Ongoing Work Dispatch Ack',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Ongoing Work Dispatch Ack': {
          main: [
            [
              {
                node: 'Upsert Open Tasks Table',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Upsert Open Tasks Table': {
          main: [
            [
              {
                node: 'Upsert Orchestration Stats',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
      },
      settings: {},
    },
    aliases: ['ongoing-work-dispatch', 'Project-bolt2-ongoing-work-dispatch'],
  },
  {
    key: 'ongoing-work-dispatch-data-table',
    name: 'Project-bolt2-ongoing-work-dispatch-data-table',
    webhookPath: 'ongoing-work-dispatch-data-table',
    purpose:
      'Native Data Table variant: writes one row per open task to Data Tables using workflow nodes for UI-visible orchestration state.',
    activateOnDeploy: false,
    definition: {
      name: 'Project-bolt2-ongoing-work-dispatch-data-table',
      nodes: [
        {
          id: 'node-ongoing-dispatch-dt-webhook',
          name: 'Ongoing Work Dispatch DataTable Webhook',
          webhookId: 'project-bolt2-ongoing-work-dispatch-data-table',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [320, 460],
          parameters: {
            path: 'ongoing-work-dispatch-data-table',
            httpMethod: 'POST',
            responseMode: 'lastNode',
          },
        },
        {
          id: 'node-ongoing-dispatch-dt-ack',
          name: 'Ongoing Work Dispatch DataTable Ack',
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [620, 460],
          parameters: {
            keepOnlySet: false,
            values: {
              string: [
                {
                  name: 'status',
                  value: 'accepted',
                },
                {
                  name: 'workflow',
                  value: 'ongoing-work-dispatch-data-table',
                },
                {
                  name: 'action',
                  value:
                    "={{ (((($json.payload || {}).openCount ?? (($json.body || {}).payload || {}).openCount) === 0) ? 'restart-cycle' : 'continue-objective') }}",
                },
              ],
            },
          },
        },
        {
          id: 'node-upsert-open-tasks-data-table',
          name: 'Upsert Open Tasks DataTable',
          type: 'n8n-nodes-base.dataTable',
          typeVersion: 1,
          position: [900, 460],
          parameters: {
            operation: 'upsert',
            table: 'Project-bolt2-open-tasks',
            data: '={{ ($json.payload || {}).openTasksTable || (($json.body || {}).payload || {}).openTasksTable || [] }}',
            key: 'taskKey',
          },
        },
        {
          id: 'node-upsert-orchestration-stats-data-table',
          name: 'Upsert Orchestration Stats DataTable',
          type: 'n8n-nodes-base.dataTable',
          typeVersion: 1,
          position: [1120, 460],
          parameters: {
            operation: 'upsert',
            table: 'Project-bolt2-orchestration-stats',
            data: '={{ [($json.payload || {}).orchestrationStats || (($json.body || {}).payload || {}).orchestrationStats].filter(Boolean) }}',
            key: 'measuredAt',
          },
        },
      ],
      connections: {
        'Ongoing Work Dispatch DataTable Webhook': {
          main: [
            [
              {
                node: 'Ongoing Work Dispatch DataTable Ack',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Ongoing Work Dispatch DataTable Ack': {
          main: [
            [
              {
                node: 'Upsert Open Tasks DataTable',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Upsert Open Tasks DataTable': {
          main: [
            [
              {
                node: 'Upsert Orchestration Stats DataTable',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
      },
      settings: {},
    },
    aliases: ['ongoing-work-dispatch-data-table', 'Project-bolt2-ongoing-work-dispatch-data-table'],
  },
  {
    key: 'task-orchestrator-queue',
    name: 'Project-bolt2-task-orchestrator-queue',
    webhookPath: 'bolt2-task-orchestrator',
    purpose:
      'Data Table backed task queue: upsert incoming task rows, mark completed tasks, select highest-priority open task, return next task response.',
    activateOnDeploy: false,
    definition: {
      name: 'Project-bolt2-task-orchestrator-queue',
      nodes: [
        {
          id: 'node-task-queue-webhook',
          name: 'Task Queue Webhook',
          webhookId: 'project-bolt2-task-orchestrator-queue',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [260, 680],
          parameters: {
            path: 'bolt2-task-orchestrator',
            httpMethod: 'POST',
            responseMode: 'lastNode',
          },
        },
        {
          id: 'node-has-completed-task',
          name: 'Completed Task?',
          type: 'n8n-nodes-base.if',
          typeVersion: 1,
          position: [500, 680],
          parameters: {
            conditions: {
              string: [
                {
                  value1: '={{ $json.body.completedTaskId || "" }}',
                  operation: 'notEqual',
                  value2: '',
                },
              ],
            },
          },
        },
        {
          id: 'node-mark-completed',
          name: 'Mark Completed Task Row',
          type: 'n8n-nodes-base.dataTable',
          typeVersion: 1,
          position: [740, 580],
          parameters: {
            operation: 'upsert',
            dataTableId: 'orchestration_tasks',
            matchType: 'allConditions',
            filters: {
              conditions: [
                {
                  keyName: 'taskId',
                  condition: 'eq',
                  keyValue: '={{ $json.body.completedTaskId }}',
                },
              ],
            },
            columns: {
              mappingMode: 'defineBelow',
              value: {
                taskId: '={{ $json.body.completedTaskId }}',
                status: 'completed',
              },
              matchingColumns: ['taskId'],
              attemptToConvertTypes: false,
              convertFieldsToString: false,
            },
            options: {},
          },
        },
        {
          id: 'node-upsert-task-row',
          name: 'Upsert Incoming Task Row',
          type: 'n8n-nodes-base.dataTable',
          typeVersion: 1,
          position: [740, 760],
          parameters: {
            operation: 'upsert',
            dataTableId: 'orchestration_tasks',
            matchType: 'allConditions',
            filters: {
              conditions: [
                {
                  keyName: 'taskId',
                  condition: 'eq',
                  keyValue: '={{ $json.body.task.taskId }}',
                },
              ],
            },
            columns: {
              mappingMode: 'defineBelow',
              value: {
                taskId: '={{ $json.body.task.taskId }}',
                title: '={{ $json.body.task.title }}',
                description: '={{ $json.body.task.description }}',
                priority: '={{ $json.body.task.priority }}',
                status: '={{ $json.body.task.status || "open" }}',
                agent: '={{ $json.body.task.agent || "" }}',
                createdTime: '',
                updatedTime: '={{ $now }}',
              },
              matchingColumns: ['taskId'],
              attemptToConvertTypes: false,
              convertFieldsToString: false,
            },
            options: {},
          },
        },
        {
          id: 'node-get-open-tasks',
          name: 'Get Open Task Rows',
          type: 'n8n-nodes-base.dataTable',
          typeVersion: 1,
          position: [980, 760],
          parameters: {
            operation: 'get',
            dataTableId: 'orchestration_tasks',
            matchType: 'allConditions',
            filters: {
              conditions: [
                {
                  keyName: 'status',
                  condition: 'eq',
                  keyValue: 'open',
                },
              ],
            },
          },
        },
        {
          id: 'node-sort-priority',
          name: 'Sort by Priority',
          type: 'n8n-nodes-base.function',
          typeVersion: 1,
          position: [1220, 760],
          parameters: {
            functionCode: 'const tasks = items\n  .map((item) => item.json)\n  .filter((task) => String(task.status || "").toLowerCase() === "open");\n\ntasks.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));\n\nif (tasks.length === 0) return [{ json: { __empty: true } }];\n\nreturn tasks.map((task) => ({ json: task }));',
          },
        },
        {
          id: 'node-return-next-task',
          name: 'Return Next Task',
          type: 'n8n-nodes-base.function',
          typeVersion: 1,
          position: [1460, 760],
          parameters: {
            functionCode:
              'const first = items[0]?.json || null;\n\nif (!first || first.__empty) {\n  return [{ json: { status: "empty", message: "no open tasks", nextTask: null } }];\n}\n\nreturn [{ json: { status: "ok", nextTask: first } }];',
          },
        },
      ],
      connections: {
        'Task Queue Webhook': {
          main: [
            [
              {
                node: 'Completed Task?',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Completed Task?': {
          main: [
            [
              {
                node: 'Mark Completed Task Row',
                type: 'main',
                index: 0,
              },
            ],
            [
              {
                node: 'Upsert Incoming Task Row',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Mark Completed Task Row': {
          main: [
            [
              {
                node: 'Upsert Incoming Task Row',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Upsert Incoming Task Row': {
          main: [
            [
              {
                node: 'Get Open Task Rows',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Get Open Task Rows': {
          main: [
            [
              {
                node: 'Sort by Priority',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
        'Sort by Priority': {
          main: [
            [
              {
                node: 'Return Next Task',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
      },
      settings: {},
    },
    aliases: ['task-orchestrator-queue', 'Project-bolt2-task-orchestrator-queue', 'bolt2-task-orchestrator'],
  },
  {
    key: 'ci-publish-watch-sync',
    name: 'Project-bolt2-ci-publish-watch-sync',
    webhookPath: 'ci-publish-watch-sync',
    purpose: 'Accepts CI/publish status events and provides a stable webhook entrypoint for automation sync.',
    definition: {
      name: 'Project-bolt2-ci-publish-watch-sync',
      nodes: [
        {
          id: 'node-ci-sync-webhook',
          name: 'CI Publish Watch Sync',
          webhookId: 'project-bolt2-ci-publish-watch-sync',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [320, 260],
          parameters: {
            path: 'ci-publish-watch-sync',
            httpMethod: 'POST',
            responseMode: 'lastNode',
          },
        },
        {
          id: 'node-ci-sync-ack',
          name: 'CI Sync Ack',
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [620, 260],
          parameters: {
            keepOnlySet: true,
            values: {
              string: [
                {
                  name: 'status',
                  value: 'accepted',
                },
                {
                  name: 'workflow',
                  value: 'ci-publish-watch-sync',
                },
              ],
            },
          },
        },
      ],
      connections: {
        'CI Publish Watch Sync': {
          main: [
            [
              {
                node: 'CI Sync Ack',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
      },
      settings: {},
    },
    aliases: ['ci-publish-watch-sync', 'Project-bolt2-ci-publish-watch-sync'],
  },
];

export const MANAGED_WORKFLOWS = WORKFLOWS;

function normalizeWorkflowName(name) {
  if (!name) {
    return '';
  }

  return name.startsWith(WORKFLOW_PREFIX) ? name : `${WORKFLOW_PREFIX}${name}`;
}

function collectBolt2WorkflowNameCandidates() {
  const candidates = new Set();

  for (const spec of WORKFLOWS) {
    candidates.add(spec.name);

    for (const alias of spec.aliases || []) {
      candidates.add(alias);
      candidates.add(normalizeWorkflowName(alias));
    }
  }

  return candidates;
}

function isBolt2WorkflowCandidate(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }

  if (name.startsWith(WORKFLOW_PREFIX)) {
    return true;
  }

  const candidates = collectBolt2WorkflowNameCandidates();
  return candidates.has(name);
}

function sanitizeFileName(name) {
  return String(name || 'workflow').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function ensureWorkflowRepoDirs() {
  mkdirSync(WORKFLOW_REPO_ACTIVE_DIR, { recursive: true });
  mkdirSync(WORKFLOW_REPO_RETIRED_DIR, { recursive: true });
}

function readRetiredWorkflowNamesFromOngoingWork() {
  if (!existsSync(ONGOING_WORK_FILE)) {
    return [];
  }

  const markdown = readFileSync(ONGOING_WORK_FILE, 'utf8');
  const lines = markdown.split(/\r?\n/);
  const names = [];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith('## Retired n8n Workflows')) {
      inSection = true;
      continue;
    }

    if (inSection && line.startsWith('## ') && !line.startsWith('## Retired n8n Workflows')) {
      break;
    }

    if (!inSection) {
      continue;
    }

    const backtickMatch = line.match(/`([^`]+)`/);

    if (backtickMatch) {
      names.push(backtickMatch[1].trim());
      continue;
    }

    const nameMatch = line.match(/^\s*-\s*Name:\s*(.+)$/i);

    if (nameMatch) {
      names.push(nameMatch[1].trim());
    }
  }

  return names.filter(Boolean);
}

function parseOngoingObjectives(markdown) {
  const taskIdPrefixPattern = /^\[taskId:\s*([a-zA-Z0-9._:-]+)\]\s*(.*)$/i;
  const lines = markdown.split(/\r?\n/);
  const objectives = [];
  let inPrioritized = false;
  let currentPriority = 'UNSPECIFIED';

  for (const line of lines) {
    if (line.startsWith('## Prioritized Unfinished Work')) {
      inPrioritized = true;
      currentPriority = 'UNSPECIFIED';
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

    const statusMatch = line.match(/^\s*-\s*`(PARTIAL|TODO|BLOCKED)`\s+(.+)$/);

    if (!statusMatch) {
      continue;
    }

    const rawObjective = statusMatch[2].trim();
    const taskIdMatch = rawObjective.match(taskIdPrefixPattern);
    const taskId = taskIdMatch ? taskIdMatch[1].trim() : '';
    const objectiveText = taskIdMatch ? taskIdMatch[2].trim() : rawObjective;

    if (/^none(\s+currently)?\.?$/i.test(objectiveText)) {
      continue;
    }

    objectives.push({
      priority: currentPriority,
      status: statusMatch[1],
      taskId,
      text: objectiveText,
    });
  }

  return objectives;
}

function readOpenObjectives() {
  if (!existsSync(ONGOING_WORK_FILE)) {
    return [];
  }

  const markdown = readFileSync(ONGOING_WORK_FILE, 'utf8');
  return parseOngoingObjectives(markdown).filter((item) => item.status === 'PARTIAL' || item.status === 'TODO');
}

function normalizeExecutionStatus(execution) {
  return String(execution?.status || '').toLowerCase();
}

function executionDurationMs(execution) {
  const started = execution?.startedAt ? Date.parse(execution.startedAt) : NaN;
  const stopped = execution?.stoppedAt ? Date.parse(execution.stoppedAt) : NaN;

  if (!Number.isFinite(started) || !Number.isFinite(stopped) || stopped < started) {
    return 0;
  }

  return stopped - started;
}

async function fetchExecutions(baseUrl, apiKey, limit = 250) {
  const payload = await apiRequest(baseUrl, apiKey, `/api/v1/executions?limit=${limit}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function resolveManagedWorkflowIds(baseUrl, apiKey) {
  const state = loadState();
  const idsFromState = Object.values(state.workflows || {})
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean);

  if (idsFromState.length > 0) {
    return [...new Set(idsFromState)];
  }

  const all = await listWorkflows(baseUrl, apiKey);
  const managedNames = new Set(WORKFLOWS.map((item) => item.name));
  return all
    .filter((workflow) => managedNames.has(workflow?.name))
    .map((workflow) => String(workflow?.id || '').trim())
    .filter(Boolean);
}

async function collectOrchestrationStats() {
  const { baseUrl, apiKey } = resolveN8nConfig();
  const managedWorkflowIds = new Set(await resolveManagedWorkflowIds(baseUrl, apiKey));
  const executions = await fetchExecutions(baseUrl, apiKey, 250);
  const openObjectives = readOpenObjectives();

  const managedExecutions = executions.filter((execution) => managedWorkflowIds.has(String(execution?.workflowId || '')));
  const productionExecutions = managedExecutions.filter((execution) => String(execution?.mode || '').toLowerCase() === 'webhook');
  const failedProductionExecutions = productionExecutions.filter((execution) => normalizeExecutionStatus(execution) !== 'success');

  const durations = productionExecutions.map(executionDurationMs).filter((value) => value > 0);
  const totalRuntimeMs = durations.reduce((sum, value) => sum + value, 0);
  const averageRuntimeMs = durations.length > 0 ? Math.round(totalRuntimeMs / durations.length) : 0;
  const failureRatePercent =
    productionExecutions.length > 0
      ? Number(((failedProductionExecutions.length / productionExecutions.length) * 100).toFixed(2))
      : 0;

  const manualMinutesPerRun = Number(getEnv('N8N_MANUAL_MINUTES_PER_TASK') || '6');
  const estimatedTimeSavedMinutes = Math.max(0, Math.round(productionExecutions.length * manualMinutesPerRun - totalRuntimeMs / 60000));

  return {
    measuredAt: new Date().toISOString(),
    sampledExecutions: executions.length,
    managedWorkflowIds: [...managedWorkflowIds],
    managedExecutions: managedExecutions.length,
    productionExecutions: productionExecutions.length,
    failedProductionExecutions: failedProductionExecutions.length,
    failureRatePercent,
    averageRuntimeMs,
    estimatedTimeSavedMinutes,
    manualMinutesPerRun,
    openObjectivesCount: openObjectives.length,
  };
}

function buildOpenTaskRows(openObjectives) {
  const now = new Date().toISOString();

  return openObjectives.map((objective, index) => ({
    taskKey: objective.taskId && objective.taskId.length > 0 ? objective.taskId : `${objective.priority}-${index + 1}`,
    priority: objective.priority,
    status: objective.status,
    objective: objective.text,
    updatedAt: now,
  }));
}

async function tryEnsureOpenTasksDataTable(baseUrl, apiKey, tableName) {
  try {
    const payload = await apiRequest(baseUrl, apiKey, '/api/v1/data-tables?limit=100');
    const tables = Array.isArray(payload?.data) ? payload.data : [];
    const existing = tables.find((table) => String(table?.name || '').trim() === tableName);

    if (existing?.id) {
      return {
        supported: true,
        tableId: String(existing.id),
        created: false,
      };
    }

    const createPayloadCandidates = [
      {
        name: tableName,
        columns: [
          { name: 'taskKey', type: 'string' },
          { name: 'priority', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'objective', type: 'string' },
          { name: 'updatedAt', type: 'string' },
        ],
      },
      { name: tableName },
    ];

    for (const candidate of createPayloadCandidates) {
      try {
        const created = await apiRequest(baseUrl, apiKey, '/api/v1/data-tables', {
          method: 'POST',
          body: JSON.stringify(candidate),
        });

        const createdId = created?.id || created?.data?.id;

        if (createdId) {
          return {
            supported: true,
            tableId: String(createdId),
            created: true,
          };
        }
      } catch {
        // try next payload
      }
    }

    return {
      supported: true,
      tableId: null,
      created: false,
      warning: 'could not create or resolve data table id',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unsupported = message.includes('(404)');

    return {
      supported: !unsupported,
      tableId: null,
      created: false,
      warning: unsupported ? 'data tables api unavailable on this n8n instance' : message,
    };
  }
}

async function tryWriteOpenTaskRows(baseUrl, apiKey, tableId, rows) {
  const payloadCandidates = [
    { rows },
    rows,
    { data: rows },
  ];

  const routes = [`/api/v1/data-tables/${encodeURIComponent(String(tableId))}/rows/upsert`, `/api/v1/data-tables/${encodeURIComponent(String(tableId))}/rows`];

  for (const route of routes) {
    for (const payload of payloadCandidates) {
      try {
        const response = await apiRequest(baseUrl, apiKey, route, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        return {
          synced: true,
          route,
          payloadShape: Array.isArray(payload) ? 'array' : Object.keys(payload).join(','),
          response,
        };
      } catch {
        // try next shape/route
      }
    }
  }

  return {
    synced: false,
    warning: 'unable to write rows to data table with known payload shapes',
  };
}

function persistOrchestrationStats(stats) {
  mkdirSync(resolve('bolt.work', 'n8n'), { recursive: true });
  writeFileSync(ORCHESTRATION_STATS_FILE, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');

  return {
    statsFile: ORCHESTRATION_STATS_FILE,
  };
}

function writeFallbackOpenTaskTable(tableName, rows, stats) {
  mkdirSync(resolve('bolt.work', 'n8n'), { recursive: true });

  const fallbackPayload = {
    tableName,
    generatedAt: new Date().toISOString(),
    rows,
    stats,
  };

  writeFileSync(OPEN_TASKS_FALLBACK_FILE, `${JSON.stringify(fallbackPayload, null, 2)}\n`, 'utf8');

  return {
    fallbackFile: OPEN_TASKS_FALLBACK_FILE,
  };
}

async function syncOpenTasksTable(tableName = DEFAULT_OPEN_TASKS_TABLE_NAME) {
  const { baseUrl, apiKey } = resolveN8nConfig();
  const openObjectives = readOpenObjectives();
  const rows = buildOpenTaskRows(openObjectives);
  const stats = await collectOrchestrationStats();
  const persistedStats = persistOrchestrationStats(stats);
  const fallback = writeFallbackOpenTaskTable(tableName, rows, stats);

  const tableCheck = await tryEnsureOpenTasksDataTable(baseUrl, apiKey, tableName);

  if (!tableCheck.supported || !tableCheck.tableId) {
    return {
      tableName,
      dataTablesSupported: false,
      warning: tableCheck.warning || 'data tables unsupported or table not resolvable',
      rowsSynced: 0,
      openObjectives: openObjectives.length,
      stats,
      ...persistedStats,
      ...fallback,
    };
  }

  const writeResult = await tryWriteOpenTaskRows(baseUrl, apiKey, tableCheck.tableId, rows);

  if (!writeResult.synced) {
    return {
      tableName,
      dataTablesSupported: true,
      tableId: tableCheck.tableId,
      warning: writeResult.warning,
      rowsSynced: 0,
      openObjectives: openObjectives.length,
      stats,
      ...persistedStats,
      ...fallback,
    };
  }

  return {
    tableName,
    dataTablesSupported: true,
    tableId: tableCheck.tableId,
    created: tableCheck.created,
    rowsSynced: rows.length,
    openObjectives: openObjectives.length,
    writeRoute: writeResult.route,
    stats,
    ...persistedStats,
    ...fallback,
  };
}

function getEnv(key) {
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function deriveWebhookBaseUrls(endpoint, explicitWebhookBase) {
  const candidates = new Set();
  const normalizedEndpoint = normalizeBaseUrl(endpoint);
  const normalizedWebhook = normalizeBaseUrl(explicitWebhookBase);

  if (normalizedWebhook) {
    candidates.add(normalizedWebhook);
  }

  if (normalizedEndpoint) {
    candidates.add(normalizedEndpoint);
    candidates.add(normalizedEndpoint.replace(/\/api(?:\/v\d+)?$/i, ''));
  }

  return Array.from(candidates).filter(Boolean);
}

function resolveN8nConfig() {
  const endpoint = getEnv('N8N_BASE_URL') || getEnv('n8n_Arvekari_endpoint');
  const explicitWebhookBase = getEnv('N8N_WEBHOOK_BASE_URL') || getEnv('n8n_Arvekari_webhookEndpoint');
  const apiKey = getEnv('N8N_API_KEY') || getEnv('n8n_Arvekari_ApiKey');

  if (!endpoint) {
    throw new Error('Missing n8n endpoint: set N8N_BASE_URL or n8n_Arvekari_endpoint.');
  }

  if (!apiKey) {
    throw new Error('Missing n8n API key: set N8N_API_KEY or n8n_Arvekari_ApiKey.');
  }

  return {
    baseUrl: normalizeBaseUrl(endpoint),
    webhookBaseUrls: deriveWebhookBaseUrls(endpoint, explicitWebhookBase),
    apiKey,
  };
}

async function apiRequest(baseUrl, apiKey, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': apiKey,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : {};

  if (!response.ok) {
    const detail = typeof parsed === 'object' && parsed && 'message' in parsed ? parsed.message : text;
    throw new Error(`n8n API ${options.method || 'GET'} ${path} failed (${response.status}): ${detail}`);
  }

  return parsed;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { workflows: {} };
  }

  const parsed = safeJsonParse(readFileSync(STATE_FILE, 'utf8'));

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { workflows: {} };
  }

  return {
    workflows: typeof parsed.workflows === 'object' && parsed.workflows && !Array.isArray(parsed.workflows) ? parsed.workflows : {},
  };
}

function saveState(state) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function listWorkflows(baseUrl, apiKey) {
  const payload = await apiRequest(baseUrl, apiKey, '/api/v1/workflows?limit=250');
  return Array.isArray(payload?.data) ? payload.data : [];
}

function normalizeWorkflowPayload(definition, existing) {
  return {
    name: definition.name,
    nodes: definition.nodes,
    connections: definition.connections,
    settings: definition.settings || {},
  };
}

async function createWorkflow(baseUrl, apiKey, payload) {
  return await apiRequest(baseUrl, apiKey, '/api/v1/workflows', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function updateWorkflow(baseUrl, apiKey, workflowId, payload) {
  return await apiRequest(baseUrl, apiKey, `/api/v1/workflows/${encodeURIComponent(String(workflowId))}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function fetchWorkflow(baseUrl, apiKey, workflowId) {
  return await apiRequest(baseUrl, apiKey, `/api/v1/workflows/${encodeURIComponent(String(workflowId))}`, {
    method: 'GET',
  });
}

function backupWorkflowJson(workflow, bucket = 'active') {
  ensureWorkflowRepoDirs();

  const destinationDir = bucket === 'retired' ? WORKFLOW_REPO_RETIRED_DIR : WORKFLOW_REPO_ACTIVE_DIR;
  const name = sanitizeFileName(workflow?.name || workflow?.id || 'workflow');
  const latestPath = resolve(destinationDir, `${name}.json`);
  const timestampPath = resolve(destinationDir, `${name}-${Date.now()}.json`);
  const content = `${JSON.stringify(workflow, null, 2)}\n`;

  writeFileSync(latestPath, content, 'utf8');
  writeFileSync(timestampPath, content, 'utf8');
}

async function deleteWorkflow(baseUrl, apiKey, workflowId) {
  await apiRequest(baseUrl, apiKey, `/api/v1/workflows/${encodeURIComponent(String(workflowId))}`, {
    method: 'DELETE',
  });
}

async function setWorkflowActive(baseUrl, apiKey, workflowId, active) {
  const route = active ? 'activate' : 'deactivate';

  try {
    await apiRequest(baseUrl, apiKey, `/api/v1/workflows/${encodeURIComponent(String(workflowId))}/${route}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return;
  } catch {
    await apiRequest(baseUrl, apiKey, `/api/v1/workflows/${encodeURIComponent(String(workflowId))}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
  }
}

async function archiveWorkflow(baseUrl, apiKey, workflow) {
  await apiRequest(baseUrl, apiKey, `/api/v1/workflows/${encodeURIComponent(String(workflow.id))}`, {
    method: 'PATCH',
    body: JSON.stringify({
      active: false,
      isArchived: true,
    }),
  });
}

async function pruneRetired() {
  const { baseUrl, apiKey } = resolveN8nConfig();
  const all = await listWorkflows(baseUrl, apiKey);
  const retiredNames = new Set([...RETIRED_WORKFLOW_NAMES, ...readRetiredWorkflowNamesFromOngoingWork()]);
  const retired = all.filter((workflow) => retiredNames.has(workflow?.name));

  if (retired.length === 0) {
    console.log('No retired workflows found.');
    return;
  }

  for (const workflow of retired) {
    const workflowId = workflow?.id;
    const workflowName = workflow?.name || 'unknown';

    if (!workflowId) {
      console.log(`SKIP ${workflowName} (missing id)`);
      continue;
    }

    try {
      const details = await fetchWorkflow(baseUrl, apiKey, workflowId);
      backupWorkflowJson(details, 'retired');
    } catch (backupError) {
      const backupMessage = backupError instanceof Error ? backupError.message : String(backupError);
      console.log(`BACKUP_FAILED ${workflowName} id=${workflowId} reason=${backupMessage}`);
    }

    try {
      await deleteWorkflow(baseUrl, apiKey, workflowId);
      console.log(`REMOVED ${workflowName} id=${workflowId}`);
      continue;
    } catch (deleteError) {
      const deleteMessage = deleteError instanceof Error ? deleteError.message : String(deleteError);
      console.log(`DELETE_FAILED ${workflowName} id=${workflowId} reason=${deleteMessage}`);
    }

    try {
      await setWorkflowActive(baseUrl, apiKey, workflowId, false);
    } catch {
      // Continue to archive attempt.
    }

    try {
      await archiveWorkflow(baseUrl, apiKey, workflow);
      console.log(`ARCHIVED ${workflowName} id=${workflowId}`);
    } catch (archiveError) {
      const archiveMessage = archiveError instanceof Error ? archiveError.message : String(archiveError);
      console.log(`ARCHIVE_FAILED ${workflowName} id=${workflowId} reason=${archiveMessage}`);
    }
  }
}

async function enforcePrefixGuardrail() {
  const { baseUrl, apiKey } = resolveN8nConfig();
  const all = await listWorkflows(baseUrl, apiKey);
  const retiredNames = new Set([...RETIRED_WORKFLOW_NAMES, ...readRetiredWorkflowNamesFromOngoingWork()]);

  const violations = all.filter((workflow) => {
    const name = workflow?.name;

    if (!isBolt2WorkflowCandidate(name)) {
      return false;
    }

    if (retiredNames.has(name)) {
      return false;
    }

    return !name.startsWith(WORKFLOW_PREFIX);
  });

  if (violations.length > 0) {
    const details = violations.map((item) => `${item.name} (${item.id})`).join(', ');
    throw new Error(
      `Guardrail violation: bolt2 workflows must start with '${WORKFLOW_PREFIX}'. Violations: ${details}. ` +
        `Rename/redeploy workflows or mark retired and prune with 'pnpm run n8n:orchestrator -- prune-retired'.`,
    );
  }

  console.log(`GUARDRAIL_OK all bolt2 workflows use prefix '${WORKFLOW_PREFIX}'.`);
}

async function deployAll({ activate }) {
  const { baseUrl, apiKey } = resolveN8nConfig();
  const all = await listWorkflows(baseUrl, apiKey);
  const state = {
    workflows: {},
  };
  const now = new Date().toISOString();

  for (const spec of WORKFLOWS) {
    const aliasNames = (spec.aliases || [spec.name]).map((item) => normalizeWorkflowName(item));
    const legacyNames = spec.aliases || [spec.name];
    const existing = all.find((workflow) => aliasNames.includes(workflow?.name) || legacyNames.includes(workflow?.name));
    const payload = normalizeWorkflowPayload(spec.definition, existing);
    const saved = existing
      ? await updateWorkflow(baseUrl, apiKey, existing.id, payload)
      : await createWorkflow(baseUrl, apiKey, payload);

    const workflowId = String(saved?.id || existing?.id || '');

    if (!workflowId) {
      throw new Error(`Unable to resolve workflow id for ${spec.name}`);
    }

    const shouldActivate = Boolean(activate) && spec.activateOnDeploy !== false;

    if (shouldActivate) {
      await setWorkflowActive(baseUrl, apiKey, workflowId, true);
    } else {
      await setWorkflowActive(baseUrl, apiKey, workflowId, false);
    }

    state.workflows[spec.key] = {
      id: workflowId,
      name: spec.name,
      purpose: spec.purpose,
      webhookPath: spec.webhookPath,
      active: shouldActivate,
      deployedAt: now,
    };

    console.log(`${existing ? 'UPDATED' : 'CREATED'} ${spec.name} id=${workflowId} active=${shouldActivate}`);

    try {
      const details = await fetchWorkflow(baseUrl, apiKey, workflowId);
      backupWorkflowJson(details, 'active');
    } catch (backupError) {
      const backupMessage = backupError instanceof Error ? backupError.message : String(backupError);
      console.log(`ACTIVE_BACKUP_FAILED ${spec.name} id=${workflowId} reason=${backupMessage}`);
    }
  }

  saveState(state);
  console.log(`STATE_FILE=${STATE_FILE}`);
}

async function listManaged() {
  const state = loadState();
  const managed = WORKFLOWS.map((item) => {
    const saved = state.workflows[item.key];

    return {
      key: item.key,
      name: item.name,
      id: saved?.id || 'not-deployed',
      webhookPath: item.webhookPath,
      purpose: item.purpose,
      active: saved?.active ?? false,
      deployedAt: saved?.deployedAt || null,
    };
  });

  console.log(JSON.stringify({ managed }, null, 2));
}

async function setAllActive(active) {
  const { baseUrl, apiKey } = resolveN8nConfig();
  const state = loadState();

  for (const spec of WORKFLOWS) {
    const saved = state.workflows[spec.key];

    if (!saved?.id) {
      throw new Error(`Workflow ${spec.name} has no saved id; run deploy first.`);
    }

    await setWorkflowActive(baseUrl, apiKey, saved.id, active);
    saved.active = active;
    saved.updatedAt = new Date().toISOString();
    console.log(`${active ? 'ACTIVATED' : 'DEACTIVATED'} ${spec.name} id=${saved.id}`);
  }

  saveState(state);
}

async function triggerWorkflow(key, payload) {
  const { webhookBaseUrls, apiKey } = resolveN8nConfig();
  const spec = WORKFLOWS.find((item) => item.key === key || item.name === key);

  if (!spec) {
    throw new Error(`Unknown workflow key/name: ${key}`);
  }

  const pathTargets = [`/webhook/${spec.webhookPath}`, `/webhook-prod/${spec.webhookPath}`];
  const attempts = [];

  for (const baseUrlCandidate of webhookBaseUrls) {
    for (const pathTarget of pathTargets) {
      const targetUrl = `${baseUrlCandidate}${pathTarget}`;
      attempts.push(targetUrl);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-N8N-API-KEY': apiKey } : {}),
        },
        body: JSON.stringify(payload || {}),
      });

      const text = await response.text();
      console.log(`TRIGGER_URL=${targetUrl}`);
      console.log(`TRIGGER_STATUS=${response.status}`);
      console.log(`TRIGGER_BODY=${text}`);

      if (response.ok) {
        return;
      }
    }
  }

  throw new Error(`Trigger failed for ${spec.name}. Attempted URLs: ${attempts.join(', ')}`);
}

function parseArgs(argv) {
  const args = {
    command: argv[0] || 'list',
    activate: true,
    key: '',
    payload: {},
    table: DEFAULT_OPEN_TASKS_TABLE_NAME,
  };

  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--inactive') {
      args.activate = false;
    } else if (arg === '--key' && argv[index + 1]) {
      args.key = argv[++index];
    } else if (arg === '--payload' && argv[index + 1]) {
      args.payload = safeJsonParse(argv[++index]);
    } else if (arg === '--table' && argv[index + 1]) {
      args.table = argv[++index];
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'deploy') {
    await pruneRetired();
    await deployAll({ activate: args.activate });
    await enforcePrefixGuardrail();
    return;
  }

  if (args.command === 'list') {
    await listManaged();
    return;
  }

  if (args.command === 'activate') {
    await setAllActive(true);
    return;
  }

  if (args.command === 'deactivate') {
    await setAllActive(false);
    return;
  }

  if (args.command === 'trigger') {
    if (!args.key) {
      throw new Error('trigger requires --key <workflow-key-or-name>.');
    }

    await triggerWorkflow(args.key, args.payload);
    return;
  }

  if (args.command === 'prune-retired') {
    await pruneRetired();
    return;
  }

  if (args.command === 'guardrail') {
    await enforcePrefixGuardrail();
    return;
  }

  if (args.command === 'stats') {
    const stats = await collectOrchestrationStats();
    const persistedStats = persistOrchestrationStats(stats);
    console.log(JSON.stringify({
      ...stats,
      ...persistedStats,
    }, null, 2));
    return;
  }

  if (args.command === 'sync-open-tasks') {
    const result = await syncOpenTasksTable(args.table);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unsupported command: ${args.command}`);
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;

if (entryPoint && import.meta.url === entryPoint) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`n8n-dev-orchestrator error: ${message}`);
    process.exit(1);
  });
}
