export const PROJECT_PLAN_KIND = 'project-plan';
export const PROJECT_PLAN_FILE_NAME = '.plan.md';
export const PROJECT_PLAN_STATUS_KIND = 'project-plan-status';
export const PROJECT_PLAN_STATUS_FILE_NAME = '.plan-status.md';

export type ProjectPlanRunStatus = 'idle' | 'in_progress' | 'completed' | 'failed' | 'aborted';

const PLAN_KEYWORD_PATTERN =
  /\b(plan|planning|design|architecture|objective|goal|requirement|scope|deliverable|milestone|roadmap|implementation steps?|file structure|folder structure)\b/i;
const FILE_REFERENCE_PATTERN =
  /(?:^|[\s`])(src|app|components|routes|pages|lib|server|api|docs|public|tests?)\/[A-Za-z0-9._/-]+|(?:package|tsconfig|vite|README|wrangler|docker-compose|dockerfile)[A-Za-z0-9._-]*\.(?:json|js|cjs|mjs|ts|tsx|jsx|md|yml|yaml)|[A-Za-z0-9._/-]+\.(?:ts|tsx|js|jsx|json|md|css|scss|html|yml|yaml)/i;
const FILE_STRUCTURE_LINE_PATTERN =
  /^\s*(?:[-*+]\s+|\d+\.\s+)?`?(?:[A-Za-z0-9._-]+\/|(?:src|app|components|routes|pages|lib|server|api|docs|public|tests?)\/|(?:package|tsconfig|vite|README|wrangler|docker-compose|dockerfile)[A-Za-z0-9._-]*\.(?:json|js|cjs|mjs|ts|tsx|jsx|md|yml|yaml)|[A-Za-z0-9._/-]+\.(?:ts|tsx|js|jsx|json|md|css|scss|html|yml|yaml))`?\s*$/i;
const STRUCTURED_LINE_PATTERN = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|[├└│])/;

function normalizeLines(lines: string[]) {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

function truncate(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

function collectObjectiveLines(assistantResponse: string) {
  const lines = assistantResponse
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && STRUCTURED_LINE_PATTERN.test(line))
    .slice(0, 12);

  return normalizeLines(lines);
}

function collectFileStructureLines(assistantResponse: string) {
  const lines = assistantResponse
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && (FILE_STRUCTURE_LINE_PATTERN.test(line) || FILE_REFERENCE_PATTERN.test(line)))
    .slice(0, 20);

  return normalizeLines(lines);
}

export function formatProjectPlanRunStatus(status: ProjectPlanRunStatus) {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'aborted':
      return 'Aborted';
    default:
      return 'Idle';
  }
}

export function shouldPersistProjectPlan(input: {
  userRequest: string;
  assistantResponse: string;
  chatMode: 'discuss' | 'build';
}) {
  const userRequest = input.userRequest.trim();
  const assistantResponse = input.assistantResponse.trim();

  if (!userRequest || !assistantResponse) {
    return false;
  }

  if (userRequest.startsWith('Auto-repair request:')) {
    return false;
  }

  if (input.chatMode === 'discuss') {
    return true;
  }

  const hasPlanSignal = PLAN_KEYWORD_PATTERN.test(assistantResponse) || FILE_REFERENCE_PATTERN.test(assistantResponse);
  const tokenCount = assistantResponse.split(/\s+/).filter(Boolean).length;

  return hasPlanSignal || tokenCount >= 8;
}

export function buildProjectPlanContent(input: {
  userRequest: string;
  assistantResponse: string;
  chatMode: 'discuss' | 'build';
}) {
  if (!shouldPersistProjectPlan(input)) {
    return null;
  }

  const request = input.userRequest.trim();
  const assistantResponse = input.assistantResponse.trim();
  const objectiveLines = collectObjectiveLines(assistantResponse);
  const fileStructureLines = collectFileStructureLines(assistantResponse);
  const noteBody = truncate(assistantResponse, 4000);

  return [
    '# Active Project Plan',
    '',
    `- Updated: ${new Date().toISOString()}`,
    `- Source mode: ${input.chatMode}`,
    '',
    '## Current Request',
    request,
    '',
    '## Objectives And Steps',
    ...(objectiveLines.length > 0 ? objectiveLines : [`- ${request}`]),
    '',
    '## Referenced Files And Structure',
    ...(fileStructureLines.length > 0 ? fileStructureLines : ['- No explicit file structure was listed in the latest reply.']),
    '',
    '## Latest Planning Notes',
    noteBody,
    '',
    '## Verification Intent',
    '- Use this plan to verify that the request is carried through to completion, not abandoned after the first partial fix.',
  ].join('\n');
}

export function buildProjectPlanStatusContent(input: {
  userRequest: string;
  chatMode: 'discuss' | 'build';
  status: ProjectPlanRunStatus;
  assistantResponse?: string;
  errorMessage?: string;
  updatedAt?: string;
}) {
  const updatedAt = input.updatedAt || new Date().toISOString();
  const latestResult = truncate((input.assistantResponse || input.errorMessage || '').trim(), 1500);

  return [
    '# Active Project Plan Status',
    '',
    `- Updated: ${updatedAt}`,
    `- Run status: ${formatProjectPlanRunStatus(input.status)}`,
    `- Source mode: ${input.chatMode}`,
    '',
    '## Current Request',
    input.userRequest.trim() || 'No tracked request.',
    '',
    '## Latest Outcome',
    latestResult || 'No result captured yet.',
    '',
    '## Tracking Note',
    '- This file tracks request execution state separately so .plan.md stays focused on objectives and structure.',
  ].join('\n');
}