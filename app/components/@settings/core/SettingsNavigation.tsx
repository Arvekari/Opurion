import { type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';
import type { TabType } from '~/components/@settings/core/types';
import * as Tooltip from '@radix-ui/react-tooltip';

interface SettingsNavigationItemProps {
  label: string;
  icon: string;
  isActive: boolean;
  collapsed: boolean;
  hasUpdate?: boolean;
  onClick: () => void;
}

const SettingsNavigationItem = ({
  label,
  icon,
  isActive,
  collapsed,
  hasUpdate,
  onClick,
}: SettingsNavigationItemProps) => {
  const content = (
    <button
      onClick={onClick}
      className={classNames(
        'group w-full flex items-center rounded-lg transition-all duration-150',
        collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5',
        isActive
          ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
          : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
      )}
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      <span className={classNames('inline-flex items-center', collapsed ? 'justify-center' : 'gap-2')}>
        <span className={classNames(icon, 'h-4 w-4')} />
        {!collapsed && <span>{label}</span>}
      </span>
      {!collapsed && hasUpdate && (
        <div
          className="w-2 h-2 rounded-full bg-bolt-elements-item-contentAccent animate-pulse"
          aria-label="Has updates"
        />
      )}
    </button>
  );

  if (!collapsed) {
    return content;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="z-[220] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary shadow"
        >
          {label}
          <Tooltip.Arrow className="fill-bolt-elements-background-depth-1" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

interface SettingsNavigationSectionProps {
  title: string;
  children: ReactNode;
}

const SettingsNavigationSection = ({ title, children }: SettingsNavigationSectionProps) => {
  return (
    <div className="space-y-1">
      {title ? (
        <h3 className="px-3 text-xs font-semibold text-bolt-elements-textTertiary uppercase tracking-wider">{title}</h3>
      ) : null}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
};

interface SettingsNavigationProps {
  activeTab: TabType | null;
  sectionedTabs: Record<string, Array<{ id: string; label?: string; visible: boolean; order: number }>>;
  sectionOrder: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  getTabUpdateStatus: (tabId: TabType) => boolean;
  onTabClick: (tabId: TabType) => void;
}

const SECTION_ICONS: Record<string, string> = {
  General: 'i-ph:sliders-horizontal',
  Preferences: 'i-ph:sliders',
  AI: 'i-ph:brain',
  Integrations: 'i-ph:plugs-connected',
  Security: 'i-ph:shield-check',
  System: 'i-ph:gear-six',
};

export const SettingsNavigation = ({
  activeTab,
  sectionedTabs,
  sectionOrder,
  collapsed,
  onToggleCollapse,
  getTabUpdateStatus,
  onTabClick,
}: SettingsNavigationProps) => {
  return (
    <Tooltip.Provider delayDuration={180}>
      <nav
        className={classNames(
          'flex-shrink-0 bg-bolt-elements-background-depth-2 border-r border-bolt-elements-borderColor overflow-y-auto modern-scrollbar transition-[width] duration-200',
          collapsed ? 'w-20' : 'w-72',
        )}
      >
        <div className="p-3 space-y-5">
          <div className={classNames('flex items-center', collapsed ? 'justify-center' : 'justify-between px-1')}>
            {!collapsed && <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Settings</h2>}
            <button
              onClick={onToggleCollapse}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-1"
              aria-label={collapsed ? 'Expand settings navigation' : 'Collapse settings navigation'}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <span className={classNames('h-4 w-4', collapsed ? 'i-ph:caret-right' : 'i-ph:caret-left')} />
            </button>
          </div>

          {!collapsed && <div className="h-px bg-bolt-elements-borderColor" />}

          <div className="space-y-5">
            {sectionOrder.map((section) => {
              const tabs = sectionedTabs[section];

              if (!tabs || tabs.length === 0) {
                return null;
              }

              return (
                <SettingsNavigationSection key={section} title={collapsed ? '' : section}>
                  {tabs.map((tab: { id: string; label?: string }) => (
                    <SettingsNavigationItem
                      key={tab.id}
                      label={tab.label || tab.id}
                      icon={SECTION_ICONS[section] || 'i-ph:dot-outline'}
                      collapsed={collapsed}
                      isActive={activeTab === tab.id}
                      hasUpdate={getTabUpdateStatus(tab.id as TabType)}
                      onClick={() => onTabClick(tab.id as TabType)}
                    />
                  ))}
                </SettingsNavigationSection>
              );
            })}
          </div>
        </div>
      </nav>
    </Tooltip.Provider>
  );
};
