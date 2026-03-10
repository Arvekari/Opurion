import { type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';
import type { TabType } from '~/components/@settings/core/types';

interface SettingsNavigationItemProps {
  label: string;
  isActive: boolean;
  hasUpdate?: boolean;
  onClick: () => void;
}

const SettingsNavigationItem = ({ label, isActive, hasUpdate, onClick }: SettingsNavigationItemProps) => {
  return (
    <button
      onClick={onClick}
      className={classNames(
        'group w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150',
        isActive
          ? 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
      )}
    >
      <span>{label}</span>
      {hasUpdate && (
        <div className="w-2 h-2 rounded-full bg-purple-500 dark:bg-purple-400 animate-pulse" aria-label="Has updates" />
      )}
    </button>
  );
};

interface SettingsNavigationSectionProps {
  title: string;
  children: ReactNode;
}

const SettingsNavigationSection = ({ title, children }: SettingsNavigationSectionProps) => {
  return (
    <div className="space-y-1">
      <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
};

interface SettingsNavigationProps {
  activeTab: TabType | null;
  sectionedTabs: Record<string, Array<{ id: string; label?: string; visible: boolean; order: number }>>;
  sectionOrder: string[];
  getTabUpdateStatus: (tabId: TabType) => boolean;
  onTabClick: (tabId: TabType) => void;
}

export const SettingsNavigation = ({
  activeTab,
  sectionedTabs,
  sectionOrder,
  getTabUpdateStatus,
  onTabClick,
}: SettingsNavigationProps) => {
  return (
    <nav className="w-64 flex-shrink-0 bg-bolt-elements-background-depth-2 border-r border-bolt-elements-borderColor overflow-y-auto modern-scrollbar">
      <div className="p-4 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white px-3 mb-4">Settings</h2>
        </div>

        {sectionOrder.map((section) => {
          const tabs = sectionedTabs[section];

          if (!tabs || tabs.length === 0) {
            return null;
          }

          return (
            <SettingsNavigationSection key={section} title={section}>
              {tabs.map((tab: { id: string; label?: string }) => (
                <SettingsNavigationItem
                  key={tab.id}
                  label={tab.label || tab.id}
                  isActive={activeTab === tab.id}
                  hasUpdate={getTabUpdateStatus(tab.id as TabType)}
                  onClick={() => onTabClick(tab.id as TabType)}
                />
              ))}
            </SettingsNavigationSection>
          );
        })}
      </div>
    </nav>
  );
};
