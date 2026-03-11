import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { classNames } from '~/utils/classNames';
import type { TabType } from '~/components/@settings/core/types';
import * as Tooltip from '@radix-ui/react-tooltip';

interface SettingsNavigationItemProps {
  label: string;
  isActive: boolean;
  collapsed: boolean;
  nested?: boolean;
  onClick: () => void;
}

const SettingsNavigationItem = ({
  label,
  isActive,
  collapsed,
  nested,
  onClick,
}: SettingsNavigationItemProps) => {
  const content = (
    <button
      onClick={onClick}
      className={classNames(
        'group w-full flex items-center rounded-lg border border-transparent bg-transparent transition-all duration-150',
        collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5',
        !collapsed && nested ? 'ml-4 border-l border-bolt-elements-borderColor pl-4' : '',
        isActive
          ? 'text-bolt-elements-item-contentAccent'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
      )}
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      <span className={classNames('inline-flex items-center', collapsed ? 'justify-center' : 'gap-2')}>
        {!collapsed && <span>{label}</span>}
        {collapsed && <span className="text-xs">{label.slice(0, 1).toUpperCase()}</span>}
      </span>
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
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const SettingsNavigationSection = ({
  title,
  collapsed,
  expanded,
  onToggle,
  children,
}: SettingsNavigationSectionProps) => {
  const trigger = (
    <button
      onClick={onToggle}
      className={classNames(
        'w-full rounded-lg border border-transparent bg-transparent transition-colors duration-150 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
        collapsed ? 'inline-flex h-9 w-9 items-center justify-center' : 'flex items-center justify-between px-3 py-2.5',
      )}
      aria-label={collapsed ? title : `Toggle ${title}`}
      title={collapsed ? title : undefined}
    >
      {collapsed ? (
        <span className={classNames('h-4 w-4', expanded ? 'i-ph:caret-down' : 'i-ph:caret-right')} aria-hidden />
      ) : (
        <span className="inline-flex items-center gap-2">
          <span className={classNames('h-4 w-4', expanded ? 'i-ph:caret-down' : 'i-ph:caret-right')} aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-1">
      {collapsed ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="right"
              sideOffset={8}
              className="z-[220] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary shadow"
            >
              {title}
              <Tooltip.Arrow className="fill-bolt-elements-background-depth-1" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        trigger
      )}

      {expanded && <div className="space-y-0.5">{children}</div>}
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

export const SettingsNavigation = ({
  activeTab,
  sectionedTabs,
  sectionOrder,
  collapsed: _collapsed,
  getTabUpdateStatus,
  onTabClick,
}: SettingsNavigationProps) => {
  const collapsed = _collapsed && false;

  const defaultExpandedState = useMemo(() => {
    const next: Record<string, boolean> = {};

    sectionOrder.forEach((section) => {
      const tabs = sectionedTabs[section];
      next[section] = false;
    });

    return next;
  }, [sectionOrder, sectionedTabs]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(defaultExpandedState);

  useEffect(() => {
    setExpandedSections(defaultExpandedState);
  }, [defaultExpandedState]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const allExpanded = useMemo(() => {
    const branchSections = sectionOrder.filter((section) => (sectionedTabs[section] || []).length > 0);

    return branchSections.length > 0 && branchSections.every((section) => Boolean(expandedSections[section]));
  }, [expandedSections, sectionOrder, sectionedTabs]);

  const toggleAllSections = () => {
    const nextValue = !allExpanded;

    setExpandedSections((prev) => {
      const next = { ...prev };

      sectionOrder.forEach((section) => {
        if ((sectionedTabs[section] || []).length > 0) {
          next[section] = nextValue;
        }
      });

      return next;
    });
  };

  return (
    <Tooltip.Provider delayDuration={180}>
      <nav
        className={classNames(
          'flex-shrink-0 bg-transparent border-r border-bolt-elements-borderColor overflow-y-auto modern-scrollbar transition-[width] duration-200',
          collapsed ? 'w-20' : 'w-72',
        )}
      >
        <div className="p-3 space-y-5">
          <div className={classNames('flex items-center', collapsed ? 'justify-center' : 'justify-between px-1')}>
            {!collapsed && <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Settings</h2>}
            <div className="inline-flex items-center gap-1">
              {!collapsed && (
                <button
                  onClick={toggleAllSections}
                  className="px-2 py-1 text-xs rounded text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  aria-label={allExpanded ? 'Collapse all branches' : 'Expand all branches'}
                >
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              )}
            </div>
          </div>

          {!collapsed && <div className="h-px bg-bolt-elements-borderColor" />}

          <div className="space-y-5">
            {sectionOrder.map((section) => {
              const tabs = sectionedTabs[section];

              if (!tabs || tabs.length === 0) {
                return null;
              }

              return (
                <SettingsNavigationSection
                  key={section}
                  title={section}
                  collapsed={collapsed}
                  expanded={collapsed ? true : Boolean(expandedSections[section])}
                  onToggle={() => toggleSection(section)}
                >
                  {tabs.map((tab: { id: string; label?: string }) => (
                    <SettingsNavigationItem
                      key={tab.id}
                      label={tab.label || tab.id}
                      collapsed={collapsed}
                      nested={!collapsed}
                      isActive={activeTab === tab.id}
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
