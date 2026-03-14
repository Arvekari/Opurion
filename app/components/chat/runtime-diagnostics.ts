import type { ActionAlert } from '~/types/actions';

const BLANK_PREVIEW_PATTERN = /\b(blank|white)\s+(page|screen|preview)\b|\bpreview\s+is\s+blank\b/i;
const COMMAND_FAILURE_PATTERN = /\b(command|run|start|dev server|preview)\b.*\b(fail|fails|failed|failing|broken|stuck)\b|\bcommands?\s+fail\b/i;

function trimDiagnosticContent(content: string, maxChars = 800): string {
  const normalized = content.trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}...`;
}

export function shouldAttachRuntimeDiagnostics(input: string, alert?: ActionAlert): boolean {
  if (!alert) {
    return false;
  }

  if (alert.source === 'preview') {
    return BLANK_PREVIEW_PATTERN.test(input);
  }

  return COMMAND_FAILURE_PATTERN.test(input);
}

export function buildRuntimeDiagnosticsPrefix(input: string, alert?: ActionAlert): string {
  if (!alert || !shouldAttachRuntimeDiagnostics(input, alert)) {
    return '';
  }

  const lines = [
    '[Runtime Diagnostics]',
    `Source: ${alert.source ?? 'runtime'}`,
    `Title: ${alert.title}`,
    `Summary: ${alert.description}`,
  ];

  const content = trimDiagnosticContent(alert.content || 'No additional runtime details available.');
  if (content) {
    lines.push(`Details:\n${content}`);
  }

  lines.push('Use these diagnostics to reason about the current failure before proposing fixes.');

  return lines.join('\n\n');
}
