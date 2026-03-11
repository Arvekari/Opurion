/* @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BaseChat } from '../../../app/components/chat/BaseChat';

let mockShowWorkbench = false;

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: any) => (typeof children === 'function' ? children() : children ?? null),
}));

vi.mock('../../../app/components/chat/ChatBox', () => ({
  ChatBox: () => <div data-testid="chatbox">chatbox</div>,
}));

vi.mock('../../../app/components/chat/chatExportAndImport/ImportButtons', () => ({
  ImportButtons: () => <button type="button">Import Chat</button>,
}));

vi.mock('../../../app/components/chat/GitCloneButton', () => ({
  default: () => <button type="button">Clone a repo</button>,
}));

vi.mock('../../../app/components/chat/Messages.client', () => ({
  Messages: () => <div data-testid="messages">messages</div>,
}));

vi.mock('../../../app/components/chat/APIKeyManager', () => ({
  getApiKeysFromCookies: () => ({}),
}));

vi.mock('../../../app/components/workbench/Workbench.client', () => ({
  Workbench: () => <div data-testid="workbench">workbench</div>,
}));

vi.mock('../../../app/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: {
      get: () => mockShowWorkbench,
      subscribe: () => () => {},
      listen: () => () => {},
    },
  },
}));

vi.mock('../../../app/lib/hooks', () => {
  const StickToBottom = Object.assign(
    ({ children }: any) => <div>{children}</div>,
    {
      Content: ({ children }: any) => <div>{children}</div>,
    },
  );

  return {
    StickToBottom,
    useStickToBottomContext: () => ({ isAtBottom: true, scrollToBottom: vi.fn() }),
  };
});

describe('app/components/chat/BaseChat.tsx', () => {
  beforeEach(() => {
    mockShowWorkbench = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ modelList: [] }),
      })) as any,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders landing UI when chat has not started', () => {
    render(
      <BaseChat
        chatStarted={false}
        messages={[] as any}
        importChat={vi.fn(async () => {})}
        handleInputChange={vi.fn()}
      />,
    );

    expect(screen.getByAltText('Bolt2.dyi')).toBeTruthy();
    expect(screen.getByText('Import Chat')).toBeTruthy();
    expect(screen.queryByTestId('messages')).toBeNull();

    const landing = screen.getByTestId('landing-container') as HTMLElement;
    expect(landing.style.justifyContent).toBe('center');
  });

  it('renders active chat UI when messages exist and chatStarted is true', () => {
    render(
      <BaseChat
        chatStarted={true}
        messages={[{ id: 'm1', role: 'assistant', content: 'hello' }] as any}
        importChat={vi.fn(async () => {})}
        handleInputChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('messages')).toBeTruthy();
    expect(screen.queryByText('Import Chat')).toBeNull();
  });

  it('keeps landing UI in r1 and applies split width when workbench is active without messages', () => {
    mockShowWorkbench = true;

    render(
      <BaseChat
        chatStarted={false}
        messages={[] as any}
        importChat={vi.fn(async () => {})}
        handleInputChange={vi.fn()}
      />,
    );

    const r1Pane = screen.getByTestId('workbench-r1-chat-pane') as HTMLElement;

    expect(r1Pane.style.width).toBe('calc(100% - var(--workbench-width))');
    expect(r1Pane.style.maxWidth).toBe('calc(100% - var(--workbench-width))');
    expect(r1Pane.style.getPropertyValue('--chat-max-width')).toBe('100%');
    expect(r1Pane.style.getPropertyValue('--chat-min-width')).toBe('0px');
    expect(screen.getByText('Import Chat')).toBeTruthy();
    expect(screen.getByTestId('workbench-r2-pane')).toBeTruthy();
    expect(screen.getByAltText('Bolt2.dyi')).toBeTruthy();

    const landing = screen.getByTestId('landing-container') as HTMLElement;
    expect(landing.style.justifyContent).toBe('flex-end');
  });

  it('keeps landing when chatStarted=true with no messages and not streaming', () => {
    // showLanding = !hasMessages && !isStreaming — independent of chatStarted
    render(
      <BaseChat
        chatStarted={true}
        isStreaming={false}
        messages={[] as any}
        importChat={vi.fn(async () => {})}
        handleInputChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Import Chat')).toBeTruthy();
    expect(screen.queryByTestId('messages')).toBeNull();
    const landing = screen.getByTestId('landing-container') as HTMLElement;
    expect(landing.style.justifyContent).toBe('center');
  });

  it('switches to active chat as soon as streaming starts (no messages needed)', () => {
    // showLanding becomes false once isStreaming=true, even before messages arrive
    render(
      <BaseChat
        chatStarted={false}
        isStreaming={true}
        messages={[] as any}
        importChat={vi.fn(async () => {})}
        handleInputChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Import Chat')).toBeNull();
    expect(screen.queryByTestId('landing-container')).toBeNull();
    expect(screen.getByTestId('messages')).toBeTruthy();
  });

  it('switches to active chat as soon as a message appears regardless of chatStarted', () => {
    render(
      <BaseChat
        chatStarted={false}
        isStreaming={false}
        messages={[{ id: 'm1', role: 'user', content: 'hello' }] as any}
        importChat={vi.fn(async () => {})}
        handleInputChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Import Chat')).toBeNull();
    expect(screen.getByTestId('messages')).toBeTruthy();
  });
});
