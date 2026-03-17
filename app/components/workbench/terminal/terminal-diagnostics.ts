import type { DeployAlert, ActionAlert, SupabaseAlert } from '~/types/actions';
import type { LogEntry } from '~/lib/stores/logs';
import type { TerminalEntry } from '~/utils/debugLogger';

export interface DiagnosticRow {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'debug';
  source: string;
  message: string;
  details?: string;
  code?: string;
  filePath?: string;
  line?: number;
  column?: number;
}

interface ExtractedDiagnosticMetadata {
  code?: string;
  filePath?: string;
  line?: number;
  column?: number;
}

function formatUnknown(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function alertSeverity(type?: string): DiagnosticRow['severity'] {
  return type === 'warning' ? 'warning' : type === 'info' ? 'info' : 'error';
}

function extractDiagnosticMetadata(...values: Array<unknown>): ExtractedDiagnosticMetadata {
  const combined = values
    .map((value) => formatUnknown(value))
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n');

  const pluginMatch = combined.match(/\[(plugin:[^\]]+)\]/i);
  const locationMatch = combined.match(/((?:\/|[A-Za-z]:\\)[^\n\r|]+?):(\d+):(\d+)/);
  const lineOnlyMatch = !locationMatch ? combined.match(/((?:\/|[A-Za-z]:\\)[^\n\r|]+?):(\d+)/) : null;
  const codeMatch = combined.match(/\b([A-Z][A-Z0-9_]{2,}|E[A-Z0-9_]+)\b/);

  return {
    code: pluginMatch?.[1] || codeMatch?.[1],
    filePath: locationMatch?.[1] || lineOnlyMatch?.[1],
    line: locationMatch?.[2] ? Number(locationMatch[2]) : lineOnlyMatch?.[2] ? Number(lineOnlyMatch[2]) : undefined,
    column: locationMatch?.[3] ? Number(locationMatch[3]) : undefined,
  };
}

function toAlertRow(alert: ActionAlert | SupabaseAlert | DeployAlert, index: number): DiagnosticRow {
  const details = formatUnknown(alert.content);
  const metadata = extractDiagnosticMetadata(alert.title, alert.description, details);

  return {
    id: `alert-${alert.source ?? 'runtime'}-${index}-${alert.title}`,
    timestamp: new Date().toISOString(),
    severity: alertSeverity((alert as { type?: string }).type),
    source: alert.source ?? 'runtime',
    message: `${alert.title}: ${alert.description}`,
    details,
    ...metadata,
  };
}

function toLogRow(log: LogEntry): DiagnosticRow {
  const details = formatUnknown(log.details);
  const metadata = extractDiagnosticMetadata(log.message, details, log.stack, log.statusCode);

  return {
    id: log.id,
    timestamp: log.timestamp,
    severity: log.level,
    source: log.category,
    message: log.message,
    details,
    ...metadata,
  };
}

function toTerminalRow(entry: TerminalEntry, index: number): DiagnosticRow {
  const details = entry.command ? `Command: ${entry.command}` : undefined;
  const metadata = extractDiagnosticMetadata(entry.content, details);

  return {
    id: `terminal-${entry.timestamp}-${index}`,
    timestamp: entry.timestamp,
    severity: entry.type === 'error' ? 'error' : entry.type === 'input' ? 'debug' : 'info',
    source: entry.command ? `terminal:${entry.command}` : 'terminal',
    message: entry.content,
    details,
    ...metadata,
  };
}

function sortNewestFirst(rows: DiagnosticRow[]): DiagnosticRow[] {
  return [...rows].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

export function buildProblemRows(params: {
  logs: LogEntry[];
  actionAlert?: ActionAlert;
  supabaseAlert?: SupabaseAlert;
  deployAlert?: DeployAlert;
}): DiagnosticRow[] {
  const alertRows = [params.actionAlert, params.supabaseAlert, params.deployAlert]
    .filter(Boolean)
    .map((alert, index) => toAlertRow(alert!, index));

  const logRows = params.logs
    .filter((log) => log.level === 'error' || log.level === 'warning')
    .map(toLogRow);

  return sortNewestFirst([...alertRows, ...logRows]);
}

export function buildOutputRows(logs: LogEntry[]): DiagnosticRow[] {
  return sortNewestFirst(
    logs
      .filter((log) => log.level !== 'debug')
      .map(toLogRow),
  );
}

export function buildDebugConsoleRows(logs: LogEntry[], terminalLogs: TerminalEntry[]): DiagnosticRow[] {
  const debugLogs = logs.filter((log) => log.level === 'debug' || log.category === 'system').map(toLogRow);
  const terminalRows = terminalLogs.map(toTerminalRow);

  return sortNewestFirst([...terminalRows, ...debugLogs]);
}