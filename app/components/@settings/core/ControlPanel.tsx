import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import { tabConfigurationStore, resetTabConfiguration } from '~/lib/stores/settings';
import { profileStore } from '~/lib/stores/profile';
import type { TabType, Profile } from './types';
import { TAB_LABELS, TAB_DESCRIPTIONS } from './constants';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { SettingsNavigation } from './SettingsNavigation';
import { SettingsContentPanel } from './SettingsContentPanel';

// Import all tab components
import ProfileTab from '~/components/@settings/tabs/profile/ProfileTab';
import SettingsTab from '~/components/@settings/tabs/settings/SettingsTab';
import NotificationsTab from '~/components/@settings/tabs/notifications/NotificationsTab';
import FeaturesTab from '~/components/@settings/tabs/features/FeaturesTab';
import { DataTab } from '~/components/@settings/tabs/data/DataTab';
import { EventLogsTab } from '~/components/@settings/tabs/event-logs/EventLogsTab';
import GitHubTab from '~/components/@settings/tabs/github/GitHubTab';
import GitLabTab from '~/components/@settings/tabs/gitlab/GitLabTab';
import SupabaseTab from '~/components/@settings/tabs/supabase/SupabaseTab';
import VercelTab from '~/components/@settings/tabs/vercel/VercelTab';
import NetlifyTab from '~/components/@settings/tabs/netlify/NetlifyTab';
import CloudProvidersTab from '~/components/@settings/tabs/providers/cloud/CloudProvidersTab';
import LocalProvidersTab from '~/components/@settings/tabs/providers/local/LocalProvidersTab';
import McpTab from '~/components/@settings/tabs/mcp/McpTab';
import N8nTab from '~/components/@settings/tabs/n8n/N8nTab';
import OpenClawTab from '~/components/@settings/tabs/openclaw/OpenClawTab';
import HttpDeployTab from '~/components/@settings/tabs/http-deploy/HttpDeployTab';
import SystemPromptTab from '~/components/@settings/tabs/system-prompt/SystemPromptTab';
import UserManagementTab from '../tabs/users/UserManagementTab';
import type { PlatformRole } from '~/platform/security/authz';

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabType;
}

type SettingsSection = 'General' | 'Preferences' | 'AI' | 'Integrations' | 'Security' | 'System';
type SettingsViewMode = 'overview' | 'detail';

const SECTION_ORDER: SettingsSection[] = ['General', 'Preferences', 'AI', 'Integrations', 'Security', 'System'];

const TAB_SECTION_MAP: Partial<Record<TabType, SettingsSection>> = {
  profile: 'General',
  'user-management': 'Security',
  settings: 'General',
  notifications: 'Preferences',
  features: 'Preferences',
  'cloud-providers': 'AI',
  'local-providers': 'AI',
  mcp: 'AI',
  github: 'Integrations',
  gitlab: 'Integrations',
  netlify: 'Integrations',
  vercel: 'Integrations',
  supabase: 'Integrations',
  n8n: 'Integrations',
  openclaw: 'Integrations',
  'http-deploy': 'Integrations',
  data: 'System',
  'event-logs': 'System',
  'system-prompt': 'System',
};

const SECTION_META: Record<
  SettingsSection,
  {
    icon: string;
    title: string;
    description: string;
  }
> = {
  General: {
    icon: 'i-ph:user-gear',
    title: 'General',
    description: 'Profile, account identity, and core workspace behavior.',
  },
  Preferences: {
    icon: 'i-ph:sliders-horizontal',
    title: 'Preferences',
    description: 'Notifications, feature behavior, and personal defaults.',
  },
  AI: {
    icon: 'i-ph:brain',
    title: 'AI',
    description: 'Model providers, local runtimes, and MCP configuration.',
  },
  Integrations: {
    icon: 'i-ph:plugs-connected',
    title: 'Integrations',
    description: 'Git, Supabase, deployment, and external service links.',
  },
  Security: {
    icon: 'i-ph:shield-check',
    title: 'Security',
    description: 'Authentication safeguards and access related controls.',
  },
  System: {
    icon: 'i-ph:database',
    title: 'System',
    description: 'Data tools, logs, and environment-level maintenance.',
  },
};

export const ControlPanel = ({ open, onClose, initialTab = 'profile' }: ControlPanelProps) => {
  // State - Start with initialTab or 'profile' as default active tab
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [viewMode, setViewMode] = useState<SettingsViewMode>('detail');
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [currentRole, setCurrentRole] = useState<PlatformRole>('user');

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);
  const profile = useStore(profileStore) as Profile;

  // Status hooks
  const { hasNewFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, acknowledgeIssue } = useConnectionStatus();

  // Add visibleTabs logic using useMemo with optimized calculations
  const visibleTabs = useMemo(() => {
    if (!tabConfiguration?.userTabs || !Array.isArray(tabConfiguration.userTabs)) {
      console.warn('Invalid tab configuration, resetting to defaults');
      resetTabConfiguration();

      return [];
    }

    const notificationsDisabled = profile?.preferences?.notifications === false;

    // Optimize user mode tab filtering and add labels
    return tabConfiguration.userTabs
      .filter((tab) => {
        if (!tab?.id) {
          return false;
        }

        if (tab.id === 'notifications' && notificationsDisabled) {
          return false;
        }

        return tab.visible && tab.window === 'user';
      })
      .map((tab) => ({
        ...tab,
        label: TAB_LABELS[tab.id as TabType] || tab.id,
      }))
      .sort((a, b) => a.order - b.order);
  }, [currentRole, tabConfiguration, profile?.preferences?.notifications]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadSessionRole = async () => {
      try {
        const response = await fetch('/api/auth/session');
        const data = (await response.json()) as {
          authenticated?: boolean;
          user?: { role?: PlatformRole } | null;
        };

        if (!cancelled) {
          setCurrentRole(data.authenticated ? data.user?.role || 'user' : 'user');
        }
      } catch {
        if (!cancelled) {
          setCurrentRole('user');
        }
      }
    };

    void loadSessionRole();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const sectionedTabs = useMemo(() => {
    const buckets = SECTION_ORDER.reduce(
      (acc, section) => {
        acc[section] = [];

        return acc;
      },
      {} as Record<SettingsSection, typeof visibleTabs>,
    );

    for (const tab of visibleTabs) {
      const section = TAB_SECTION_MAP[tab.id as TabType] ?? 'General';
      buckets[section].push(tab);
    }

    return buckets;
  }, [visibleTabs]);

  // Reset to default view when modal opens
  useEffect(() => {
    if (open) {
      // When opening, use initialTab or fall back to profile
      setActiveTab(initialTab || 'profile');
      setViewMode('detail');
      setLoadingTab(null);
      setNavCollapsed(false);
    }
  }, [open, initialTab]);

  const firstTabBySection = useMemo(() => {
    const result: Partial<Record<SettingsSection, TabType>> = {};

    for (const section of SECTION_ORDER) {
      const sectionTabs = sectionedTabs[section] || [];

      if (sectionTabs.length > 0) {
        result[section] = sectionTabs[0].id as TabType;
      }
    }

    return result;
  }, [sectionedTabs]);

  // Handle closing - close button and ESC key
  const handleClose = () => {
    onClose();
  };

  // Handle ESC key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        handleClose();
      }
    };

    if (!open) {
      return undefined;
    }

    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [open, onClose]);

  const getTabComponent = (tabId: TabType) => {
    switch (tabId) {
      case 'profile':
        return <ProfileTab />;
      case 'user-management':
        return <UserManagementTab />;
      case 'settings':
        return <SettingsTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'features':
        return <FeaturesTab />;
      case 'data':
        return <DataTab />;
      case 'cloud-providers':
        return <CloudProvidersTab />;
      case 'local-providers':
        return <LocalProvidersTab />;
      case 'github':
        return <GitHubTab />;
      case 'gitlab':
        return <GitLabTab />;
      case 'supabase':
        return <SupabaseTab />;
      case 'vercel':
        return <VercelTab />;
      case 'netlify':
        return <NetlifyTab />;
      case 'event-logs':
        return <EventLogsTab />;
      case 'mcp':
        return <McpTab />;
      case 'n8n':
        return <N8nTab />;
      case 'openclaw':
        return <OpenClawTab />;
      case 'http-deploy':
        return <HttpDeployTab />;
      case 'system-prompt':
        return <SystemPromptTab />;

      default:
        return null;
    }
  };

  const getTabUpdateStatus = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'features':
        return hasNewFeatures;
      case 'notifications':
        return hasUnreadNotifications;
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        return hasConnectionIssues;
      default:
        return false;
    }
  };

  const handleTabClick = (tabId: TabType) => {
    setViewMode('detail');
    setLoadingTab(tabId);
    setActiveTab(tabId);

    // Acknowledge notifications based on tab
    switch (tabId) {
      case 'features':
        acknowledgeAllFeatures();
        break;
      case 'notifications':
        markAllAsRead();
        break;
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        acknowledgeIssue();
        break;
    }

    // Clear loading state after a delay
    setTimeout(() => setLoadingTab(null), 300);
  };

  const handleSectionClick = (section: SettingsSection) => {
    const tabId = firstTabBySection[section] || 'profile';
    handleTabClick(tabId);
  };

  // Don't render anything if not open
  if (!open) {
    return null;
  }

  return (
    <>
      {/* Full-screen Settings Workspace */}
      <div className={classNames('absolute inset-0 z-[101] animate-in fade-in duration-200')}>
        <div
          className={classNames(
            'w-full h-full',
            'bg-bolt-elements-background-depth-1',
            'flex flex-col overflow-hidden',
            'relative',
            'transform transition-all duration-200 ease-out',
          )}
        >
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <BackgroundRays />
          </div>

          <div className="relative z-10 flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor">
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">Settings</h1>
              </div>

              <button
                onClick={handleClose}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent hover:bg-bolt-elements-background-depth-3 group transition-all duration-200"
                aria-label="Close settings"
              >
                <div className="i-ph:x w-4 h-4 text-bolt-elements-textSecondary group-hover:text-bolt-elements-textPrimary transition-colors" />
              </button>
            </div>

            {/* Two-Panel Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Navigation */}
              <div className="hidden md:flex">
                <SettingsNavigation
                  activeTab={activeTab}
                  sectionedTabs={sectionedTabs}
                  sectionOrder={SECTION_ORDER}
                  collapsed={navCollapsed}
                  onToggleCollapse={() => setNavCollapsed((value) => !value)}
                  getTabUpdateStatus={getTabUpdateStatus}
                  onTabClick={handleTabClick}
                />
              </div>

              {/* Right Content Panel */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="md:hidden px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                  <label
                    htmlFor="settings-mobile-section"
                    className="block text-xs font-medium text-bolt-elements-textTertiary mb-2"
                  >
                    Section
                  </label>
                  <select
                    id="settings-mobile-section"
                    value={viewMode === 'overview' ? '__overview__' : activeTab}
                    onChange={(event) => {
                      if (event.target.value === '__overview__') {
                        setViewMode('overview');
                        setLoadingTab(null);

                        return;
                      }

                      handleTabClick(event.target.value as TabType);
                    }}
                    className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
                  >
                    <option value="__overview__">All Categories</option>
                    {visibleTabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.label || tab.id}
                      </option>
                    ))}
                  </select>
                </div>

                {viewMode === 'overview' ? (
                  <SettingsContentPanel
                    title="Control Panel"
                    description="Choose a settings category to open focused controls in the workspace."
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
                      {SECTION_ORDER.map((section) => {
                        const sectionTabs = sectionedTabs[section] || [];
                        const tabCount = sectionTabs.length;

                        return (
                          <button
                            key={section}
                            type="button"
                            onClick={() => handleSectionClick(section)}
                            className={classNames(
                              'text-left rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
                              'p-4 md:p-5 transition-all duration-200',
                              'hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-background-depth-3 hover:-translate-y-0.5',
                              'focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive focus:ring-offset-0',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className={classNames(
                                  'h-10 w-10 rounded-lg flex items-center justify-center',
                                  'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent',
                                )}
                              >
                                <span className={classNames(SECTION_META[section].icon, 'h-5 w-5')} />
                              </div>
                              <span className="text-xs font-medium text-bolt-elements-textSecondary">
                                {tabCount} tabs
                              </span>
                            </div>

                            <h3 className="mt-4 text-base md:text-lg font-semibold text-bolt-elements-textPrimary">
                              {SECTION_META[section].title}
                            </h3>
                            <p className="mt-2 text-sm text-bolt-elements-textSecondary leading-relaxed">
                              {SECTION_META[section].description}
                            </p>

                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {sectionTabs.slice(0, 3).map((tab) => (
                                <span
                                  key={tab.id}
                                  className="inline-flex items-center rounded-md bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textSecondary"
                                >
                                  {tab.label || tab.id}
                                </span>
                              ))}
                              {tabCount > 3 ? (
                                <span className="inline-flex items-center rounded-md bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textSecondary">
                                  +{tabCount - 3} more
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </SettingsContentPanel>
                ) : (
                  <SettingsContentPanel title={TAB_LABELS[activeTab]} description={TAB_DESCRIPTIONS[activeTab]}>
                    <div className="mb-4 md:mb-5">
                      <button
                        type="button"
                        onClick={() => setViewMode('overview')}
                        className="inline-flex items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2"
                      >
                        <span className="i-ph:arrow-left h-4 w-4" />
                        Back to Categories
                      </button>
                    </div>

                    {loadingTab === activeTab ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="i-svg-spinners:90-ring-with-bg w-8 h-8 text-purple-500" />
                      </div>
                    ) : (
                      getTabComponent(activeTab)
                    )}
                  </SettingsContentPanel>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
