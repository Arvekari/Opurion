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

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
}

type SettingsSection = 'General' | 'Preferences' | 'AI' | 'Integrations' | 'Security' | 'System';

const SECTION_ORDER: SettingsSection[] = ['General', 'Preferences', 'AI', 'Integrations', 'Security', 'System'];

const TAB_SECTION_MAP: Partial<Record<TabType, SettingsSection>> = {
  profile: 'General',
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
  data: 'System',
  'event-logs': 'System',
};

export const ControlPanel = ({ open, onClose }: ControlPanelProps) => {
  // State - Start with 'profile' as default active tab
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);

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
  }, [tabConfiguration, profile?.preferences?.notifications]);

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
      // When opening, set to profile as default
      setActiveTab('profile');
      setLoadingTab(null);
    }
  }, [open]);

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

  // Don't render anything if not open
  if (!open) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm z-[100] transition-opacity duration-200"
        onClick={handleClose}
      />

      {/* Full-screen Settings Panel */}
      <div
        className={classNames(
          'fixed inset-0 z-[101] flex items-center justify-center p-4',
          'animate-in fade-in duration-200',
        )}
      >
        <div
          className={classNames(
            'w-full max-w-[1400px] h-[90vh]',
            'bg-bolt-elements-background-depth-1',
            'rounded-2xl shadow-2xl',
            'border border-bolt-elements-borderColor',
            'flex flex-col overflow-hidden',
            'relative',
            'transform transition-all duration-200 ease-out',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <BackgroundRays />
          </div>

          <div className="relative z-10 flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor">
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h1>
              </div>

              <button
                onClick={handleClose}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
                aria-label="Close settings"
              >
                <div className="i-ph:x w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
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
                  getTabUpdateStatus={getTabUpdateStatus}
                  onTabClick={handleTabClick}
                />
              </div>

              {/* Right Content Panel */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="md:hidden px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                  <label
                    htmlFor="settings-mobile-section"
                    className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2"
                  >
                    Section
                  </label>
                  <select
                    id="settings-mobile-section"
                    value={activeTab}
                    onChange={(event) => handleTabClick(event.target.value as TabType)}
                    className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  >
                    {visibleTabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.label || tab.id}
                      </option>
                    ))}
                  </select>
                </div>

                <SettingsContentPanel title={TAB_LABELS[activeTab]} description={TAB_DESCRIPTIONS[activeTab]}>
                  {loadingTab === activeTab ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="i-svg-spinners:90-ring-with-bg w-8 h-8 text-purple-500" />
                    </div>
                  ) : (
                    getTabComponent(activeTab)
                  )}
                </SettingsContentPanel>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
