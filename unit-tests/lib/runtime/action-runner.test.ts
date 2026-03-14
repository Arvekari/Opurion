import { describe, expect, it, vi } from 'vitest';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { logStore } from '~/lib/stores/logs';

describe('app/lib/runtime/action-runner.ts', () => {
  it('does not log duplicate running events for the same streaming action', async () => {
    const shell = {
      ready: vi.fn(async () => undefined),
      terminal: {},
      process: {},
      executeCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
    } as any;

    const webcontainer = {
      workdir: '/workspace',
      fs: {
        mkdir: vi.fn(async () => undefined),
        writeFile: vi.fn(async () => undefined),
      },
    } as any;

    const runner = new ActionRunner(Promise.resolve(webcontainer), () => shell);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'file',
        filePath: '/workspace/src/App.jsx',
        content: 'export default function App() {}',
      },
    };

    const logSpy = vi.spyOn(logStore, 'logSystem');

    runner.addAction(actionData);
    await runner.runAction(actionData, true);
    await runner.runAction(actionData, true);

    const runningLogs = logSpy.mock.calls.filter(([message]) => message === 'Action started');

    expect(runningLogs.length).toBeLessThanOrEqual(1);
  });
});
