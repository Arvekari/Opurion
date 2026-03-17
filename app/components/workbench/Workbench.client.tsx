import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { Popover, Transition } from '@headlessui/react';
import { diffLines, type Change } from 'diff';
import { getLanguageFromExtension } from '~/utils/getLanguageFromExtension';
import type { FileHistory } from '~/types/actions';
import { DiffView } from './DiffView';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import useViewport from '~/lib/hooks';

import { usePreviewStore } from '~/lib/stores/previews';
import { chatStore } from '~/lib/stores/chat';
import type { ElementInfo } from './Inspector';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { useChatHistory } from '~/lib/persistence';
import { streamingState } from '~/lib/stores/streaming';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { uiButtonClassTokens } from '~/components/ui/tokens';
import { detectProjectCommands, extractWorkingDirectoryFromCommand, validateProjectPreflight } from '~/utils/projectCommands';
import { generateId } from '~/utils/fileUtils';
import { webcontainer } from '~/lib/webcontainer';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
  metadata?: {
    gitUrl?: string;
  };
  updateChatMestaData?: (metadata: any) => void;
  setSelectedElement?: (element: ElementInfo | null) => void;
}

const viewTransition = { ease: cubicEasingFn };

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code',
  },
  middle: {
    value: 'diff',
    text: 'Diff',
  },
  right: {
    value: 'preview',
    text: 'Preview',
  },
};

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

const COMMAND_RETRY_ATTEMPTS = 5;
const COMMAND_RETRY_DELAY_MS = 1200;

async function directoryExists(container: Awaited<typeof webcontainer>, targetPath: string): Promise<boolean> {
  try {
    await container.fs.readdir(targetPath, { withFileTypes: true });
    return true;
  } catch {
    return false;
  }
}

async function fileExists(container: Awaited<typeof webcontainer>, targetPath: string): Promise<boolean> {
  try {
    await container.fs.readFile(targetPath, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function toContainerProjectPath(workspaceRelativeDirectory: string): string {
  const normalized = workspaceRelativeDirectory.replace(/^\/+|\/+$/g, '');
  return normalized ? `/home/project/${normalized}` : '/home/project';
}

interface PackageJsonForSetupCheck {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

async function readPackageJson(
  container: Awaited<typeof webcontainer>,
  packageJsonPath: string,
): Promise<PackageJsonForSetupCheck | undefined> {
  try {
    const content = await container.fs.readFile(packageJsonPath, 'utf-8');

    if (typeof content !== 'string') {
      return undefined;
    }

    return JSON.parse(content) as PackageJsonForSetupCheck;
  } catch {
    return undefined;
  }
}

function getDeclaredPackageNames(packageJson: PackageJsonForSetupCheck): string[] {
  const keys = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];

  return Array.from(new Set(keys));
}

async function isPackageInstalled(
  container: Awaited<typeof webcontainer>,
  nodeModulesPath: string,
  packageName: string,
): Promise<boolean> {
  const packagePath = packageName.replace(/\//g, '/');
  const packageJsonPath = `${nodeModulesPath}/${packagePath}/package.json`;
  return fileExists(container, packageJsonPath);
}

function formatActionFailureContent(error: unknown): string {
  if (!error) {
    return 'Unknown command failure.';
  }

  if (error instanceof Error) {
    return error.message || 'Unknown command failure.';
  }

  return String(error);
}

function hasUnavailableCommandError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes('command not found') || normalized.includes('is not available in webcontainer');
}

function replaceFirstCommandToken(command: string, token: string, replacement: string): string | undefined {
  const matcher = new RegExp(`(^|&&\\s*|;\\s*)${token}(?=\\s)`, 'i');

  if (!matcher.test(command)) {
    return undefined;
  }

  return command.replace(matcher, `$1${replacement}`);
}

function buildCommandFallbackCandidates(command: string, error: unknown): string[] {
  const errorMessage = formatActionFailureContent(error);
  const normalizedError = errorMessage.toLowerCase();
  const hasMissingScriptError = /missing script/i.test(errorMessage);
  const missingScriptMatch = errorMessage.match(/missing script:?\s*['\"]?([\w:-]+)['\"]?/i);
  const missingScriptName = missingScriptMatch?.[1]?.toLowerCase();

  if (!hasUnavailableCommandError(errorMessage) && !hasMissingScriptError) {
    return [];
  }

  const candidates: string[] = [];
  const pushCandidate = (value: string | undefined) => {
    if (!value) {
      return;
    }

    const trimmed = value.trim();

    if (!trimmed || trimmed === command.trim()) {
      return;
    }

    if (!candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  if (/\bnpm\b/i.test(normalizedError)) {
    pushCandidate(replaceFirstCommandToken(command, 'npm', 'pnpm'));
    pushCandidate(replaceFirstCommandToken(command, 'npm', 'yarn'));
  }

  if (/\bpnpm\b/i.test(normalizedError)) {
    pushCandidate(replaceFirstCommandToken(command, 'pnpm', 'npm'));
    pushCandidate(replaceFirstCommandToken(command, 'pnpm', 'yarn'));
  }

  if (/\byarn\b/i.test(normalizedError)) {
    pushCandidate(replaceFirstCommandToken(command, 'yarn', 'pnpm'));
    pushCandidate(replaceFirstCommandToken(command, 'yarn', 'npm'));
  }

  if (/\bnpx\b/i.test(normalizedError)) {
    pushCandidate(command.replace(/(^|&&\s*|;\s*)npx(?:\s+--yes)?(?=\s)/i, '$1pnpm dlx'));
    pushCandidate(command.replace(/(^|&&\s*|;\s*)npx(?:\s+--yes)?(?=\s)/i, '$1npm exec --yes'));
  }

  if (hasMissingScriptError) {
    const scriptFallbackOrder = ['dev', 'start', 'preview'];
    const remainingScripts = scriptFallbackOrder.filter((candidate) => candidate !== missingScriptName);

    const npmRunMatch = command.match(/(^|&&\s*|;\s*)(npm|pnpm)\s+run\s+[\w:-]+/i);

    if (npmRunMatch) {
      const commandPrefix = npmRunMatch[1] ?? '';
      const packageManager = (npmRunMatch[2] || 'npm').toLowerCase();

      for (const fallbackScript of remainingScripts) {
        pushCandidate(command.replace(/(^|&&\s*|;\s*)(npm|pnpm)\s+run\s+[\w:-]+/i, `${commandPrefix}${packageManager} run ${fallbackScript}`));
      }
    }

    const yarnMatch = command.match(/(^|&&\s*|;\s*)yarn\s+[\w:-]+/i);

    if (yarnMatch) {
      const commandPrefix = yarnMatch[1] ?? '';

      for (const fallbackScript of remainingScripts) {
        pushCandidate(command.replace(/(^|&&\s*|;\s*)yarn\s+[\w:-]+/i, `${commandPrefix}yarn ${fallbackScript}`));
      }
    }
  }

  if (/\buvicorn\b/i.test(normalizedError)) {
    const uvicornFallback = command.replace(/(^|&&\s*|;\s*)uvicorn(?=\s)/i, '$1python -m uvicorn');
    pushCandidate(uvicornFallback);
    pushCandidate(uvicornFallback.replace(/(^|&&\s*|;\s*)python\b/i, '$1python3'));
  }

  if (/\bpython\b/i.test(normalizedError)) {
    pushCandidate(replaceFirstCommandToken(command, 'python', 'python3'));
  }

  if (/\bpython3\b/i.test(normalizedError)) {
    pushCandidate(replaceFirstCommandToken(command, 'python3', 'python'));
  }

  return candidates;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface DependencySetupCheckResult {
  shouldRunSetup: boolean;
  missingPackages: string[];
}

async function shouldRunDependencySetup(
  commands: Awaited<ReturnType<typeof detectProjectCommands>>,
): Promise<DependencySetupCheckResult> {
  if (commands.type !== 'Node.js' || !commands.setupCommand) {
    return { shouldRunSetup: false, missingPackages: [] };
  }

  const container = await webcontainer;
  const commandWorkingDirectory = extractWorkingDirectoryFromCommand(commands.setupCommand || commands.startCommand);
  const projectPath = toContainerProjectPath(commandWorkingDirectory);
  const packageJsonPath = `${projectPath}/package.json`;
  const nodeModulesPath = `${projectPath}/node_modules`;
  const hasPackageJson = await fileExists(container, packageJsonPath);

  if (!hasPackageJson) {
    return { shouldRunSetup: false, missingPackages: [] };
  }

  const hasNodeModules = await directoryExists(container, nodeModulesPath);

  if (!hasNodeModules) {
    return { shouldRunSetup: true, missingPackages: [] };
  }

  const packageJson = await readPackageJson(container, packageJsonPath);

  if (!packageJson) {
    return { shouldRunSetup: true, missingPackages: [] };
  }

  const declaredPackages = getDeclaredPackageNames(packageJson);
  const missingPackages: string[] = [];

  for (const packageName of declaredPackages) {
    const installed = await isPackageInstalled(container, nodeModulesPath, packageName);

    if (!installed) {
      missingPackages.push(packageName);
    }
  }

  return {
    shouldRunSetup: missingPackages.length > 0,
    missingPackages,
  };
}

const FileModifiedDropdown = memo(
  ({
    fileHistory,
    onSelectFile,
  }: {
    fileHistory: Record<string, FileHistory>;
    onSelectFile: (filePath: string) => void;
  }) => {
    const modifiedFiles = Object.entries(fileHistory);
    const hasChanges = modifiedFiles.length > 0;
    const [searchQuery, setSearchQuery] = useState('');

    const filteredFiles = useMemo(() => {
      return modifiedFiles.filter(([filePath]) => filePath.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [modifiedFiles, searchQuery]);

    return (
      <div className="flex items-center gap-2">
        <Popover className="relative">
          {({ open }: { open: boolean }) => (
            <>
              <Popover.Button className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-item-contentDefault">
                <span>File Changes</span>
                {hasChanges && (
                  <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-500 text-xs flex items-center justify-center border border-accent-500/30">
                    {modifiedFiles.length}
                  </span>
                )}
              </Popover.Button>
              <Transition
                show={open}
                enter="transition duration-100 ease-out"
                enterFrom="transform scale-95 opacity-0"
                enterTo="transform scale-100 opacity-100"
                leave="transition duration-75 ease-out"
                leaveFrom="transform scale-100 opacity-100"
                leaveTo="transform scale-95 opacity-0"
              >
                <Popover.Panel className="absolute right-0 z-20 mt-2 w-80 origin-top-right rounded-xl bg-bolt-elements-background-depth-2 shadow-xl border border-bolt-elements-borderColor">
                  <div className="p-2">
                    <div className="relative mx-2 mb-2">
                      <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary">
                        <div className="i-ph:magnifying-glass" />
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      {filteredFiles.length > 0 ? (
                        filteredFiles.map(([filePath, history]) => {
                          const extension = filePath.split('.').pop() || '';
                          const language = getLanguageFromExtension(extension);

                          return (
                            <button
                              key={filePath}
                              onClick={() => onSelectFile(filePath)}
                              className="w-full px-3 py-2 text-left rounded-md hover:bg-bolt-elements-background-depth-1 transition-colors group bg-transparent"
                            >
                              <div className="flex items-center gap-2">
                                <div className="shrink-0 w-5 h-5 text-bolt-elements-textTertiary">
                                  {['typescript', 'javascript', 'jsx', 'tsx'].includes(language) && (
                                    <div className="i-ph:file-js" />
                                  )}
                                  {['css', 'scss', 'less'].includes(language) && <div className="i-ph:paint-brush" />}
                                  {language === 'html' && <div className="i-ph:code" />}
                                  {language === 'json' && <div className="i-ph:brackets-curly" />}
                                  {language === 'python' && <div className="i-ph:file-text" />}
                                  {language === 'markdown' && <div className="i-ph:article" />}
                                  {['yaml', 'yml'].includes(language) && <div className="i-ph:file-text" />}
                                  {language === 'sql' && <div className="i-ph:database" />}
                                  {language === 'dockerfile' && <div className="i-ph:cube" />}
                                  {language === 'shell' && <div className="i-ph:terminal" />}
                                  {![
                                    'typescript',
                                    'javascript',
                                    'css',
                                    'html',
                                    'json',
                                    'python',
                                    'markdown',
                                    'yaml',
                                    'yml',
                                    'sql',
                                    'dockerfile',
                                    'shell',
                                    'jsx',
                                    'tsx',
                                    'scss',
                                    'less',
                                  ].includes(language) && <div className="i-ph:file-text" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-col min-w-0">
                                      <span className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                                        {filePath.split('/').pop()}
                                      </span>
                                      <span className="truncate text-xs text-bolt-elements-textTertiary">
                                        {filePath}
                                      </span>
                                    </div>
                                    {(() => {
                                      // Calculate diff stats
                                      const { additions, deletions } = (() => {
                                        if (!history.originalContent) {
                                          return { additions: 0, deletions: 0 };
                                        }

                                        const normalizedOriginal = history.originalContent.replace(/\r\n/g, '\n');
                                        const normalizedCurrent =
                                          history.versions[history.versions.length - 1]?.content.replace(
                                            /\r\n/g,
                                            '\n',
                                          ) || '';

                                        if (normalizedOriginal === normalizedCurrent) {
                                          return { additions: 0, deletions: 0 };
                                        }

                                        const changes = diffLines(normalizedOriginal, normalizedCurrent, {
                                          newlineIsToken: false,
                                          ignoreWhitespace: true,
                                          ignoreCase: false,
                                        });

                                        return changes.reduce(
                                          (acc: { additions: number; deletions: number }, change: Change) => {
                                            if (change.added) {
                                              acc.additions += change.value.split('\n').length;
                                            }

                                            if (change.removed) {
                                              acc.deletions += change.value.split('\n').length;
                                            }

                                            return acc;
                                          },
                                          { additions: 0, deletions: 0 },
                                        );
                                      })();

                                      const showStats = additions > 0 || deletions > 0;

                                      return (
                                        showStats && (
                                          <div className="flex items-center gap-1 text-xs shrink-0">
                                            {additions > 0 && <span className="text-green-500">+{additions}</span>}
                                            {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
                                          </div>
                                        )
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 text-center">
                          <div className="w-12 h-12 mb-2 text-bolt-elements-textTertiary">
                            <div className="i-ph:file-dashed" />
                          </div>
                          <p className="text-sm font-medium text-bolt-elements-textPrimary">
                            {searchQuery ? 'No matching files' : 'No modified files'}
                          </p>
                          <p className="text-xs text-bolt-elements-textTertiary mt-1">
                            {searchQuery ? 'Try another search' : 'Changes will appear here as you edit'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {hasChanges && (
                    <div className="border-t border-bolt-elements-borderColor p-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(filteredFiles.map(([filePath]) => filePath).join('\n'));
                          toast('File list copied to clipboard', {
                            icon: <div className="i-ph:check-circle text-accent-500" />,
                          });
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                      >
                        Copy File List
                      </button>
                    </div>
                  )}
                </Popover.Panel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    );
  },
);

export const Workbench = memo(
  ({
    chatStarted,
    isStreaming,
    metadata: _metadata,
    updateChatMestaData: _updateChatMestaData,
    setSelectedElement,
  }: WorkspaceProps) => {
    renderLogger.trace('Workbench');

    const [fileHistory, setFileHistory] = useState<Record<string, FileHistory>>({});

    // const modifiedFiles = Array.from(useStore(workbenchStore.unsavedFiles).keys());

    const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
    const showWorkbench = useStore(workbenchStore.showWorkbench);
    const selectedFile = useStore(workbenchStore.selectedFile);
    const currentDocument = useStore(workbenchStore.currentDocument);
    const unsavedFiles = useStore(workbenchStore.unsavedFiles);
    const files = useStore(workbenchStore.files);
    const selectedView = useStore(workbenchStore.currentView);
    const { showChat } = useStore(chatStore);
    const canHideChat = showWorkbench || !showChat;

    const isSmallViewport = useViewport(1024);
    const streaming = useStore(streamingState);
    const { exportChat } = useChatHistory();
    const [isSyncing, setIsSyncing] = useState(false);
    const autoPreviewLaunchStateRef = useRef<{
      inFlight: boolean;
      lastAttemptAt: number;
      lastSignature?: string;
      setupAttemptedSignatures: Set<string>;
      failedSignatures: Set<string>;
    }>({
      inFlight: false,
      lastAttemptAt: 0,
      setupAttemptedSignatures: new Set<string>(),
      failedSignatures: new Set<string>(),
    });

    const setSelectedView = (view: WorkbenchViewType) => {
      workbenchStore.currentView.set(view);
    };

    useEffect(() => {
      if (hasPreview) {
        setSelectedView('preview');
      }
    }, [hasPreview]);

    useEffect(() => {
      if (hasPreview) {
        autoPreviewLaunchStateRef.current.inFlight = false;
        return;
      }

      if (isStreaming || streaming) {
        autoPreviewLaunchStateRef.current.inFlight = false;
        return;
      }

      if (!showWorkbench) {
        return;
      }

      const now = Date.now();
      const state = autoPreviewLaunchStateRef.current;

      if (state.inFlight || now - state.lastAttemptAt < 5000) {
        return;
      }

      let cancelled = false;

      const candidateFiles = Object.entries(files).reduce<Array<{ path: string; content: string }>>(
        (accumulator, [filePath, file]) => {
          if (file?.type === 'file' && !file.isBinary && typeof file.content === 'string') {
            accumulator.push({ path: filePath, content: file.content });
          }

          return accumulator;
        },
        [],
      );

      if (candidateFiles.length === 0) {
        return;
      }

      const tryAutoStartPreview = async () => {
        const commands = await detectProjectCommands(candidateFiles);

        if (cancelled || isStreaming || streaming || !commands.startCommand) {
          return;
        }

        const fileSignature = JSON.stringify(
          candidateFiles.map((file) => [file.path, file.content.length, file.content.slice(0, 120)]),
        );
        const signature = `${commands.setupCommand ?? ''}::${commands.startCommand}::${fileSignature}`;

        if (state.lastSignature === signature && now - state.lastAttemptAt < 30000) {
          return;
        }

        if (state.failedSignatures.has(signature)) {
          return;
        }

        const artifact = workbenchStore.firstArtifact;

        if (!artifact) {
          return;
        }

        state.inFlight = true;
        state.lastAttemptAt = now;
        state.lastSignature = signature;

        const setupCommand = commands.setupCommand;
        const preflight = await validateProjectPreflight(candidateFiles, commands);

        if (!preflight.ok) {
          if (cancelled || isStreaming || streaming) {
            state.inFlight = false;
            return;
          }

          const failureContent = preflight.issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n');
          workbenchStore.actionAlert.set({
            type: 'preview',
            title: 'Project preflight failed',
            description: 'Required package.json/dependency/entry checks failed before preview start.',
            content: failureContent,
            source: 'preview',
          });
          toast.warn('Project preflight failed before preview start; triggering automatic repair...');
          state.failedSignatures.add(signature);
          state.inFlight = false;
          return;
        }

        const dependencyCheck = await shouldRunDependencySetup(commands);
        const dependenciesNeedSetup = dependencyCheck.shouldRunSetup;
        const shouldRunSetup =
          setupCommand && (dependenciesNeedSetup || !state.setupAttemptedSignatures.has(signature));

        if (dependenciesNeedSetup && dependencyCheck.missingPackages.length > 0) {
          const packagePreview = dependencyCheck.missingPackages.slice(0, 8).join(', ');
          const suffix = dependencyCheck.missingPackages.length > 8 ? ` +${dependencyCheck.missingPackages.length - 8} more` : '';
          toast.info(`Installing missing dependencies before preview: ${packagePreview}${suffix}`);
        }

        if (shouldRunSetup) {
          let setupCommandToRun = setupCommand;
          const setupAttemptedCommands = new Set<string>([setupCommandToRun]);
          let setupError: unknown;

          for (let attempt = 1; attempt <= COMMAND_RETRY_ATTEMPTS; attempt++) {
            const setupActionData = {
              artifactId: artifact.id,
              messageId: 'auto-preview-launch',
              actionId: `auto-preview-setup-${generateId()}`,
              action: {
                type: 'shell' as const,
                content: setupCommandToRun,
              },
            };

            workbenchStore.addAction(setupActionData);

            try {
              await workbenchStore.runAction(setupActionData);
              setupError = undefined;
              break;
            } catch (error) {
              setupError = error;

              const fallbackCommands = buildCommandFallbackCandidates(setupCommandToRun, error).filter(
                (candidate) => !setupAttemptedCommands.has(candidate),
              );

              if (fallbackCommands.length > 0) {
                setupCommandToRun = fallbackCommands[0];
                setupAttemptedCommands.add(setupCommandToRun);
                toast.info(`Retrying dependency setup with fallback command: ${setupCommandToRun}`);
                continue;
              }

              if (attempt < COMMAND_RETRY_ATTEMPTS) {
                toast.warn(`Dependency setup failed (attempt ${attempt}/${COMMAND_RETRY_ATTEMPTS}); retrying...`);
                await delay(COMMAND_RETRY_DELAY_MS);
              }
            }
          }

          if (setupError) {
            if (cancelled || isStreaming || streaming) {
              state.inFlight = false;
              return;
            }

            workbenchStore.actionAlert.set({
              type: 'preview',
              title: 'Dependency setup command failed',
              description: 'The install command failed before preview start; triggering automatic repair.',
              content: formatActionFailureContent(setupError),
              source: 'preview',
            });
            toast.warn('Dependency setup failed; triggering automatic repair...');
            state.failedSignatures.add(signature);
            state.inFlight = false;
            return;
          }

          state.setupAttemptedSignatures.add(signature);

          if (dependenciesNeedSetup && dependencyCheck.missingPackages.length === 0) {
            toast.info(`Validated dependencies before starting preview: ${setupCommandToRun}`);
          }
        }

        const postSetupDependencyCheck = await shouldRunDependencySetup(commands);

        if (postSetupDependencyCheck.shouldRunSetup) {
          if (cancelled || isStreaming || streaming) {
            state.inFlight = false;
            return;
          }

          const unresolved = postSetupDependencyCheck.missingPackages;
          const failureContent = unresolved.length
            ? unresolved.slice(0, 20).map((name, index) => `${index + 1}. Missing installed package: ${name}`).join('\n')
            : 'Dependency installation did not complete successfully. node_modules is still missing or unreadable.';

          workbenchStore.actionAlert.set({
            type: 'preview',
            title: 'Dependency installation required',
            description: 'Required packages from package.json are still not installed; retrying automatic repair.',
            content: failureContent,
            source: 'preview',
          });

          toast.warn('Dependencies are still missing after setup; triggering automatic repair...');
          state.failedSignatures.add(signature);
          state.inFlight = false;
          return;
        }

        let startError: unknown;
        let startCommandToRun = commands.startCommand;
        const startAttemptedCommands = new Set<string>([startCommandToRun]);

        for (let attempt = 1; attempt <= COMMAND_RETRY_ATTEMPTS; attempt++) {
          const startActionData = {
            artifactId: artifact.id,
            messageId: 'auto-preview-launch',
            actionId: `auto-preview-start-${generateId()}`,
            action: {
              type: 'start' as const,
              content: startCommandToRun,
            },
          };

          workbenchStore.addAction(startActionData);

          try {
            await workbenchStore.runAction(startActionData);
            startError = undefined;
            break;
          } catch (error) {
            startError = error;

            const fallbackCommands = buildCommandFallbackCandidates(startCommandToRun, error).filter(
              (candidate) => !startAttemptedCommands.has(candidate),
            );

            if (fallbackCommands.length > 0) {
              startCommandToRun = fallbackCommands[0];
              startAttemptedCommands.add(startCommandToRun);
              toast.info(`Retrying start command with fallback command: ${startCommandToRun}`);
              continue;
            }

            if (attempt < COMMAND_RETRY_ATTEMPTS) {
              toast.info(`Retrying start command (attempt ${attempt + 1}/${COMMAND_RETRY_ATTEMPTS})...`);
              await delay(COMMAND_RETRY_DELAY_MS);
            }
          }
        }

        if (startError) {
          if (cancelled || isStreaming || streaming) {
            state.inFlight = false;
            return;
          }

          workbenchStore.actionAlert.set({
            type: 'preview',
            title: 'Start command failed',
            description: 'The preview start command failed; triggering automatic repair.',
            content: formatActionFailureContent(startError),
            source: 'preview',
          });
          toast.warn('Start command failed; triggering automatic repair...');
          state.failedSignatures.add(signature);
          state.inFlight = false;
          return;
        }

        state.failedSignatures.delete(signature);

        toast.info(`Auto-starting preview: ${startCommandToRun}`);

        setTimeout(() => {
          autoPreviewLaunchStateRef.current.inFlight = false;
        }, 2500);
      };

      tryAutoStartPreview().catch((error) => {
        console.error('Failed to auto-start preview:', error);
        autoPreviewLaunchStateRef.current.inFlight = false;
      });

      return () => {
        cancelled = true;
      };
    }, [showWorkbench, selectedView, hasPreview, files, isStreaming, streaming]);

    useEffect(() => {
      workbenchStore.setDocuments(files);
    }, [files]);

    const onEditorChange = useCallback<OnEditorChange>((update) => {
      workbenchStore.setCurrentDocumentContent(update.content);
    }, []);

    const onEditorScroll = useCallback<OnEditorScroll>((position) => {
      workbenchStore.setCurrentDocumentScrollPosition(position);
    }, []);

    const onFileSelect = useCallback((filePath: string | undefined) => {
      workbenchStore.setSelectedFile(filePath);
    }, []);

    const onFileSave = useCallback(() => {
      workbenchStore
        .saveCurrentDocument()
        .then(() => {
          // Explicitly refresh all previews after a file save
          const previewStore = usePreviewStore();
          previewStore.refreshAllPreviews();
        })
        .catch(() => {
          toast.error('Failed to update file content');
        });
    }, []);

    const onFileReset = useCallback(() => {
      workbenchStore.resetCurrentDocument();
    }, []);

    const handleSelectFile = useCallback((filePath: string) => {
      workbenchStore.setSelectedFile(filePath);
      workbenchStore.currentView.set('diff');
    }, []);

    const handleSyncFiles = useCallback(async () => {
      setIsSyncing(true);

      try {
        const directoryHandle = await window.showDirectoryPicker();
        await workbenchStore.syncFiles(directoryHandle);
        toast.success('Files synced successfully');
      } catch (error) {
        console.error('Error syncing files:', error);
        toast.error('Failed to sync files');
      } finally {
        setIsSyncing(false);
      }
    }, []);

    return (
      (chatStarted || showWorkbench) && (
        <motion.div
          initial="closed"
          animate={showWorkbench ? 'open' : 'closed'}
          variants={workbenchVariants}
          className="z-workbench"
        >
          <div
            className={classNames(
              'fixed top-[calc(var(--header-height)+1.2rem)] bottom-6 w-[var(--workbench-inner-width)] z-0 transition-[left,width] duration-200 bolt-ease-cubic-bezier',
              {
                'w-full': isSmallViewport,
                'left-0': showWorkbench && isSmallViewport,
                'left-[var(--workbench-left)]': showWorkbench,
                'left-[100%]': !showWorkbench,
              },
            )}
          >
            <div className="absolute inset-0 px-2 lg:px-4">
              <div className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-sm rounded-lg overflow-hidden">
                <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor gap-1.5">
                  <button
                    className={`${showChat ? 'i-ph:sidebar-simple-fill' : 'i-ph:sidebar-simple'} text-lg text-bolt-elements-textSecondary mr-1`}
                    disabled={!canHideChat || isSmallViewport}
                    onClick={() => {
                      if (canHideChat) {
                        chatStore.setKey('showChat', !showChat);
                      }
                    }}
                  />
                  <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
                  <div className="ml-auto" />
                  {selectedView === 'code' && (
                    <div className="flex overflow-y-auto">
                      {/* Export Chat Button */}
                      <ExportChatButton exportChat={exportChat} />

                      {/* Sync Button */}
                      <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden ml-1">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger
                            disabled={isSyncing || streaming}
                            className={`rounded-md ${uiButtonClassTokens.primaryActionCompact} gap-1.7`}
                          >
                            {isSyncing ? 'Syncing...' : 'Sync'}
                            <span className={classNames('i-ph:caret-down transition-transform')} />
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Content
                            className={classNames(
                              'min-w-[240px] z-[250]',
                              'bg-bolt-elements-background-depth-1',
                              'rounded-lg shadow-lg',
                              'border border-bolt-elements-borderColor',
                              'animate-in fade-in-0 zoom-in-95',
                              'py-1',
                            )}
                            sideOffset={5}
                            align="end"
                          >
                            <DropdownMenu.Item
                              className={classNames(
                                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                              )}
                              onClick={handleSyncFiles}
                              disabled={isSyncing}
                            >
                              <div className="flex items-center gap-2">
                                {isSyncing ? (
                                  <div className="i-ph:spinner" />
                                ) : (
                                  <div className="i-ph:cloud-arrow-down" />
                                )}
                                <span>{isSyncing ? 'Syncing...' : 'Sync Files'}</span>
                              </div>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Root>
                      </div>

                      {/* Toggle Terminal Button */}
                      <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden ml-1">
                        <button
                          onClick={() => {
                            workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                          }}
                          className={`rounded-md ${uiButtonClassTokens.primaryActionCompact} gap-1.7`}
                        >
                          <div className="i-ph:terminal" />
                          Toggle Terminal
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedView === 'diff' && (
                    <FileModifiedDropdown fileHistory={fileHistory} onSelectFile={handleSelectFile} />
                  )}
                  <IconButton
                    icon="i-ph:x-circle"
                    className="-mr-1"
                    size="xl"
                    onClick={() => {
                      workbenchStore.showWorkbench.set(false);
                    }}
                  />
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <View initial={{ x: '0%' }} animate={{ x: selectedView === 'code' ? '0%' : '-100%' }}>
                    <EditorPanel
                      editorDocument={currentDocument}
                      isStreaming={isStreaming}
                      selectedFile={selectedFile}
                      files={files}
                      unsavedFiles={unsavedFiles}
                      fileHistory={fileHistory}
                      onFileSelect={onFileSelect}
                      onEditorScroll={onEditorScroll}
                      onEditorChange={onEditorChange}
                      onFileSave={onFileSave}
                      onFileReset={onFileReset}
                    />
                  </View>
                  <View
                    initial={{ x: '100%' }}
                    animate={{ x: selectedView === 'diff' ? '0%' : selectedView === 'code' ? '100%' : '-100%' }}
                  >
                    <DiffView fileHistory={fileHistory} setFileHistory={setFileHistory} />
                  </View>
                  <View initial={{ x: '100%' }} animate={{ x: selectedView === 'preview' ? '0%' : '100%' }}>
                    <Preview setSelectedElement={setSelectedElement} />
                  </View>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )
    );
  },
);

// View component for rendering content with motion transitions
interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});
