import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Switch } from '~/components/ui/Switch';

type N8nSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
};

type SystemSettings = {
  apachePhp: Record<string, unknown>;
  n8n: N8nSettings;
  openclaw: Record<string, unknown>;
};

const DEFAULTS: N8nSettings = { enabled: false, baseUrl: '', apiKey: '' };

const inputCls = classNames(
  'w-full rounded-lg border border-bolt-elements-borderColor',
  'bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-bolt-elements-textPrimary',
  'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
);

export default function N8nTab() {
  const [n8n, setN8n] = useState<N8nSettings>(DEFAULTS);
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
          setN8n(data.settings.n8n ?? DEFAULTS);
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

      const merged = { ...fullSettings, n8n };
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
      toast.success('n8n settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [n8n, fullSettings]);

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
        Admin access is required to configure the n8n integration.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Enable n8n integration</h3>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Connect to an n8n instance to trigger and monitor workflows from Bolt.
            </p>
          </div>
          <Switch
            checked={n8n.enabled}
            onCheckedChange={(checked) => setN8n((prev) => ({ ...prev, enabled: checked }))}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">Base URL</label>
            <input
              value={n8n.baseUrl}
              onChange={(e) => setN8n((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://n8n.example.com"
              className={inputCls}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-bolt-elements-textSecondary">API Key</label>
            <input
              type="password"
              value={n8n.apiKey}
              onChange={(e) => setN8n((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="n8n API key"
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
