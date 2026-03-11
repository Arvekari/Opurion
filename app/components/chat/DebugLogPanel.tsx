import { useStore } from '@nanostores/react';
import { useMemo } from 'react';
import { logStore } from '~/lib/stores/logs';

interface DebugLogPanelProps {
  panelId: string;
  emptyMessage?: string;
}

export function DebugLogPanel({ panelId, emptyMessage = 'No execution logs available yet.' }: DebugLogPanelProps) {
  const logs = useStore(logStore.logs);

  const latestExecutionLogs = useMemo(() => {
    return Object.values(logs)
      .filter((entry) => ['provider', 'api', 'error', 'system', 'network', 'user'].includes(entry.category))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 25);
  }, [logs]);

  const formatDetails = (details: unknown) => {
    if (!details) {
      return null;
    }

    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(details);
    }
  };

  return (
    <div
      id={panelId}
      className="mt-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background p-2 max-h-56 overflow-y-auto"
    >
      {latestExecutionLogs.length > 0 ? (
        <div className="space-y-2">
          {latestExecutionLogs.map((entry) => (
            <div
              key={entry.id}
              className="text-xs leading-5 border-b border-bolt-elements-borderColor/40 pb-2 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2 text-bolt-elements-textSecondary">
                <span className="uppercase tracking-wide">{entry.category}</span>
                <span className="uppercase tracking-wide">{entry.level}</span>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="text-bolt-elements-textPrimary">{entry.message}</div>
              {formatDetails(entry.details) && (
                <pre className="mt-1 p-2 rounded bg-bolt-elements-background-depth-2 text-[11px] leading-4 text-bolt-elements-textSecondary overflow-x-auto whitespace-pre-wrap break-words">
                  {formatDetails(entry.details)}
                </pre>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-bolt-elements-textSecondary">{emptyMessage}</div>
      )}
    </div>
  );
}
