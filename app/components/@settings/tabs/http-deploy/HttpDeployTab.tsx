import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Switch } from '~/components/ui/Switch';

type ApachePhpSettings = {
  enabled: boolean;
  ftpHost: string;
  ftpPort: number;
  ftpUsername: string;
  ftpPassword: string;
  serverRootPath: string;
  publicBaseUrl: string;
};

type SystemSettings = {
  apachePhp: ApachePhpSettings;
  n8n: Record<string, unknown>;
  openclaw: Record<string, unknown>;
};

const DEFAULTS: ApachePhpSettings = {
  enabled: false,
  ftpHost: '',
  ftpPort: 21,
  ftpUsername: '',
  ftpPassword: '',
  serverRootPath: '/var/www/html',
  publicBaseUrl: '',
};

const inputCls = classNames(
  'w-full rounded-lg border border-bolt-elements-borderColor',
  'bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-bolt-elements-textPrimary',
  'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
);

export default function HttpDeployTab() {
  const [apache, setApache] = useState<ApachePhpSettings>(DEFAULTS);
  const [fullSettings, setFullSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const sessionRes = await fetch('/api/auth/session');
        const session = (await sessionRes.json()) as {
          authenticated: boolean;
          user: { isAdmin: boolean } | null;
        };

        if (!session.authenticated || !session.user?.isAdmin) {
          if (!cancelled) {
            setIsAdmin(false);
            setLoading(false);
          }

          return;
        }

        if (!cancelled) {
          setIsAdmin(true);
        }

        const res = await fetch('/api/system-settings');
        const data = (await res.json()) as { ok?: boolean; settings?: SystemSettings };

        if (!cancelled && res.ok && data.ok && data.settings) {
          setFullSettings(data.settings);
          setApache(data.settings.apachePhp ?? DEFAULTS);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    if (!fullSettings) {
      return;
    }

    try {
      setSaving(true);

      const merged = { ...fullSettings, apachePhp: apache };
      const res = await fetch('/api/system-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: merged }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Failed to save');
        return;
      }

      setFullSettings(merged);
      toast.success('HTTP deploy settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [apache, fullSettings]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="i-svg-spinners:90-ring-with-bg w-8 h-8 text-purple-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="py-8 text-sm text-bolt-elements-textSecondary">
        Admin access is required to configure HTTP deploy targets.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Enable Apache + PHP deploy target</h3>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Push project files to an Apache/PHP server over FTP after each build.
            </p>
          </div>
          <Switch
            checked={apache.enabled}
            onCheckedChange={(checked) => setApache((prev) => ({ ...prev, enabled: checked }))}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">FTP Host</label>
            <input
              value={apache.ftpHost}
              onChange={(e) => setApache((prev) => ({ ...prev, ftpHost: e.target.value }))}
              placeholder="ftp.example.com"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">FTP Port</label>
            <input
              type="number"
              value={String(apache.ftpPort)}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                setApache((prev) => ({
                  ...prev,
                  ftpPort: Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 21,
                }));
              }}
              placeholder="21"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">FTP Username</label>
            <input
              value={apache.ftpUsername}
              onChange={(e) => setApache((prev) => ({ ...prev, ftpUsername: e.target.value }))}
              placeholder="ftpuser"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">FTP Password</label>
            <input
              type="password"
              value={apache.ftpPassword}
              onChange={(e) => setApache((prev) => ({ ...prev, ftpPassword: e.target.value }))}
              placeholder="FTP password"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">
              Server Root Path
            </label>
            <input
              value={apache.serverRootPath}
              onChange={(e) => setApache((prev) => ({ ...prev, serverRootPath: e.target.value }))}
              placeholder="/var/www/html"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">
              Public Base URL
            </label>
            <input
              value={apache.publicBaseUrl}
              onChange={(e) => setApache((prev) => ({ ...prev, publicBaseUrl: e.target.value }))}
              placeholder="https://example.com"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={classNames(
            'rounded-lg px-4 py-2 text-sm',
            'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30',
            'disabled:opacity-60',
          )}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
