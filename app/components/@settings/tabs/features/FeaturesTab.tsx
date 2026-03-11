// Remove unused imports
import React, { memo, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

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
    debug,
    enableDebugMode,
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
    dbProvider,
    setDbProvider,
    dbPostgresUrl,
    setDbPostgresUrl,
  } = useSettings();

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

        case 'debugPanel': {
          enableDebugMode(enabled);
          toast.success(`Debug panel button ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        default:
          break;
      }
    },
    [enableLatestBranch, setAutoSelectTemplate, enableContextOptimization, setEventLogs, enableDebugMode],
  );

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
      {
        id: 'debugPanel',
        title: 'Show Chat Debug Button',
        description: 'Show or hide the "Show debug panel" button while streaming',
        icon: 'i-ph:bug-droid',
        enabled: debug,
        tooltip: 'Turn this on to inspect send routing, response traces, and error details from chat execution logs.',
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

    </div>
  );
}
