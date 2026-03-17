import type { WebContainer } from '@webcontainer/api';
import { path as nodePath } from '~/utils/path';
import { atom, map, type MapStore } from 'nanostores';
import { logStore } from '~/lib/stores/logs';
import type { ActionAlert, BoltAction, DeployAlert, FileHistory, SupabaseAction, SupabaseAlert } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { newBoltShellProcess, type BoltShell } from '~/utils/shell';
import type { ITerminal } from '~/types/terminal';

const logger = createScopedLogger('ActionRunner');
const START_ACTION_SETTLE_WINDOW_MS = 2000;

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;

  constructor(message: string, output: string) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = `Failed To Execute Shell Command: ${message}\n\nOutput:\n${output}`;
    super(formattedMessage);

    // Set the output separately so it can be accessed programmatically
    this._header = message;
    this._output = output;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ActionCommandError.prototype);

    // Set the name of the error for better debugging
    this.name = 'ActionCommandError';
  }

  // Optional: Add a method to get just the terminal output
  get output() {
    return this._output;
  }
  get header() {
    return this._header;
  }
}

type ShellCommandExecutionContext = {
  command: string;
  cwd: string;
};

export function commandRequiresNodePackageManifest(command: string): boolean {
  const normalized = command.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return /^(npm|pnpm|yarn)\s+(install|i|run|exec|add|remove|update|upgrade|ci|test|start|dev|build|preview)\b/.test(
    normalized,
  );
}

export function getShellCommandExecutionContexts(command: string, baseDir: string): ShellCommandExecutionContext[] {
  const segments = command
    .split(/&&|;|\r?\n/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const contexts: ShellCommandExecutionContext[] = [];
  let currentDir = baseDir;

  for (const segment of segments) {
    const cdMatch = segment.match(/^cd\s+(.+)$/i);

    if (cdMatch) {
      const rawTarget = cdMatch[1].trim().replace(/^['"]|['"]$/g, '');
      currentDir = nodePath.isAbsolute(rawTarget) ? nodePath.normalize(rawTarget) : nodePath.resolve(currentDir, rawTarget);
      continue;
    }

    contexts.push({ command: segment, cwd: currentDir });
  }

  return contexts;
}

function rewriteLegacyWorkspaceCd(command: string): string {
  return command.replace(/(^|[\n;&]\s*)cd\s+(["']?)\/workspace(?:\2|(?=[\s;&\n]|$))/gi, '$1cd $2/home/project$2');
}

function ensureNpxNonInteractive(command: string): string {
  return command.replace(/(^|[\n;&]\s*)npx(?!\s+--yes\b)/g, '$1npx --yes');
}

function rewriteNpmToPnpmForWebContainer(command: string): string {
  return command
    .replace(/(^|[\n;&]\s*)npm\s+(?:install|i)\b[^\n;&]*/gi, '$1pnpm install --frozen-lockfile=false')
    .replace(/(^|[\n;&]\s*)npm\s+run\s+/gi, '$1pnpm run ')
    .replace(/(^|[\n;&]\s*)npm\s+exec\s+/gi, '$1pnpm exec ')
    .replace(/(^|[\n;&]\s*)npm\s+(start|dev|build|test|preview)\b/gi, '$1pnpm $2');
}

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #shellTerminal: () => BoltShell;
  runnerId = atom<string>(`${Date.now()}`);
  actions: ActionsMap = map({});
  onAlert?: (alert: ActionAlert) => void;
  onSupabaseAlert?: (alert: SupabaseAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
  buildOutput?: { path: string; exitCode: number; output: string };

  constructor(
    webcontainerPromise: Promise<WebContainer>,
    getShellTerminal: () => BoltShell,
    onAlert?: (alert: ActionAlert) => void,
    onSupabaseAlert?: (alert: SupabaseAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,
  ) {
    this.#webcontainer = webcontainerPromise;
    this.#shellTerminal = getShellTerminal;
    this.onAlert = onAlert;
    this.onSupabaseAlert = onSupabaseAlert;
    this.onDeployAlert = onDeployAlert;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    logStore.logUserAction('Action queued', {
      component: 'ActionRunner',
      actionId,
      artifactId: data.artifactId,
      actionType: data.action.type,
      filePath: data.action.type === 'file' ? data.action.filePath : undefined,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return; // No return value here
    }

    if (isStreaming && action.type !== 'file') {
      return; // No return value here
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: !isStreaming });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId, isStreaming);
      })
      .catch((error) => {
        logger.error('Action execution promise failed:', error);
        throw error;
      });

    await this.#currentExecutionPromise;

    return;
  }

  async #executeAction(actionId: string, isStreaming: boolean = false) {
    const action = this.actions.get()[actionId];
    const shouldLogActionStart = !isStreaming || action.status !== 'running';

    this.#updateAction(actionId, { status: 'running' });

    if (shouldLogActionStart) {
      logStore.logSystem('Action started', {
        component: 'ActionRunner',
        actionId,
        actionType: action.type,
        isStreaming,
        status: 'running',
      });
    }

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
        case 'supabase': {
          try {
            await this.handleSupabaseAction(action as SupabaseAction);
          } catch (error: any) {
            // Update action status
            this.#updateAction(actionId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Supabase action failed',
            });

            // Return early without re-throwing
            return;
          }
          break;
        }
        case 'build': {
          const buildOutput = await this.#runBuildAction(action);

          // Store build output for deployment
          this.buildOutput = buildOutput;
          break;
        }
        case 'start': {
          const monitoredStart = this.#runStartAction(action)
            .then(() => ({ ok: true as const }))
            .catch((error) => ({ ok: false as const, error }));

          const settleOutcome = await Promise.race([
            monitoredStart,
            new Promise<{ ok: 'pending' }>((resolve) =>
              setTimeout(() => resolve({ ok: 'pending' }), START_ACTION_SETTLE_WINDOW_MS),
            ),
          ]);

          if (settleOutcome.ok === true) {
            this.#updateAction(actionId, { status: 'complete' });
            return;
          }

          if (settleOutcome.ok === false) {
            throw settleOutcome.error;
          }

          monitoredStart.then((outcome) => {
            if (outcome.ok) {
              this.#updateAction(actionId, { status: 'complete' });
              return;
            }

            this.#handleStartActionFailure(actionId, action, outcome.error);
          });

          return;
        }
      }

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });

      if (!isStreaming) {
        logStore.logSystem('Action completed', {
          component: 'ActionRunner',
          actionId,
          actionType: action.type,
          status: action.abortSignal.aborted ? 'aborted' : 'complete',
        });
      }
    } catch (error) {
      if (action.abortSignal.aborted) {
        logStore.logSystem('Action aborted', {
          component: 'ActionRunner',
          actionId,
          actionType: action.type,
          status: 'aborted',
        });
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
      logStore.logError('Action failed', error, {
        component: 'ActionRunner',
        actionId,
        actionType: action.type,
        status: 'failed',
      });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      this.onAlert?.({
        type: 'error',
        title: 'Dev Server Failed',
        description: error.header,
        content: error.output,
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  #handleStartActionFailure(actionId: string, action: ActionState, error: unknown) {
    if (action.abortSignal.aborted) {
      return;
    }

    this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
    logger.error(`[${action.type}]:Action failed\n\n`, error);

    if (!(error instanceof ActionCommandError)) {
      return;
    }

    this.onAlert?.({
      type: 'error',
      title: 'Dev Server Failed',
      description: error.header,
      content: error.output,
    });
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    // Pre-validate command for common issues
    const validationResult = await this.#validateShellCommand(action.content);

    if (validationResult.fatalError) {
      throw new ActionCommandError(validationResult.fatalError.title, validationResult.fatalError.details);
    }

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified command: ${action.content} -> ${validationResult.modifiedCommand}`);
      action.content = validationResult.modifiedCommand;
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      const enhancedError = this.#createEnhancedShellError(action.content, resp?.exitCode, resp?.output);
      throw new ActionCommandError(enhancedError.title, enhancedError.details);
    }
  }

  async #runStartAction(action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    const validationResult = await this.#validateShellCommand(action.content);

    if (validationResult.fatalError) {
      throw new ActionCommandError(validationResult.fatalError.title, validationResult.fatalError.details);
    }

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified start command: ${action.content} -> ${validationResult.modifiedCommand}`);
      action.content = validationResult.modifiedCommand;
    }

    const webcontainer = await this.#webcontainer;
    const sharedShell = this.#shellTerminal?.();

    if (sharedShell) {
      await sharedShell.ready();
    }

    const mirroredTerminal = this.#createDetachedShellTerminal(sharedShell?.terminal);
    const detachedShell = newBoltShellProcess();
    await detachedShell.init(webcontainer, mirroredTerminal);

    const abortDetachedShell = () => {
      detachedShell.terminal?.input('\x03');
    };

    action.abortSignal.addEventListener('abort', abortDetachedShell, { once: true });

    try {
      const resp = await detachedShell.executeCommand(`${this.runnerId.get()}-${action.type}`, action.content, () => {
        logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
        action.abort();
      });
      logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

      if (resp?.exitCode != 0) {
        const enhancedError = this.#createEnhancedShellError(action.content, resp?.exitCode, resp?.output);
        throw new ActionCommandError(enhancedError.title, enhancedError.details);
      }

      return resp;
    } finally {
      action.abortSignal.removeEventListener('abort', abortDetachedShell);

      try {
        detachedShell.process?.kill();
      } catch (error) {
        logger.debug('Failed to tear down detached start shell cleanly', error);
      }
    }
  }

  #createDetachedShellTerminal(mirrorTerminal?: ITerminal): ITerminal {
    const listeners = new Set<(data: string) => void>();

    return {
      cols: mirrorTerminal?.cols ?? 80,
      rows: mirrorTerminal?.rows ?? 24,
      reset: () => {
        mirrorTerminal?.reset();
      },
      write: (data: string) => {
        mirrorTerminal?.write(data);
      },
      onData: (cb: (data: string) => void) => {
        listeners.add(cb);
      },
      input: (data: string) => {
        for (const listener of listeners) {
          listener(data);
        }
      },
    };
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const webcontainer = await this.#webcontainer;
    const relativePath = nodePath.relative(webcontainer.workdir, action.filePath);

    let folder = nodePath.dirname(relativePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
      }
    }

    try {
      await webcontainer.fs.writeFile(relativePath, action.content);
      logger.debug(`File written ${relativePath}`);
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  async getFileHistory(filePath: string): Promise<FileHistory | null> {
    try {
      const webcontainer = await this.#webcontainer;
      const historyPath = this.#getHistoryPath(filePath);
      const content = await webcontainer.fs.readFile(historyPath, 'utf-8');

      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to get file history:', error);
      return null;
    }
  }

  async saveFileHistory(filePath: string, history: FileHistory) {
    // const webcontainer = await this.#webcontainer;
    const historyPath = this.#getHistoryPath(filePath);

    await this.#runFileAction({
      type: 'file',
      filePath: historyPath,
      content: JSON.stringify(history),
      changeSource: 'auto-save',
    } as any);
  }

  #getHistoryPath(filePath: string) {
    return nodePath.join('.history', filePath);
  }

  async #runBuildAction(action: ActionState) {
    if (action.type !== 'build') {
      unreachable('Expected build action');
    }

    // Trigger build started alert
    this.onDeployAlert?.({
      type: 'info',
      title: 'Building Application',
      description: 'Building your application...',
      stage: 'building',
      buildStatus: 'running',
      deployStatus: 'pending',
      source: 'netlify',
    });

    const webcontainer = await this.#webcontainer;
    const packageManager = await this.#resolveNodePackageManager();
    const buildCommand =
      packageManager === 'yarn'
        ? { executable: 'yarn', args: ['build'] }
        : { executable: packageManager, args: ['run', 'build'] };

    // Create a new terminal specifically for the build
    const buildProcess = await webcontainer.spawn(buildCommand.executable, buildCommand.args);

    let output = '';
    const outputPromise = buildProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          output += data;
        },
      }),
    );

    const exitCode = await buildProcess.exit;
    await outputPromise.catch(() => {
      // Ignore output piping errors; we still have whatever was captured
    });

    let buildDir = '';

    if (exitCode !== 0) {
      const buildResult = {
        path: buildDir,
        exitCode,
        output,
      };

      this.buildOutput = buildResult;

      // Trigger build failed alert
      this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Your application build failed',
        content: output || 'No build output available',
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });

      throw new ActionCommandError('Build Failed', output || 'No Output Available');
    }

    // Trigger build success alert
    this.onDeployAlert?.({
      type: 'success',
      title: 'Build Completed',
      description: 'Your application was built successfully',
      stage: 'deploying',
      buildStatus: 'complete',
      deployStatus: 'running',
      source: 'netlify',
    });

    // Check for common build directories
    const commonBuildDirs = ['dist', 'build', 'out', 'output', '.next', 'public'];

    // Try to find the first existing build directory
    for (const dir of commonBuildDirs) {
      const dirPath = nodePath.join(webcontainer.workdir, dir);

      try {
        await webcontainer.fs.readdir(dirPath);
        buildDir = dirPath;
        break;
      } catch {
        continue;
      }
    }

    // If no build directory was found, use the default (dist)
    if (!buildDir) {
      buildDir = nodePath.join(webcontainer.workdir, 'dist');
    }

    const buildResult = {
      path: buildDir,
      exitCode,
      output,
    };

    this.buildOutput = buildResult;

    return buildResult;
  }
  async handleSupabaseAction(action: SupabaseAction) {
    const { operation, content, filePath } = action;
    logger.debug('[Supabase Action]:', { operation, filePath, content });

    switch (operation) {
      case 'migration':
        if (!filePath) {
          throw new Error('Migration requires a filePath');
        }

        // Show alert for migration action
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Migration',
          description: `Create migration file: ${filePath}`,
          content,
          source: 'supabase',
        });

        // Only create the migration file
        await this.#runFileAction({
          type: 'file',
          filePath,
          content,
          changeSource: 'supabase',
        } as any);
        return { success: true };

      case 'query': {
        // Always show the alert and let the SupabaseAlert component handle connection state
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Query',
          description: 'Execute database query',
          content,
          source: 'supabase',
        });

        // The actual execution will be triggered from SupabaseChatAlert
        return { pending: true };
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // Add this method declaration to the class
  handleDeployAction(
    stage: 'building' | 'deploying' | 'complete',
    status: ActionStatus,
    details?: {
      url?: string;
      error?: string;
      source?: 'netlify' | 'vercel' | 'github' | 'gitlab';
    },
  ): void {
    if (!this.onDeployAlert) {
      logger.debug('No deploy alert handler registered');
      return;
    }

    const alertType = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';

    const title =
      stage === 'building'
        ? 'Building Application'
        : stage === 'deploying'
          ? 'Deploying Application'
          : 'Deployment Complete';

    const description =
      status === 'failed'
        ? `${stage === 'building' ? 'Build' : 'Deployment'} failed`
        : status === 'running'
          ? `${stage === 'building' ? 'Building' : 'Deploying'} your application...`
          : status === 'complete'
            ? `${stage === 'building' ? 'Build' : 'Deployment'} completed successfully`
            : `Preparing to ${stage === 'building' ? 'build' : 'deploy'} your application`;

    const buildStatus =
      stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending';

    const deployStatus = stage === 'building' ? 'pending' : status;

    this.onDeployAlert({
      type: alertType,
      title,
      description,
      content: details?.error || '',
      url: details?.url,
      stage,
      buildStatus: buildStatus as any,
      deployStatus: deployStatus as any,
      source: details?.source || 'netlify',
    });
  }

  async #validateShellCommand(command: string): Promise<{
    shouldModify: boolean;
    modifiedCommand?: string;
    warning?: string;
    fatalError?: {
      title: string;
      details: string;
    };
  }> {
    const normalizedCommand = rewriteNpmToPnpmForWebContainer(ensureNpxNonInteractive(rewriteLegacyWorkspaceCd(command)));
    const trimmedCommand = normalizedCommand.trim();

    if (normalizedCommand !== command) {
      const rewrittenWorkspace = rewriteLegacyWorkspaceCd(command);
      const rewriteReason =
        rewrittenWorkspace !== command
          ? 'Replaced legacy /workspace path with /home/project'
          : normalizedCommand !== ensureNpxNonInteractive(rewriteLegacyWorkspaceCd(command))
            ? 'Rewrote npm command to pnpm for WebContainer compatibility'
            : 'Added --yes to npx command to avoid interactive prompts';

      return {
        shouldModify: true,
        modifiedCommand: normalizedCommand,
        warning: rewriteReason,
      };
    }

    try {
      const webcontainer = await this.#webcontainer;
      const executionContexts = getShellCommandExecutionContexts(trimmedCommand, webcontainer.workdir);

      for (const context of executionContexts) {
        if (!commandRequiresNodePackageManifest(context.command)) {
          continue;
        }

        const manifestPath = nodePath.join(context.cwd, 'package.json');
        const relativeManifestPath = nodePath.relative(webcontainer.workdir, manifestPath);

        try {
          await webcontainer.fs.readFile(relativeManifestPath);
        } catch {
          return {
            shouldModify: false,
            fatalError: {
              title: 'Missing package.json',
              details: `Command '${context.command}' requires a package.json in '${context.cwd}', but none exists there. Write package.json first, then run the package-manager command.`,
            },
          };
        }
      }
    } catch (error) {
      logger.debug('Could not validate package manifest requirements for shell command:', error);
    }

    // Handle rm commands that might fail due to missing files
    if (trimmedCommand.startsWith('rm ') && !trimmedCommand.includes(' -f')) {
      const rmMatch = trimmedCommand.match(/^rm\s+(.+)$/);

      if (rmMatch) {
        const filePaths = rmMatch[1].split(/\s+/);

        // Check if any of the files exist using WebContainer
        try {
          const webcontainer = await this.#webcontainer;
          const existingFiles = [];

          for (const filePath of filePaths) {
            if (filePath.startsWith('-')) {
              continue;
            } // Skip flags

            try {
              await webcontainer.fs.readFile(filePath);
              existingFiles.push(filePath);
            } catch {
              // File doesn't exist, skip it
            }
          }

          if (existingFiles.length === 0) {
            // No files exist, modify command to use -f flag to avoid error
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as target files do not exist',
            };
          } else if (existingFiles.length < filePaths.length) {
            // Some files don't exist, modify to only remove existing ones with -f for safety
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as some target files do not exist',
            };
          }
        } catch (error) {
          logger.debug('Could not validate rm command files:', error);
        }
      }
    }

    // Handle cd commands to non-existent directories
    if (trimmedCommand.startsWith('cd ')) {
      const cdMatch = trimmedCommand.match(/^cd\s+(.+)$/);

      if (cdMatch) {
        const targetDir = cdMatch[1].trim();

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readdir(targetDir);
        } catch {
          return {
            shouldModify: true,
            modifiedCommand: `mkdir -p ${targetDir} && cd ${targetDir}`,
            warning: 'Directory does not exist, created it first',
          };
        }
      }
    }

    // Handle cp/mv commands with missing source files
    if (trimmedCommand.match(/^(cp|mv)\s+/)) {
      const parts = trimmedCommand.split(/\s+/);

      if (parts.length >= 3) {
        const sourceFile = parts[1];

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readFile(sourceFile);
        } catch {
          return {
            shouldModify: false,
            warning: `Source file '${sourceFile}' does not exist`,
          };
        }
      }
    }

    return { shouldModify: false };
  }

  async #resolveNodePackageManager(): Promise<'pnpm' | 'yarn' | 'npm'> {
    const webcontainer = await this.#webcontainer;

    try {
      await webcontainer.fs.readFile('pnpm-lock.yaml', 'utf-8');
      return 'pnpm';
    } catch {}

    try {
      await webcontainer.fs.readFile('yarn.lock', 'utf-8');
      return 'yarn';
    } catch {}

    return 'pnpm';
  }

  #createEnhancedShellError(
    command: string,
    exitCode: number | undefined,
    output: string | undefined,
  ): {
    title: string;
    details: string;
  } {
    const trimmedCommand = command.trim();
    const firstWord = trimmedCommand.split(/\s+/)[0];

    // Common error patterns and their explanations
    const errorPatterns = [
      {
        pattern: /cannot remove.*No such file or directory/,
        title: 'File Not Found',
        getMessage: () => {
          const fileMatch = output?.match(/'([^']+)'/);
          const fileName = fileMatch ? fileMatch[1] : 'file';

          return `The file '${fileName}' does not exist and cannot be removed.\n\nSuggestion: Use 'ls' to check what files exist, or use 'rm -f' to ignore missing files.`;
        },
      },
      {
        pattern: /No such file or directory/,
        title: 'File or Directory Not Found',
        getMessage: () => {
          if (trimmedCommand.startsWith('cd ')) {
            const dirMatch = trimmedCommand.match(/cd\s+(.+)/);
            const dirName = dirMatch ? dirMatch[1] : 'directory';

            return `The directory '${dirName}' does not exist.\n\nSuggestion: Use 'mkdir -p ${dirName}' to create it first, or check available directories with 'ls'.`;
          }

          return `The specified file or directory does not exist.\n\nSuggestion: Check the path and use 'ls' to see available files.`;
        },
      },
      {
        pattern: /Permission denied/,
        title: 'Permission Denied',
        getMessage: () =>
          `Permission denied for '${firstWord}'.\n\nSuggestion: The file may not be executable. Try 'chmod +x filename' first.`,
      },
      {
        pattern: /command not found/,
        title: 'Command Not Found',
        getMessage: () =>
          `The command '${firstWord}' is not available in WebContainer.\n\nSuggestion: Check available commands or use a package manager to install it.`,
      },
      {
        pattern: /Is a directory/,
        title: 'Target is a Directory',
        getMessage: () =>
          `Cannot perform this operation - target is a directory.\n\nSuggestion: Use 'ls' to list directory contents or add appropriate flags.`,
      },
      {
        pattern: /File exists/,
        title: 'File Already Exists',
        getMessage: () => `File already exists.\n\nSuggestion: Use a different name or add '-f' flag to overwrite.`,
      },
    ];

    // Try to match known error patterns
    for (const errorPattern of errorPatterns) {
      if (output && errorPattern.pattern.test(output)) {
        return {
          title: errorPattern.title,
          details: errorPattern.getMessage(),
        };
      }
    }

    // Generic error with suggestions based on command type
    let suggestion = '';

    if (trimmedCommand.startsWith('npm ') || trimmedCommand.startsWith('pnpm ') || trimmedCommand.startsWith('yarn ')) {
      suggestion = '\n\nSuggestion: Check that package.json exists in the command working directory, then run the package-manager command again.';
    } else if (trimmedCommand.startsWith('git ')) {
      suggestion = "\n\nSuggestion: Check if you're in a git repository or if remote is configured.";
    } else if (trimmedCommand.match(/^(ls|cat|rm|cp|mv)/)) {
      suggestion = '\n\nSuggestion: Check file paths and use "ls" to see available files.';
    }

    return {
      title: `Command Failed (exit code: ${exitCode})`,
      details: `Command: ${trimmedCommand}\n\nOutput: ${output || 'No output available'}${suggestion}`,
    };
  }
}
