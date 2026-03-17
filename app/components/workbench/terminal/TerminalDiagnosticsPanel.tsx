import { useStore } from '@nanostores/react';
import { memo, useEffect, useMemo, useState } from 'react';
import { logStore } from '~/lib/stores/logs';
import { workbenchStore } from '~/lib/stores/workbench';
import { getDebugLogger, type TerminalEntry } from '~/utils/debugLogger';
import {
  buildDebugConsoleRows,
  buildOutputRows,
  buildProblemRows,
  type DiagnosticRow,
} from './terminal-diagnostics';

interface TerminalDiagnosticsPanelProps {
  view: 'problems' | 'output' | 'debug';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildTextBlock(row: DiagnosticRow): string {
  const location = row.filePath
    ? `${row.filePath}${row.line ? `:${row.line}${row.column ? `:${row.column}` : ''}` : ''}`
    : undefined;

  return [
    `time: ${formatTimestamp(row.timestamp)}`,
    `severity: ${row.severity}`,
    `source: ${row.source}`,
    row.code ? `code: ${row.code}` : undefined,
    location ? `location: ${location}` : undefined,
    `message: ${row.message}`,
    row.details ? `details:\n${row.details}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}

function severityClasses(severity: DiagnosticRow['severity']): string {
  switch (severity) {
    case 'error':
      return 'text-red-400 border-red-500/30 bg-red-500/10';
    case 'warning':
      return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    case 'debug':
      return 'text-sky-300 border-sky-500/30 bg-sky-500/10';
    default:
      return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
  }
}

export const TerminalDiagnosticsPanel = memo(({ view }: TerminalDiagnosticsPanelProps) => {
  const logsMap = useStore(logStore.logs);
  const actionAlert = useStore(workbenchStore.alert);
  const supabaseAlert = useStore(workbenchStore.SupabaseAlert);
  const deployAlert = useStore(workbenchStore.DeployAlert);
  const [terminalLogs, setTerminalLogs] = useState<TerminalEntry[]>([]);

  useEffect(() => {
    if (view !== 'debug') {
      return undefined;
    }

    const syncLogs = () => {
      setTerminalLogs(getDebugLogger().getTerminalLogs());
    };

    syncLogs();
    const intervalId = window.setInterval(syncLogs, 750);

    return () => window.clearInterval(intervalId);
  }, [view]);

  const logs = useMemo(() => Object.values(logsMap), [logsMap]);

  const rows = useMemo(() => {
    if (view === 'problems') {
      return buildProblemRows({ logs, actionAlert, supabaseAlert, deployAlert }).slice(0, 100);
    }

    if (view === 'output') {
      return buildOutputRows(logs).slice(0, 150);
    }

    return buildDebugConsoleRows(logs, terminalLogs).slice(0, 200);
  }, [actionAlert, deployAlert, logs, supabaseAlert, terminalLogs, view]);

  const emptyMessage =
    view === 'problems'
      ? 'No problems detected.'
      : view === 'output'
        ? 'No output captured yet.'
        : 'No debug events captured yet.';

  return (
    <div className="h-full overflow-auto bg-bolt-elements-terminals-background px-3 py-2 modern-scrollbar">
      {rows.length === 0 ? (
        <div className="text-sm text-bolt-elements-textSecondary">{emptyMessage}</div>
      ) : (
        <div className="space-y-2 font-mono text-xs leading-5">
          {rows.map((row) => (
            <pre
              key={row.id}
              className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-bolt-elements-textPrimary"
            >
              <span className={`inline-block rounded border px-2 py-0.5 uppercase tracking-wide ${severityClasses(row.severity)}`}>
                {row.severity}
              </span>
              {'\n'}
              {buildTextBlock(row)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
});

TerminalDiagnosticsPanel.displayName = 'TerminalDiagnosticsPanel';