import { describe, expect, it, vi } from 'vitest';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import * as shellModule from '~/utils/shell';

describe('ActionRunner start command validation', () => {
  it('prevalidates start commands and surfaces missing package.json as an alert', async () => {
    const shellExecute = vi.fn();
    const shell = {
      ready: vi.fn(async () => undefined),
      terminal: {},
      process: {},
      executeCommand: shellExecute,
    } as any;

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            throw new Error('missing');
          }

          return '';
        }),
      },
    } as any;

    const onAlert = vi.fn();
    const runner = new ActionRunner(Promise.resolve(webcontainer), () => shell, onAlert);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'pnpm dev',
      },
    };

    runner.addAction(actionData);
    await expect(runner.runAction(actionData)).rejects.toThrow('Missing package.json');

    expect(shellExecute).not.toHaveBeenCalled();
    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dev Server Failed',
        description: 'Missing package.json',
      }),
    );
  });

  it('runs start commands in a detached shell so shared shell execution is not interrupted', async () => {
    vi.useFakeTimers();

    const sharedShellExecute = vi.fn();
    const sharedShell = {
      ready: vi.fn(async () => undefined),
      terminal: {
        cols: 80,
        rows: 24,
        write: vi.fn(),
        reset: vi.fn(),
        onData: vi.fn(),
        input: vi.fn(),
      },
      process: {},
      executeCommand: sharedShellExecute,
    } as any;

    const detachedShellExecute = vi.fn(async () => ({ exitCode: 0, output: 'ready' }));
    const detachedShellInit = vi.fn(async () => undefined);
    const detachedShellKill = vi.fn();

    vi.spyOn(shellModule, 'newBoltShellProcess').mockReturnValue({
      ready: vi.fn(async () => undefined),
      init: detachedShellInit,
      terminal: { input: vi.fn() },
      process: { kill: detachedShellKill },
      executeCommand: detachedShellExecute,
    } as any);

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        readFile: vi.fn(async () => '{"name":"demo"}'),
      },
    } as any;

    const runner = new ActionRunner(Promise.resolve(webcontainer), () => sharedShell);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'pnpm dev',
      },
    };

    runner.addAction(actionData);
    const runPromise = runner.runAction(actionData);
    await vi.advanceTimersByTimeAsync(2000);
    await runPromise;

    expect(sharedShellExecute).not.toHaveBeenCalled();
    expect(detachedShellInit).toHaveBeenCalledWith(webcontainer, expect.any(Object));
    expect(detachedShellExecute).toHaveBeenCalledWith(expect.stringContaining('start'), 'pnpm dev', expect.any(Function));
    expect(detachedShellKill).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('rewrites npx start commands to include --yes for non-interactive execution', async () => {
    vi.useFakeTimers();

    const sharedShellExecute = vi.fn();
    const sharedShell = {
      ready: vi.fn(async () => undefined),
      terminal: {
        cols: 80,
        rows: 24,
        write: vi.fn(),
        reset: vi.fn(),
        onData: vi.fn(),
        input: vi.fn(),
      },
      process: {},
      executeCommand: sharedShellExecute,
    } as any;

    const detachedShellExecute = vi.fn(async () => ({ exitCode: 0, output: 'ready' }));

    vi.spyOn(shellModule, 'newBoltShellProcess').mockReturnValue({
      ready: vi.fn(async () => undefined),
      init: vi.fn(async () => undefined),
      terminal: { input: vi.fn() },
      process: { kill: vi.fn() },
      executeCommand: detachedShellExecute,
    } as any);

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            return '{"name":"demo"}';
          }

          return '';
        }),
      },
    } as any;

    const runner = new ActionRunner(Promise.resolve(webcontainer), () => sharedShell);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'npx vite --host 0.0.0.0 --port 4173',
      },
    };

    runner.addAction(actionData);
    const runPromise = runner.runAction(actionData);
    await vi.advanceTimersByTimeAsync(2000);
    await runPromise;

    expect(detachedShellExecute).toHaveBeenCalledWith(
      expect.stringContaining('start'),
      'npx --yes vite --host 0.0.0.0 --port 4173',
      expect.any(Function),
    );

    vi.useRealTimers();
  });

  it('rewrites npm start commands to pnpm when no pnpm lockfile exists', async () => {
    vi.useFakeTimers();

    const sharedShell = {
      ready: vi.fn(async () => undefined),
      terminal: {
        cols: 80,
        rows: 24,
        write: vi.fn(),
        reset: vi.fn(),
        onData: vi.fn(),
        input: vi.fn(),
      },
      process: {},
      executeCommand: vi.fn(),
    } as any;

    const detachedShellExecute = vi.fn(async () => ({ exitCode: 0, output: 'ready' }));

    vi.spyOn(shellModule, 'newBoltShellProcess').mockReturnValue({
      ready: vi.fn(async () => undefined),
      init: vi.fn(async () => undefined),
      terminal: { input: vi.fn() },
      process: { kill: vi.fn() },
      executeCommand: detachedShellExecute,
    } as any);

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            return '{"name":"demo"}';
          }

          throw new Error(`missing ${path}`);
        }),
      },
    } as any;

    const runner = new ActionRunner(Promise.resolve(webcontainer), () => sharedShell);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'npm run dev',
      },
    };

    runner.addAction(actionData);
    const runPromise = runner.runAction(actionData);
    await vi.advanceTimersByTimeAsync(2000);
    await runPromise;

    expect(detachedShellExecute).toHaveBeenCalledWith(
      expect.stringContaining('start'),
      'pnpm run dev',
      expect.any(Function),
    );

    vi.useRealTimers();
  });

  it('rewrites npm start commands to pnpm when pnpm lockfile exists', async () => {
    vi.useFakeTimers();

    const sharedShell = {
      ready: vi.fn(async () => undefined),
      terminal: {
        cols: 80,
        rows: 24,
        write: vi.fn(),
        reset: vi.fn(),
        onData: vi.fn(),
        input: vi.fn(),
      },
      process: {},
      executeCommand: vi.fn(),
    } as any;

    const detachedShellExecute = vi.fn(async () => ({ exitCode: 0, output: 'ready' }));

    vi.spyOn(shellModule, 'newBoltShellProcess').mockReturnValue({
      ready: vi.fn(async () => undefined),
      init: vi.fn(async () => undefined),
      terminal: { input: vi.fn() },
      process: { kill: vi.fn() },
      executeCommand: detachedShellExecute,
    } as any);

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            return '{"name":"demo"}';
          }

          if (path === 'pnpm-lock.yaml') {
            return 'lockfileVersion: 9.0';
          }

          throw new Error(`missing ${path}`);
        }),
      },
    } as any;

    const runner = new ActionRunner(Promise.resolve(webcontainer), () => sharedShell);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'npm run dev',
      },
    };

    runner.addAction(actionData);
    const runPromise = runner.runAction(actionData);
    await vi.advanceTimersByTimeAsync(2000);
    await runPromise;

    expect(detachedShellExecute).toHaveBeenCalledWith(
      expect.stringContaining('start'),
      'pnpm run dev',
      expect.any(Function),
    );

    vi.useRealTimers();
  });

  it('keeps /workspace cd target when runtime workdir is /workspace', async () => {
    vi.useFakeTimers();

    const sharedShell = {
      ready: vi.fn(async () => undefined),
      terminal: {
        cols: 80,
        rows: 24,
        write: vi.fn(),
        reset: vi.fn(),
        onData: vi.fn(),
        input: vi.fn(),
      },
      process: {},
      executeCommand: vi.fn(),
    } as any;

    const detachedShellExecute = vi.fn(async () => ({ exitCode: 0, output: 'ready' }));

    vi.spyOn(shellModule, 'newBoltShellProcess').mockReturnValue({
      ready: vi.fn(async () => undefined),
      init: vi.fn(async () => undefined),
      terminal: { input: vi.fn() },
      process: { kill: vi.fn() },
      executeCommand: detachedShellExecute,
    } as any);

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        readFile: vi.fn(async (path: string) => {
          if (path === 'package.json') {
            return '{"name":"demo"}';
          }

          if (path === 'pnpm-lock.yaml') {
            return 'lockfileVersion: 9.0';
          }

          throw new Error(`missing ${path}`);
        }),
      },
    } as any;

    const runner = new ActionRunner(Promise.resolve(webcontainer), () => sharedShell);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'cd /workspace && npm run dev',
      },
    };

    runner.addAction(actionData);
    const runPromise = runner.runAction(actionData);
    await vi.advanceTimersByTimeAsync(2000);
    await runPromise;

    expect(detachedShellExecute).toHaveBeenCalledWith(
      expect.stringContaining('start'),
      'pnpm run dev',
      expect.any(Function),
    );

    vi.useRealTimers();
  });

  it('stops previously running start session before launching a new one', async () => {
    vi.useFakeTimers();

    const sharedShell = {
      ready: vi.fn(async () => undefined),
      terminal: {
        cols: 80,
        rows: 24,
        write: vi.fn(),
        reset: vi.fn(),
        onData: vi.fn(),
        input: vi.fn(),
      },
      process: {},
      executeCommand: vi.fn(),
    } as any;

    const firstDetachedKill = vi.fn();
    const firstDetachedTerminalInput = vi.fn();
    const firstDetachedExecute = vi.fn(() => new Promise(() => undefined));

    const secondDetachedKill = vi.fn();
    const secondDetachedExecute = vi.fn(async () => ({ exitCode: 0, output: 'ready' }));

    const newShellMock = vi.spyOn(shellModule, 'newBoltShellProcess');
    newShellMock
      .mockReturnValueOnce({
        ready: vi.fn(async () => undefined),
        init: vi.fn(async () => undefined),
        terminal: { input: firstDetachedTerminalInput },
        process: { kill: firstDetachedKill },
        executeCommand: firstDetachedExecute,
      } as any)
      .mockReturnValueOnce({
        ready: vi.fn(async () => undefined),
        init: vi.fn(async () => undefined),
        terminal: { input: vi.fn() },
        process: { kill: secondDetachedKill },
        executeCommand: secondDetachedExecute,
      } as any);

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        readFile: vi.fn(async () => '{"name":"demo"}'),
      },
    } as any;

    const runner = new ActionRunner(Promise.resolve(webcontainer), () => sharedShell);

    const firstAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'pnpm dev',
      },
    };

    const secondAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-2',
      actionId: 'action-2',
      action: {
        type: 'start',
        content: 'pnpm dev --host',
      },
    };

    runner.addAction(firstAction);
    const firstRunPromise = runner.runAction(firstAction);
    await vi.advanceTimersByTimeAsync(2000);
    await firstRunPromise;

    runner.addAction(secondAction);
    const secondRunPromise = runner.runAction(secondAction);
    await vi.advanceTimersByTimeAsync(2000);
    await secondRunPromise;

    expect(firstDetachedTerminalInput).toHaveBeenCalledWith('\x03');
    expect(firstDetachedKill).toHaveBeenCalled();
    expect(secondDetachedExecute).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
