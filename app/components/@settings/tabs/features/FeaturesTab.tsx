// Remove unused imports
import React, { memo, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { PromptLibrary } from '~/lib/common/prompt-library';

interface FeatureToggle {
  id: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  beta?: boolean;
  experimental?: boolean;
  tooltip?: string;
}

type AdminSystemSettings = {
  apachePhp: {
    enabled: boolean;
    ftpHost: string;
    ftpPort: number;
    ftpUsername: string;
    ftpPassword: string;
    serverRootPath: string;
    publicBaseUrl: string;
  };
  n8n: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
  };
  openclaw: {
    enabled: boolean;
    baseUrl: string;
    timeoutMs: number;
    allowedTools: string;
  };
};

const DEFAULT_SYSTEM_SETTINGS: AdminSystemSettings = {
  apachePhp: {
    enabled: false,
    ftpHost: '',
    ftpPort: 21,
    ftpUsername: '',
    ftpPassword: '',
    serverRootPath: '/var/www/html',
    publicBaseUrl: '',
  },
  n8n: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
  },
  openclaw: {
    enabled: false,
    baseUrl: '',
    timeoutMs: 30000,
    allowedTools: '',
  },
};

const FeatureCard = memo(
  ({
    feature,
    index,
    onToggle,
  }: {
    feature: FeatureToggle;
    index: number;
    onToggle: (id: string, enabled: boolean) => void;
  }) => (
    <motion.div
      key={feature.id}
      layoutId={feature.id}
      className={classNames(
        'relative group cursor-pointer',
        'bg-bolt-elements-background-depth-2',
        'hover:bg-bolt-elements-background-depth-3',
        'transition-colors duration-200',
        'rounded-lg overflow-hidden',
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={classNames(feature.icon, 'w-5 h-5 text-bolt-elements-textSecondary')} />
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-bolt-elements-textPrimary">{feature.title}</h4>
              {feature.beta && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-500 font-medium">Beta</span>
              )}
              {feature.experimental && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/10 text-orange-500 font-medium">
                  Experimental
                </span>
              )}
            </div>
          </div>
          <Switch checked={feature.enabled} onCheckedChange={(checked) => onToggle(feature.id, checked)} />
        </div>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">{feature.description}</p>
        {feature.tooltip && <p className="mt-1 text-xs text-bolt-elements-textTertiary">{feature.tooltip}</p>}
      </div>
    </motion.div>
  ),
);

const FeatureSection = memo(
  ({
    title,
    features,
    icon,
    description,
    onToggleFeature,
  }: {
    title: string;
    features: FeatureToggle[];
    icon: string;
    description: string;
    onToggleFeature: (id: string, enabled: boolean) => void;
  }) => (
    <motion.div
      layout
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3">
        <div className={classNames(icon, 'text-xl text-purple-500')} />
        <div>
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary">{title}</h3>
          <p className="text-sm text-bolt-elements-textSecondary">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature, index) => (
          <FeatureCard key={feature.id} feature={feature} index={index} onToggle={onToggleFeature} />
        ))}
      </div>
    </motion.div>
  ),
);

export default function FeaturesTab() {
  const {
    autoSelectTemplate,
    isLatestBranch,
    contextOptimizationEnabled,
    eventLogs,
    setAutoSelectTemplate,
    enableLatestBranch,
    enableContextOptimization,
    setEventLogs,
    setPromptId,
    promptId,
    customPromptEnabled,
    setCustomPromptEnabled,
    customPromptText,
    setCustomPromptText,
    customPromptMode,
    setCustomPromptMode,
    dbProvider,
    setDbProvider,
    dbPostgresUrl,
    setDbPostgresUrl,
  } = useSettings();
  const [isAdmin, setIsAdmin] = useState(false);
  const [systemSettings, setSystemSettings] = useState<AdminSystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [systemSettingsLoading, setSystemSettingsLoading] = useState(true);
  const [systemSettingsSaving, setSystemSettingsSaving] = useState(false);

  // Enable features by default on first load
  React.useEffect(() => {
    // Only set defaults if values are undefined
    if (isLatestBranch === undefined) {
      enableLatestBranch(false); // Default: OFF - Don't auto-update from main branch
    }

    if (contextOptimizationEnabled === undefined) {
      enableContextOptimization(true); // Default: ON - Enable context optimization
    }

    if (autoSelectTemplate === undefined) {
      setAutoSelectTemplate(true); // Default: ON - Enable auto-select templates
    }

    if (promptId === undefined) {
      setPromptId('default'); // Default: 'default'
    }

    if (eventLogs === undefined) {
      setEventLogs(true); // Default: ON - Enable event logging
    }
  }, []); // Only run once on component mount

  useEffect(() => {
    let cancelled = false;

    const loadAdminSettings = async () => {
      try {
        const sessionResponse = await fetch('/api/auth/session');
        const session = (await sessionResponse.json()) as {
          authenticated: boolean;
          user: { isAdmin: boolean } | null;
        };

        if (!session.authenticated || !session.user?.isAdmin) {
          if (!cancelled) {
            setIsAdmin(false);
            setSystemSettingsLoading(false);
          }

          return;
        }

        if (!cancelled) {
          setIsAdmin(true);
        }

        const response = await fetch('/api/system-settings');
        const data = (await response.json()) as {
          ok?: boolean;
          settings?: AdminSystemSettings;
        };

        if (!cancelled && response.ok && data.ok && data.settings) {
          setSystemSettings(data.settings);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setSystemSettingsLoading(false);
        }
      }
    };

    void loadAdminSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveSystemSettings = useCallback(async () => {
    try {
      setSystemSettingsSaving(true);

      const response = await fetch('/api/system-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: systemSettings }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        toast.error(data.error || 'Failed to save system settings');
        return;
      }

      toast.success('System settings saved');
    } catch {
      toast.error('Failed to save system settings');
    } finally {
      setSystemSettingsSaving(false);
    }
  }, [systemSettings]);

  const handleToggleFeature = useCallback(
    (id: string, enabled: boolean) => {
      switch (id) {
        case 'latestBranch': {
          enableLatestBranch(enabled);
          toast.success(`Main branch updates ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        case 'autoSelectTemplate': {
          setAutoSelectTemplate(enabled);
          toast.success(`Auto select template ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        case 'contextOptimization': {
          enableContextOptimization(enabled);
          toast.success(`Context optimization ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        case 'eventLogs': {
          setEventLogs(enabled);
          toast.success(`Event logging ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        default:
          break;
      }
    },
    [enableLatestBranch, setAutoSelectTemplate, enableContextOptimization, setEventLogs],
  );

  const getCurrentBasePrompt = useCallback(() => {
    return (
      PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
        cwd: '/home/project',
        allowedHtmlElements: [],
        modificationTagName: 'bolt_file_modifications',
        supabase: {
          isConnected: false,
          hasSelectedProject: false,
          credentials: undefined,
        },
      }) || ''
    );
  }, [promptId]);

  const features = {
    stable: [
      {
        id: 'latestBranch',
        title: 'Main Branch Updates',
        description: 'Notify when a newer Bolt2.dyi version is available and allow update attempts',
        icon: 'i-ph:git-branch',
        enabled: isLatestBranch,
        tooltip:
          'When enabled, the app checks Bolt2.dyi main releases and can attempt internal update flow where supported',
      },
      {
        id: 'autoSelectTemplate',
        title: 'Auto Select Template',
        description: 'Automatically select starter template',
        icon: 'i-ph:selection',
        enabled: autoSelectTemplate,
        tooltip: 'Enabled by default to automatically select the most appropriate starter template',
      },
      {
        id: 'contextOptimization',
        title: 'Context Optimization',
        description: 'Optimize context for better responses',
        icon: 'i-ph:brain',
        enabled: contextOptimizationEnabled,
        tooltip: 'Enabled by default for improved AI responses',
      },
      {
        id: 'eventLogs',
        title: 'Event Logging',
        description: 'Enable detailed event logging and history',
        icon: 'i-ph:list-bullets',
        enabled: eventLogs,
        tooltip: 'Enabled by default to record detailed logs of system events and user actions',
      },
    ],
    beta: [],
  };

  return (
    <div className="flex flex-col gap-8">
      <FeatureSection
        title="Core Features"
        features={features.stable}
        icon="i-ph:check-circle"
        description="Essential features that are enabled by default for optimal performance"
        onToggleFeature={handleToggleFeature}
      />

      {features.beta.length > 0 && (
        <FeatureSection
          title="Beta Features"
          features={features.beta}
          icon="i-ph:test-tube"
          description="New features that are ready for testing but may have some rough edges"
          onToggleFeature={handleToggleFeature}
        />
      )}

      <motion.div
        layout
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-all duration-200',
          'rounded-lg p-4',
          'group',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-4">
          <div
            className={classNames(
              'p-2 rounded-lg text-xl',
              'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
              'transition-colors duration-200',
              'text-purple-500',
            )}
          >
            <div className="i-ph:book" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
              Prompt Library
            </h4>
            <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
              Choose a prompt from the library to use as the system prompt
            </p>
          </div>
          <select
            value={promptId}
            onChange={(e) => {
              setPromptId(e.target.value);
              toast.success('Prompt template updated');
            }}
            className={classNames(
              'p-2 rounded-lg text-sm min-w-[200px]',
              'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'group-hover:border-purple-500/30',
              'transition-all duration-200',
            )}
          >
            {PromptLibrary.getList().map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      <motion.div
        layout
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-all duration-200',
          'rounded-lg p-4',
          'group',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="flex items-start gap-4">
          <div
            className={classNames(
              'p-2 rounded-lg text-xl',
              'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
              'transition-colors duration-200',
              'text-purple-500',
            )}
          >
            <div className="i-ph:sliders-horizontal" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
                  Custom System Prompt
                </h4>
                <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                  Use selected prompt library item as base and append your own custom system instructions
                </p>
              </div>
              <Switch
                checked={customPromptEnabled}
                onCheckedChange={(checked) => {
                  setCustomPromptEnabled(checked);
                  toast.success(`Custom prompt ${checked ? 'enabled' : 'disabled'}`);
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustomPromptMode('append');
                  toast.success('Prompt mode set to append');
                }}
                className={classNames(
                  'px-2 py-1 text-xs rounded-lg',
                  customPromptMode === 'append'
                    ? 'bg-purple-500/20 text-purple-500'
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4',
                )}
              >
                Append Mode
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomPromptMode('replace');
                  toast.success('Prompt mode set to replace');
                }}
                className={classNames(
                  'px-2 py-1 text-xs rounded-lg',
                  customPromptMode === 'replace'
                    ? 'bg-purple-500/20 text-purple-500'
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4',
                )}
              >
                Replace Mode
              </button>
              <button
                type="button"
                onClick={() => {
                  const basePrompt = getCurrentBasePrompt();
                  setCustomPromptEnabled(true);
                  setCustomPromptMode('replace');
                  setCustomPromptText(basePrompt);
                  toast.success('Loaded current system prompt into editor');
                }}
                className="px-2 py-1 text-xs rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
              >
                Load Current System Prompt
              </button>
            </div>

            <div className="mt-3">
              <textarea
                value={customPromptText}
                onChange={(e) => setCustomPromptText(e.target.value)}
                placeholder="Example: Always answer in Finnish, prioritize minimal dependencies, and explain trade-offs briefly."
                className={classNames(
                  'w-full min-h-[140px] p-3 rounded-lg text-sm',
                  'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary',
                  'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                  'group-hover:border-purple-500/30',
                  'transition-all duration-200',
                )}
              />
              <p className="text-xs text-bolt-elements-textSecondary mt-2">
                {customPromptMode === 'replace'
                  ? 'Replace mode: this text becomes the full system prompt.'
                  : 'Append mode: this text is appended to the selected base prompt.'}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        layout
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-all duration-200',
          'rounded-lg p-4',
          'group',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-start gap-4">
          <div
            className={classNames(
              'p-2 rounded-lg text-xl',
              'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
              'transition-colors duration-200',
              'text-purple-500',
            )}
          >
            <div className="i-ph:database" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
              Database Connection
            </h4>
            <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
              Configure storage backend defaults. SQLite is default; PostgreSQL can be enabled for admin-managed
              deployments.
            </p>

            <div className="mt-3 flex flex-col gap-3">
              <select
                value={dbProvider}
                onChange={(e) => {
                  const provider = (e.target.value === 'postgres' ? 'postgres' : 'sqlite') as 'sqlite' | 'postgres';
                  setDbProvider(provider);
                  toast.success(`Database provider set to ${provider}`);
                }}
                className={classNames(
                  'p-2 rounded-lg text-sm max-w-[240px]',
                  'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary',
                  'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                )}
              >
                <option value="sqlite">SQLite (default)</option>
                <option value="postgres">PostgreSQL</option>
              </select>

              {dbProvider === 'postgres' && (
                <input
                  type="password"
                  value={dbPostgresUrl}
                  onChange={(e) => setDbPostgresUrl(e.target.value)}
                  placeholder="postgresql://user:pass@host:5432/dbname"
                  className={classNames(
                    'w-full p-2 rounded-lg text-sm',
                    'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                    'text-bolt-elements-textPrimary',
                    'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                  )}
                />
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {isAdmin && (
        <motion.div
          layout
          className={classNames(
            'bg-bolt-elements-background-depth-2',
            'hover:bg-bolt-elements-background-depth-3',
            'transition-all duration-200',
            'rounded-lg p-4',
            'group',
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <div className="flex items-start gap-4">
            <div
              className={classNames(
                'p-2 rounded-lg text-xl',
                'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
                'transition-colors duration-200',
                'text-purple-500',
              )}
            >
              <div className="i-ph:shield-check" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
                System Settings (Admin)
              </h4>
              <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                Global runtime targets for Apache/PHP deployments and n8n workflow builders.
              </p>

              {systemSettingsLoading ? (
                <p className="text-xs text-bolt-elements-textSecondary mt-3">Loading system settings…</p>
              ) : (
                <div className="mt-3 flex flex-col gap-5">
                  <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
                    <div className="flex items-center justify-between gap-3">
                      <h5 className="text-sm font-medium text-bolt-elements-textPrimary">Apache + PHP target</h5>
                      <Switch
                        checked={systemSettings.apachePhp.enabled}
                        onCheckedChange={(checked) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            apachePhp: { ...prev.apachePhp, enabled: checked },
                          }))
                        }
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        value={systemSettings.apachePhp.ftpHost}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            apachePhp: { ...prev.apachePhp, ftpHost: e.target.value },
                          }))
                        }
                        placeholder="FTP host (e.g. ftp.example.com)"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        value={String(systemSettings.apachePhp.ftpPort)}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          setSystemSettings((prev) => ({
                            ...prev,
                            apachePhp: {
                              ...prev.apachePhp,
                              ftpPort: Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 21,
                            },
                          }));
                        }}
                        placeholder="FTP port"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        value={systemSettings.apachePhp.ftpUsername}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            apachePhp: { ...prev.apachePhp, ftpUsername: e.target.value },
                          }))
                        }
                        placeholder="FTP username"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        type="password"
                        value={systemSettings.apachePhp.ftpPassword}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            apachePhp: { ...prev.apachePhp, ftpPassword: e.target.value },
                          }))
                        }
                        placeholder="FTP password"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        value={systemSettings.apachePhp.serverRootPath}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            apachePhp: { ...prev.apachePhp, serverRootPath: e.target.value },
                          }))
                        }
                        placeholder="Server root path (e.g. /var/www/html)"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        value={systemSettings.apachePhp.publicBaseUrl}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            apachePhp: { ...prev.apachePhp, publicBaseUrl: e.target.value },
                          }))
                        }
                        placeholder="Public base URL (https://example.com)"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
                    <div className="flex items-center justify-between gap-3">
                      <h5 className="text-sm font-medium text-bolt-elements-textPrimary">n8n workflow target</h5>
                      <Switch
                        checked={systemSettings.n8n.enabled}
                        onCheckedChange={(checked) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            n8n: { ...prev.n8n, enabled: checked },
                          }))
                        }
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        value={systemSettings.n8n.baseUrl}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            n8n: { ...prev.n8n, baseUrl: e.target.value },
                          }))
                        }
                        placeholder="n8n base URL (https://n8n.example.com)"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        type="password"
                        value={systemSettings.n8n.apiKey}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            n8n: { ...prev.n8n, apiKey: e.target.value },
                          }))
                        }
                        placeholder="n8n API key"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
                    <div className="flex items-center justify-between gap-3">
                      <h5 className="text-sm font-medium text-bolt-elements-textPrimary">OpenClaw integration</h5>
                      <Switch
                        checked={systemSettings.openclaw.enabled}
                        onCheckedChange={(checked) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            openclaw: { ...prev.openclaw, enabled: checked },
                          }))
                        }
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        value={systemSettings.openclaw.baseUrl}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            openclaw: { ...prev.openclaw, baseUrl: e.target.value },
                          }))
                        }
                        placeholder="OpenClaw base URL (https://openclaw.example.com)"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        type="number"
                        value={String(systemSettings.openclaw.timeoutMs)}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          setSystemSettings((prev) => ({
                            ...prev,
                            openclaw: {
                              ...prev.openclaw,
                              timeoutMs: Number.isFinite(parsed) && parsed > 0 ? parsed : 30000,
                            },
                          }));
                        }}
                        placeholder="Timeout ms"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                      <input
                        value={systemSettings.openclaw.allowedTools}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            openclaw: { ...prev.openclaw, allowedTools: e.target.value },
                          }))
                        }
                        placeholder="Allowed tools CSV (e.g. terminal.exec,git.status)"
                        className={classNames(
                          'w-full p-2 rounded-lg text-sm md:col-span-2',
                          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                          'text-bolt-elements-textPrimary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={systemSettingsSaving}
                      onClick={() => void saveSystemSettings()}
                      className={classNames(
                        'px-3 py-2 rounded-lg text-sm',
                        'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30',
                        'disabled:opacity-60',
                      )}
                    >
                      {systemSettingsSaving ? 'Saving…' : 'Save system settings'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
