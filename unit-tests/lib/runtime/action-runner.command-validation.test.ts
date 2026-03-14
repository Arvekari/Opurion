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
    await runner.runAction(actionData);

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
});
