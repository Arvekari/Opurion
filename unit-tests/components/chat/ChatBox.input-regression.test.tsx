/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ChatBox } from '../../../app/components/chat/ChatBox';

vi.mock('@nanostores/react', () => ({
  useStore: (store: any) => (store && typeof store.get === 'function' ? store.get() : store),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: { get: () => false, subscribe: () => () => {} },
    setShowWorkbench: vi.fn(),
  },
}));

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: any) => (typeof children === 'function' ? children() : children ?? null),
}));

vi.mock('~/components/chat/ModelSelector', () => ({
  ModelSelector: () => null,
}));

vi.mock('~/lib/stores/settings', () => ({
  LOCAL_PROVIDERS: [],
}));

vi.mock('~/components/chat/MCPTools', () => ({
  McpTools: () => null,
}));

vi.mock('~/components/chat/WebSearch.client', () => ({
  WebSearch: () => null,
}));

vi.mock('~/components/chat/APIKeyManager', () => ({
  APIKeyManager: () => null,
}));

vi.mock('~/components/chat/FilePreview', () => ({
  default: () => null,
}));

vi.mock('~/components/chat/ScreenshotStateManager', () => ({
  ScreenshotStateManager: () => null,
}));

vi.mock('~/components/chat/SendButton.client', () => ({
  SendButton: ({ onClick }: { onClick?: (event: React.UIEvent) => void }) => (
    <button aria-label="send" onClick={(event) => onClick?.(event as any)} type="button" />
  ),
}));

vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('~/components/chat/SpeechRecognition', () => ({
  SpeechRecognitionButton: () => null,
}));

vi.mock('~/components/chat/SupabaseConnection', () => ({
  SupabaseConnection: () => null,
}));

vi.mock('~/components/workbench/ExpoQrModal', () => ({
  ExpoQrModal: () => null,
}));

vi.mock('~/components/ui/ColorSchemeDialog', () => ({
  ColorSchemeDialog: () => null,
}));

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
  },
}));

function buildBaseProps(overrides: Record<string, unknown> = {}) {
  return {
    isModelSettingsCollapsed: true,
    setIsModelSettingsCollapsed: vi.fn(),
    provider: { name: 'OpenAI' },
    providerList: [],
    modelList: [],
    apiKeys: {},
    isModelLoading: undefined,
    onApiKeysChange: vi.fn(),
    uploadedFiles: [],
    imageDataList: [],
    textareaRef: { current: null },
    input: '',
    handlePaste: vi.fn(),
    TEXTAREA_MIN_HEIGHT: 80,
    TEXTAREA_MAX_HEIGHT: 260,
    isStreaming: false,
    handleSendMessage: vi.fn(),
    isListening: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    chatStarted: false,
    chatMode: 'build' as const,
    qrModalOpen: false,
    setQrModalOpen: vi.fn(),
    handleFileUpload: vi.fn(),
    setUploadedFiles: vi.fn(),
    setImageDataList: vi.fn(),
    ...overrides,
  };
}

describe('chat input regression guard', () => {
  it('keeps textarea editable by reflecting typed value through controlled input state', () => {
    function Wrapper() {
      const [input, setInput] = useState('');

      return (
        <ChatBox
          {...buildBaseProps({
            input,
            handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value),
          })}
        />
      );
    }

    render(<Wrapper />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'create a settings dashboard' } });

    expect(textarea.value).toBe('create a settings dashboard');
  });

  it('sends on Enter when not streaming and not composing', () => {
    const handleSendMessage = vi.fn();

    function Wrapper() {
      const [input, setInput] = useState('hello');

      return (
        <ChatBox
          {...buildBaseProps({
            input,
            handleSendMessage,
            handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value),
          })}
        />
      );
    }

    render(<Wrapper />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'hello from enter' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(handleSendMessage).toHaveBeenCalledTimes(1);
    expect(handleSendMessage).toHaveBeenCalledWith(expect.anything(), 'hello from enter');
  });

  it('sends the live textarea value on click even when prop input is stale', () => {
    const handleSendMessage = vi.fn();
    const textareaRef = { current: null as HTMLTextAreaElement | null };

    render(
      <ChatBox
        {...buildBaseProps({
          input: '',
          textareaRef,
          handleSendMessage,
        })}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.value = 'typed directly in textarea';

    fireEvent.click(screen.getByLabelText('send'));

    expect(handleSendMessage).toHaveBeenCalledTimes(1);
    expect(handleSendMessage).toHaveBeenCalledWith(expect.anything(), 'typed directly in textarea');
  });

  it('supports mid-text insertion without losing edit flow', () => {
    function Wrapper() {
      const [input, setInput] = useState('hello world');

      return (
        <ChatBox
          {...buildBaseProps({
            input,
            handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value),
          })}
        />
      );
    }

    render(<Wrapper />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(5, 5);
    textarea.setRangeText('-', 5, 5, 'end');
    fireEvent.change(textarea, { target: { value: textarea.value } });

    expect(textarea.value).toBe('hello- world');
  });

  it('keeps send flow safe for Shift+Enter and streaming Enter', () => {
    const handleSendMessage = vi.fn();
    const handleStop = vi.fn();

    const { rerender } = render(
      <ChatBox
        {...buildBaseProps({
          input: 'line one',
          handleSendMessage,
          handleStop,
          isStreaming: false,
        })}
      />,
    );

    const textarea = screen.getByRole('textbox');

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(handleSendMessage).toHaveBeenCalledTimes(0);
    expect(handleStop).toHaveBeenCalledTimes(0);

    rerender(
      <ChatBox
        {...buildBaseProps({
          input: 'line one',
          handleSendMessage,
          handleStop,
          isStreaming: true,
        })}
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' });
    expect(handleSendMessage).toHaveBeenCalledTimes(1);
    expect(handleStop).toHaveBeenCalledTimes(0);
  });

  it('stops streaming when text is empty even if attachments exist', () => {
    const handleSendMessage = vi.fn();
    const handleStop = vi.fn();

    const uploadedImage = new File(['content'], 'image.png', { type: 'image/png' });

    render(
      <ChatBox
        {...buildBaseProps({
          input: '',
          isStreaming: true,
          uploadedFiles: [uploadedImage],
          imageDataList: ['data:image/png;base64,abc'],
          handleSendMessage,
          handleStop,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('send'));

    expect(handleStop).toHaveBeenCalledTimes(1);
    expect(handleSendMessage).toHaveBeenCalledTimes(0);
  });
});
