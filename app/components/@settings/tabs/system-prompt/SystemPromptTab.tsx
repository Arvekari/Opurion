import React, { useCallback } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { PromptLibrary } from '~/lib/common/prompt-library';

export default function SystemPromptTab() {
  const {
    promptId,
    setPromptId,
    customPromptEnabled,
    setCustomPromptEnabled,
    customPromptText,
    setCustomPromptText,
    customPromptMode,
    setCustomPromptMode,
  } = useSettings();

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

  return (
    <div className="space-y-6">
      {/* Prompt Library */}
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Prompt Library</h3>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Choose a base system prompt from the built-in prompt library.
            </p>
          </div>
          <select
            value={promptId}
            onChange={(e) => {
              setPromptId(e.target.value);
              toast.success('Prompt template updated');
            }}
            className={classNames(
              'rounded-lg border border-bolt-elements-borderColor px-3 py-2 text-sm min-w-[200px]',
              'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
            )}
          >
            {PromptLibrary.getList().map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom System Prompt */}
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Custom System Prompt</h3>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Append your own instructions to the selected base prompt, or replace it entirely.
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCustomPromptMode('append');
              toast.success('Prompt mode set to append');
            }}
            className={classNames(
              'rounded-lg px-3 py-1.5 text-xs',
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
              'rounded-lg px-3 py-1.5 text-xs',
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
              const base = getCurrentBasePrompt();
              setCustomPromptEnabled(true);
              setCustomPromptMode('replace');
              setCustomPromptText(base);
              toast.success('Loaded current system prompt into editor');
            }}
            className="rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs text-blue-500 hover:bg-blue-500/20"
          >
            Load Current System Prompt
          </button>
        </div>

        <div className="mt-4">
          <textarea
            value={customPromptText}
            onChange={(e) => setCustomPromptText(e.target.value)}
            placeholder="Example: Always answer in Finnish, prioritize minimal dependencies, and explain trade-offs briefly."
            rows={10}
            className={classNames(
              'w-full rounded-lg border border-bolt-elements-borderColor p-3 text-sm',
              'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'resize-y',
            )}
          />
          <p className="mt-2 text-xs text-bolt-elements-textSecondary">
            {customPromptMode === 'replace'
              ? 'Replace mode: this text becomes the full system prompt.'
              : 'Append mode: this text is appended after the selected base prompt.'}
          </p>
        </div>
      </div>
    </div>
  );
}
