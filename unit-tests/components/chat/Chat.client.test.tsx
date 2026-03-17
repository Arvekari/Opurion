/* @vitest-environment jsdom */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatImpl } from '../../../app/components/chat/Chat.client';

const appendMock = vi.fn();
const sendMessageMock = vi.fn();
const stopMock = vi.fn();
const removeCookieMock = vi.fn();
const abortAllActionsMock = vi.fn();
const setChatStoreKeyMock = vi.fn();
const toastErrorMock = vi.fn();
const restartWebContainerMock = vi.fn(async () => undefined);
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, artifact: { id: 'plan-1' } }) }));
let chatStatusMock: 'ready' | 'streaming' | 'submitted' = 'ready';
let actionAlertMock: any = undefined;
let workbenchFilesMock: any = [];

const selectedProvider = { name: 'OpenAI' };

vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn((key: string) => (key === 'prompt' ? 'seed prompt' : undefined)),
    set: vi.fn(),
    remove: (...args: any[]) => removeCookieMock(...args),
  },
}));

vi.mock('@nanostores/react', () => ({
  useStore: (store: any) => {
    if (store && typeof store.get === 'function') {
      return store.get();
    }

    return store;
  },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    status: chatStatusMock,
    stop: stopMock,
    sendMessage: sendMessageMock,
    setMessages: vi.fn(),
    error: undefined,
    addToolOutput: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  useAnimate: () => [null, vi.fn(async () => {})],
  cubicBezier: () => (t: number) => t,
}));

vi.mock('@remix-run/react', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('../../../app/components/chat/BaseChat', () => ({
  BaseChat: (props: any) => (
    <div>
      <div data-testid="draft-input">{props.input}</div>
      <div data-testid="message-list">
        {(props.messages || []).map((message: any) => (
          <div key={message.id || message.content}>
            <span>{message.content}</span>
            {message.annotations?.includes('queued') && (
              <>
                <span>Queued</span>
                <button onClick={() => props.onEditQueuedMessage?.(message.id)} type="button">
                  edit-queued
                </button>
                <button onClick={() => props.onRemoveQueuedMessage?.(message.id)} type="button">
                  remove-queued
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <button onClick={(event) => props.sendMessage(event, 'hello world')} type="button">
        send
      </button>
      <button onClick={() => props.handleStop?.()} type="button">
        stop
      </button>
    </div>
  ),
}));

vi.mock('../../../app/lib/hooks', () => ({
  useShortcuts: () => {},
  usePromptEnhancer: () => ({
    enhancingPrompt: false,
    promptEnhanced: false,
    enhancePrompt: vi.fn(),
    resetEnhancer: vi.fn(),
  }),
  useMessageParser: () => ({
    parsedMessages: [],
    parseMessages: vi.fn(),
  }),
}));

vi.mock('../../../app/lib/hooks/useSettings', () => ({
  useSettings: () => ({
    activeProviders: [selectedProvider],
    promptId: undefined,
    autoSelectTemplate: true,
    contextOptimizationEnabled: false,
  }),
}));

vi.mock('../../../app/lib/stores/chat', () => ({
  chatStore: {
    showChat: { get: () => true, subscribe: () => () => {} },
    setKey: (...args: any[]) => setChatStoreKeyMock(...args),
  },
}));

vi.mock('~/lib/persistence', () => ({
  chatId: { get: () => undefined, subscribe: () => () => {} },
  chatMetadata: { get: () => undefined, subscribe: () => () => {} },
  description: { get: () => 'test', subscribe: () => () => {} },
  useChatHistory: () => ({
    ready: true,
    initialMessages: [],
    storeMessageHistory: vi.fn(async () => {}),
    importChat: vi.fn(async () => {}),
    exportChat: vi.fn(),
  }),
}));

vi.mock('../../../app/lib/stores/workbench', () => ({
  workbenchStore: {
    files: { get: () => workbenchFilesMock, subscribe: () => () => {} },
    alert: { get: () => actionAlertMock, subscribe: () => () => {} },
    deployAlert: { get: () => undefined, subscribe: () => () => {} },
    supabaseAlert: { get: () => undefined, subscribe: () => () => {} },
    abortAllActions: () => abortAllActionsMock(),
    getModifiedFiles: () => undefined,
    resetAllFileModifications: vi.fn(),
    clearAlert: vi.fn(() => {
      actionAlertMock = undefined;
    }),
    clearSupabaseAlert: vi.fn(),
    clearDeployAlert: vi.fn(),
    setReloadedMessages: vi.fn(),
  },
}));

vi.mock('~/lib/webcontainer', () => ({
  restartWebContainer: (...args: any[]) => restartWebContainerMock(...args),
}));

vi.mock('../../../app/lib/stores/model', () => ({
  selectedModelStore: { get: () => 'gpt-4o-mini', subscribe: () => () => {} },
  selectedProviderStore: { get: () => selectedProvider, subscribe: () => () => {} },
  setSelectedModel: vi.fn(),
  setSelectedProvider: vi.fn(),
}));

vi.mock('../../../app/lib/stores/supabase', () => ({
  supabaseConnection: {
    get: () => ({ isConnected: false, selectedProjectId: undefined, stats: { projects: [] }, credentials: {} }),
    subscribe: () => () => {},
  },
}));

vi.mock('../../../app/lib/stores/collab', () => ({
  collabStore: {
    get: () => ({
      branchMode: 'main',
      selectedProjectId: undefined,
      selectedConversationId: undefined,
      projectNarratives: '',
      projectMaterials: '',
      projectGuides: '',
      projectFiles: [],
      discussionIndex: [],
    }),
    subscribe: () => () => {},
  },
}));

vi.mock('../../../app/lib/stores/mcp', () => ({
  useMCPStore: (selector: any) => selector({ settings: { maxLLMSteps: 1 } }),
}));

vi.mock('../../../app/lib/stores/logs', () => ({
  logStore: {
    logProvider: vi.fn(),
    logError: vi.fn(),
    logUserAction: vi.fn(),
    logSystem: vi.fn(),
  },
}));

vi.mock('../../../app/lib/stores/streaming', () => ({
  streamingState: { set: vi.fn() },
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: any[]) => toastErrorMock(...args),
    warning: vi.fn(),
  },
}));

describe('app/components/chat/Chat.client.tsx', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    appendMock.mockReset();
    sendMessageMock.mockReset();
    stopMock.mockReset();
    removeCookieMock.mockReset();
    abortAllActionsMock.mockReset();
    setChatStoreKeyMock.mockReset();
    toastErrorMock.mockReset();
    restartWebContainerMock.mockClear();
    fetchMock.mockClear();
    chatStatusMock = 'ready';
    actionAlertMock = undefined;
    workbenchFilesMock = [];
  });

  it('first send appends user message and clears draft input immediately', async () => {
    render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });

    const sendPayload = sendMessageMock.mock.calls[0][0];
    expect(sendPayload.text).toContain('hello world');
    expect(removeCookieMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByTestId('draft-input').textContent).toBe('');
    });
  });

  it('stop handler aborts active workbench actions and marks chat as aborted', () => {
    render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('stop'));

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(abortAllActionsMock).toHaveBeenCalledTimes(1);
    expect(setChatStoreKeyMock).toHaveBeenCalledWith('aborted', true);
  });

  it('always uses sendMessage (v3 API) to submit messages', async () => {
    render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });

    expect(appendMock).not.toHaveBeenCalled();
    expect(sendMessageMock.mock.calls[0][0]).toMatchObject({
      text: expect.stringContaining('hello world'),
    });
  });

  it('includes project guides and attached file references in sent context', async () => {
    const collabModule = await import('../../../app/lib/stores/collab');
    vi.spyOn(collabModule.collabStore, 'get').mockReturnValue({
      branchMode: 'main',
      selectedProjectId: 'project-1',
      selectedConversationId: undefined,
      projectNarratives: 'Platform modernization goals',
      projectMaterials: 'Shared API contract v2',
      projectGuides: 'Always reuse checkout flow components',
      projectPlan: '# Active Project Plan\n- Keep checkout flow intact',
      projectPlanArtifactId: 'plan-1',
      projectFiles: [{ name: 'pricing-rules.md', mimeType: 'text/markdown', content: 'Tiered pricing rules', size: 20 }],
      discussionIndex: [
        { id: 'discussion-1', title: 'Discovery' },
        { id: 'discussion-2', title: 'Implementation' },
      ],
    } as any);

    render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });

    const text = sendMessageMock.mock.calls[0][0].text;
    expect(text).toContain('[Project Shared Context]');
    expect(text).toContain('Always reuse checkout flow components');
    expect(text).toContain('Plan (.plan.md):');
    expect(text).toContain('Keep checkout flow intact');
    expect(text).toContain('pricing-rules.md');
    expect(text).toContain('Discussion 1: Discovery');
  });

  it('queues a message while streaming and dispatches it when streaming completes', async () => {
    chatStatusMock = 'streaming';

    const view = render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(0);
    });

    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.getByText(/hello world/)).toBeTruthy();

    chatStatusMock = 'ready';
    view.rerender(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });

    expect(sendMessageMock.mock.calls[0][0].text).toContain('hello world');

    await waitFor(() => {
      expect(screen.queryByText('Queued')).toBeNull();
    });
  });

  it('allows editing a queued message back into the composer', async () => {
    chatStatusMock = 'streaming';

    render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(screen.getByText('Queued')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('edit-queued'));

    await waitFor(() => {
      expect(screen.queryByText('Queued')).toBeNull();
    });

    expect(screen.getByTestId('draft-input').textContent).toContain('hello world');
  });

  it('allows removing a queued message before dispatch', async () => {
    chatStatusMock = 'streaming';

    render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('send'));

    await waitFor(() => {
      expect(screen.getByText('Queued')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('remove-queued'));

    await waitFor(() => {
      expect(screen.queryByText('Queued')).toBeNull();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(0);
  });

  it('does not auto-timeout before the first response chunk arrives', async () => {
    vi.useFakeTimers();
    chatStatusMock = 'submitted';

    render(
      <ChatImpl
        description="test"
        initialMessages={[] as any}
        storeMessageHistory={vi.fn(async () => {})}
        importChat={vi.fn(async () => {})}
        exportChat={vi.fn()}
      />,
    );

    await vi.advanceTimersByTimeAsync(46_000);

    expect(stopMock).toHaveBeenCalledTimes(0);
    expect(setChatStoreKeyMock).not.toHaveBeenCalledWith('aborted', true);
    expect(toastErrorMock).toHaveBeenCalledTimes(0);

    vi.useRealTimers();
  });

  it('sends an auto-repair prompt that requires a whole-request multi-file fix', async () => {
    vi.useFakeTimers();

    actionAlertMock = {
      type: 'preview',
      title: 'Project preflight failed',
      description: 'Required package.json/dependency/entry checks failed before preview start.',
      content: '1. Missing HTML entrypoint\n2. Source syntax issue in src/App.jsx',
      source: 'preview',
    };

    workbenchFilesMock = {
      'package.json': {
        type: 'file',
        content: '{"scripts":{"dev":"vite"},"dependencies":{"react":"^18.2.0"}}',
      },
      'src/main.jsx': {
        type: 'file',
        content: "import App from './App.jsx';",
      },
      'src/App.jsx': {
        type: 'file',
        content: 'export default function App(){ return <div>Broken</div>;',
      },
    };

    try {
      render(
        <ChatImpl
          description="test"
          initialMessages={[] as any}
          storeMessageHistory={vi.fn(async () => {})}
          importChat={vi.fn(async () => {})}
          exportChat={vi.fn()}
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_100);
        await Promise.resolve();
      });

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      expect(restartWebContainerMock).toHaveBeenCalledTimes(1);

      const sentPayload = sendMessageMock.mock.calls[0][0];
      expect(sentPayload.text).toContain('Fix the whole request, not just the first failing file or the first stack-trace location.');
      expect(sentPayload.text).toContain('If one fix changes imports, exports, config, setup, or entrypoints, update every dependent file in the same repair pass.');
      expect(sentPayload.text).toContain('Project file inventory (inspect related files, not only the first failing file):');
      expect(sentPayload.text).toContain('- src/App.jsx');
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
