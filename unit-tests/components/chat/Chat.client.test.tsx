/* @vitest-environment jsdom */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatImpl } from '../../../app/components/chat/Chat.client';

const appendMock = vi.fn();
const sendMessageMock = vi.fn();
const stopMock = vi.fn();
const removeCookieMock = vi.fn();
const abortAllActionsMock = vi.fn();
const setChatStoreKeyMock = vi.fn();

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
    status: 'ready',
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
    files: { get: () => [], subscribe: () => () => {} },
    alert: { get: () => undefined, subscribe: () => () => {} },
    deployAlert: { get: () => undefined, subscribe: () => () => {} },
    supabaseAlert: { get: () => undefined, subscribe: () => () => {} },
    abortAllActions: () => abortAllActionsMock(),
    getModifiedFiles: () => undefined,
    resetAllFileModifications: vi.fn(),
    clearAlert: vi.fn(),
    clearSupabaseAlert: vi.fn(),
    clearDeployAlert: vi.fn(),
    setReloadedMessages: vi.fn(),
  },
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
  collabStore: { get: () => ({ branchMode: 'main', selectedConversationId: undefined }), subscribe: () => () => {} },
}));

vi.mock('../../../app/lib/stores/mcp', () => ({
  useMCPStore: (selector: any) => selector({ settings: { maxLLMSteps: 1 } }),
}));

vi.mock('../../../app/lib/stores/logs', () => ({
  logStore: {
    logProvider: vi.fn(),
    logError: vi.fn(),
    logUserAction: vi.fn(),
  },
}));

vi.mock('../../../app/lib/stores/streaming', () => ({
  streamingState: { set: vi.fn() },
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('app/components/chat/Chat.client.tsx', () => {
  beforeEach(() => {
    appendMock.mockReset();
    sendMessageMock.mockReset();
    stopMock.mockReset();
    removeCookieMock.mockReset();
    abortAllActionsMock.mockReset();
    setChatStoreKeyMock.mockReset();
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
});
