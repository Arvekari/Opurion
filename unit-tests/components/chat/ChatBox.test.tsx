/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatBox } from '../../../app/components/chat/ChatBox';

const setShowWorkbenchMock = vi.fn();
let showWorkbenchValue = false;

vi.mock('@nanostores/react', () => ({
  useStore: (store: any) => (store && typeof store.get === 'function' ? store.get() : store),
}));

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: any) => (typeof children === 'function' ? children() : children ?? null),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: {
      get: () => showWorkbenchValue,
      subscribe: () => () => {},
      listen: () => () => {},
    },
    setShowWorkbench: (...args: any[]) => setShowWorkbenchMock(...args),
  },
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
  SendButton: () => <button aria-label="send" type="button" />,
}));

vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ children, onClick, title }: { children?: React.ReactNode; onClick?: () => void; title?: string }) => (
    <button type="button" title={title} onClick={onClick}>
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
    chatStarted: true,
    chatMode: 'build' as const,
    qrModalOpen: false,
    setQrModalOpen: vi.fn(),
    handleFileUpload: vi.fn(),
    setUploadedFiles: vi.fn(),
    setImageDataList: vi.fn(),
    handleInputChange: vi.fn(),
    setChatMode: vi.fn(),
    ...overrides,
  };
}

describe('app/components/chat/ChatBox.tsx', () => {
  it('shows mode toggle and does not render Workbench toggle in chat box', () => {
    showWorkbenchValue = false;

    render(<ChatBox {...buildBaseProps()} />);

    expect(screen.queryByTitle('Show Workbench')).toBeNull();
    expect(screen.getByTitle('Switch to Discuss mode')).toBeTruthy();
  });
});
