import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { clearPleskConnection, pleskConnection, updatePleskConnection } from '~/lib/stores/plesk';

export default function NetlifyTab() {
  const connection = useStore(pleskConnection);
  const [host, setHost] = useState(connection.host || '');
  const [token, setToken] = useState(connection.token || '');
  const [rootPath, setRootPath] = useState(connection.rootPath || '/httpdocs');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!host.trim() || !token.trim()) {
      toast.error('Please provide Plesk host and API token');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch('/api/plesk-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), token: token.trim() }),
      });
      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to connect to Plesk');
      }

      updatePleskConnection({
        host: host.trim(),
        token: token.trim(),
        rootPath: rootPath.trim() || '/httpdocs',
        user: data.user || null,
        stats: data.stats,
      });

      toast.success('Connected to Plesk');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect to Plesk');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Plesk API Connectivity</h3>
        <p className="text-xs text-bolt-elements-textSecondary">
          Connect using your Plesk API token. Deployment works when your ISP/server exposes supported Plesk file APIs.
        </p>

        <div>
          <label className="mb-1 block text-xs text-bolt-elements-textSecondary">Plesk Host</label>
          <input
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="https://plesk.example.com:8443"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-bolt-elements-textSecondary">API Token</label>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Plesk API token"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-bolt-elements-textSecondary">Deploy Root Path</label>
          <input
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="/httpdocs"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleConnect} disabled={loading}>{loading ? 'Connecting...' : 'Connect Plesk'}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearPleskConnection();
              setHost('');
              setToken('');
              setRootPath('/httpdocs');
              toast.success('Plesk disconnected');
            }}
          >
            Disconnect
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div className="text-xs text-bolt-elements-textSecondary">Connected User</div>
        <div className="mt-1 text-sm text-bolt-elements-textPrimary">{connection.user?.login || 'Not connected'}</div>
        <div className="mt-3 text-xs text-bolt-elements-textSecondary">Detected Domains: {connection.stats?.totalDomains || 0}</div>
      </div>
    </div>
  );
}
