import type { Message } from 'ai';
import ignore from 'ignore';
import { IGNORE_PATTERNS, type FileMap } from './constants';

const ig = ignore().add(IGNORE_PATTERNS);

const CONTINUATION_HINT_PATTERN =
  /\b(fix|debug|resolve|repair|patch|update|modify|continue|continuation|follow(?:[ -])?up|still|again|existing|current workspace|current project|broken|broke|issue|problem|error|failed to resolve import|does the file exist|import-analysis|vite|plugin:vite)\b/i;

const EXPLICIT_RECREATE_PATTERN =
  /\b(start over|from scratch|recreate (?:the )?(?:project|app|workspace)|new project|fresh project|scaffold a new project|replace the whole project|reset the project)\b/i;

function extractTextContent(message: Message | Omit<Message, 'id'>): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => part?.text ?? '')
      .join(' ');
  }

  return '';
}

function toRelativeFilePath(filePath: string): string {
  return filePath.startsWith('/home/project/') ? filePath.slice('/home/project/'.length) : filePath;
}

function getMeaningfulWorkspaceFiles(files?: FileMap): string[] {
  return Object.entries(files || {})
    .filter(([, entry]) => entry?.type === 'file')
    .map(([filePath]) => toRelativeFilePath(filePath))
    .filter((filePath) => filePath.length > 0 && !ig.ignores(filePath))
    .sort((left, right) => left.localeCompare(right));
}

function prioritizeEvidenceFiles(filePaths: string[]): string[] {
  return [...filePaths].sort((left, right) => {
    const rank = (value: string) => {
      if (value === 'package.json') {
        return 0;
      }

      if (value === 'vite.config.ts' || value === 'vite.config.js' || value === 'index.html') {
        return 1;
      }

      if (/^src\//i.test(value)) {
        return 2;
      }

      return 3;
    };

    return rank(left) - rank(right) || left.localeCompare(right);
  });
}

export function buildWorkspaceContinuationPromptAddon(params: {
  chatMode?: 'discuss' | 'build';
  messages: Array<Message | Omit<Message, 'id'>>;
  files?: FileMap;
  summary?: string;
}): string | undefined {
  const workspaceFiles = getMeaningfulWorkspaceFiles(params.files);

  if (workspaceFiles.length === 0) {
    return undefined;
  }

  const lastUserMessage = [...params.messages].reverse().find((message) => message.role === 'user');
  const latestUserText = lastUserMessage ? extractTextContent(lastUserMessage).trim() : '';
  const hasProjectStructure = workspaceFiles.some(
    (filePath) =>
      filePath === 'package.json' ||
      filePath === 'index.html' ||
      /^src\//i.test(filePath) ||
      /^app\//i.test(filePath) ||
      /^vite\.config\./i.test(filePath),
  );
  const priorConversationExists = params.messages.filter((message) => message.role === 'assistant').length > 0;
  const hasSummary = Boolean(params.summary?.trim());
  const isContinuationLikeRequest = CONTINUATION_HINT_PATTERN.test(latestUserText) || priorConversationExists || hasSummary;
  const explicitlyRequestsRecreation = EXPLICIT_RECREATE_PATTERN.test(latestUserText);

  if (!hasProjectStructure || !isContinuationLikeRequest || explicitlyRequestsRecreation) {
    return undefined;
  }

  const evidenceFiles = prioritizeEvidenceFiles(workspaceFiles).slice(0, 8);

  return `
<existing_workspace_contract>
An existing workspace already exists and this request is a continuation of that project.

Rules:
- Treat pasted compiler, bundler, runtime, preview, or test errors as diagnostics from the current workspace.
- Modify the existing project in place.
- Preserve the current framework, package manager, entry points, file layout, and working files unless the user explicitly asks to replace them.
- Prefer the smallest targeted fix that resolves the reported issue.
- Do NOT recreate the whole app or scaffold a fresh starter project when a focused fix is sufficient.
- Do NOT rewrite package.json, index.html, vite config, or the src tree wholesale unless the current issue truly requires it.

Workspace evidence:
${evidenceFiles.map((filePath) => `- ${filePath}`).join('\n')}
</existing_workspace_contract>`;
}