import { type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

interface SettingsContentPanelProps {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export const SettingsContentPanel = ({ title, description, children, actions }: SettingsContentPanelProps) => {
  return (
    <div className="flex-1 flex flex-col bg-bolt-elements-background-depth-1 overflow-hidden">
      {/* Content Header */}
      <div className="flex-shrink-0 px-4 py-4 md:px-8 md:py-6 border-b border-bolt-elements-borderColor">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
            {description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-3xl">{description}</p>}
          </div>
          {actions && <div className="flex-shrink-0 ml-4">{actions}</div>}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div
        className={classNames(
          'flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6',
          'scrollbar scrollbar-w-2',
          'scrollbar-track-transparent',
          'scrollbar-thumb-[#E5E5E5] hover:scrollbar-thumb-[#CCCCCC]',
          'dark:scrollbar-thumb-[#333333] dark:hover:scrollbar-thumb-[#444444]',
        )}
      >
        {children}
      </div>
    </div>
  );
};

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export const SettingsGroup = ({ title, description, children }: SettingsGroupProps) => {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
};

interface SettingsCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export const SettingsCard = ({ title, description, children, className }: SettingsCardProps) => {
  return (
    <div
      className={classNames(
        'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6',
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-base font-medium text-gray-900 dark:text-white">{title}</h3>}
          {description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
};
