import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { clearCpanelConnection, cpanelConnection, updateCpanelConnection } from '~/lib/stores/cpanel';

export default function VercelTab() {
  const connection = useStore(cpanelConnection);
  const [host, setHost] = useState(connection.host || '');
  const [username, setUsername] = useState(connection.username || '');
  const [token, setToken] = useState(connection.token || '');
  const [rootPath, setRootPath] = useState(connection.rootPath || '/public_html');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!host.trim() || !username.trim() || !token.trim()) {
      toast.error('Please provide cPanel host, username and API token');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch('/api/cpanel-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), username: username.trim(), token: token.trim() }),
      });
      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to connect to cPanel');
      }

      updateCpanelConnection({
        host: host.trim(),
        username: username.trim(),
        token: token.trim(),
        rootPath: rootPath.trim() || '/public_html',
        user: data.user || null,
        stats: data.stats,
      });

      toast.success('Connected to cPanel');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect to cPanel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">cPanel API Connectivity</h3>
        <p className="text-xs text-bolt-elements-textSecondary">
          Connect with a cPanel API token. Deployment works when your hosting provider allows UAPI Fileman endpoints.
        </p>

        <div>
          <label className="mb-1 block text-xs text-bolt-elements-textSecondary">cPanel Host</label>
          <input
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="https://cpanel.example.com:2083"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-bolt-elements-textSecondary">Username</label>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="cpanel username"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-bolt-elements-textSecondary">API Token</label>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="cPanel API token"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-bolt-elements-textSecondary">Deploy Root Path</label>
          <input
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="/public_html"
            className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleConnect} disabled={loading}>{loading ? 'Connecting...' : 'Connect cPanel'}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearCpanelConnection();
              setHost('');
              setUsername('');
              setToken('');
              setRootPath('/public_html');
              toast.success('cPanel disconnected');
            }}
          >
            Disconnect
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div className="text-xs text-bolt-elements-textSecondary">Connected User</div>
        <div className="mt-1 text-sm text-bolt-elements-textPrimary">{connection.user?.user || 'Not connected'}</div>
        <div className="mt-3 text-xs text-bolt-elements-textSecondary">Detected Domains: {connection.stats?.totalDomains || 0}</div>
      </div>
    </div>
  );
}
