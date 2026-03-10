import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { DeployButton } from '~/components/deploy/DeployButton';
import { uiButtonClassTokens } from '~/components/ui/tokens';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const showWorkbench = useStore(workbenchStore.showWorkbench);

  const shouldShowButtons = activePreview;

  return (
    <div className="flex items-center gap-1">
      {/* Workbench toggle — always visible when chat has started */}
      {chatStarted && (
        <button
          onClick={() => workbenchStore.showWorkbench.set(!showWorkbench)}
          title={showWorkbench ? 'Hide Workbench' : 'Show Workbench'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 transition-colors"
        >
          <div className="i-ph:layout-duotone text-base" />
          <span>Workbench</span>
        </button>
      )}
      {/* Deploy Button */}
      {shouldShowButtons && <DeployButton />}

      {/* Debug Tools */}
      {shouldShowButtons && (
        <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden text-sm">
          <button
            onClick={() =>
              window.open('https://github.com/stackblitz-labs/bolt.diy/issues/new?template=bug_report.yml', '_blank')
            }
            className={`rounded-l-md ${uiButtonClassTokens.primaryActionCompact} gap-1.5`}
            title="Report Bug"
          >
            <div className="i-ph:bug" />
            <span>Report Bug</span>
          </button>
          <div className="w-px bg-bolt-elements-borderColor" />
          <button
            onClick={async () => {
              try {
                const { downloadDebugLog } = await import('~/utils/debugLogger');
                await downloadDebugLog();
              } catch (error) {
                console.error('Failed to download debug log:', error);
              }
            }}
            className={`rounded-r-md ${uiButtonClassTokens.primaryActionCompact} gap-1.5`}
            title="Download Debug Log"
          >
            <div className="i-ph:download" />
            <span>Debug Log</span>
          </button>
        </div>
      )}
    </div>
  );
}
