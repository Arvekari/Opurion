import React from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { classNames } from '~/utils/classNames';
import FilePreview from './FilePreview';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { SendButton } from './SendButton.client';
import { IconButton } from '~/components/ui/IconButton';
import { toast } from 'react-toastify';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import { SupabaseConnection } from './SupabaseConnection';
import { ExpoQrModal } from '~/components/workbench/ExpoQrModal';
import type { ProviderInfo } from '~/types/model';
import { ColorSchemeDialog } from '~/components/ui/ColorSchemeDialog';
import { uiStateClassTokens } from '~/components/ui/tokens';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { McpTools } from './MCPTools';
import { WebSearch } from './WebSearch.client';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

interface ChatBoxProps {
  provider: any;
  providerList: any[];
  modelList: any[];
  apiKeys: Record<string, string>;
  isModelLoading: string | undefined;
  onApiKeysChange: (providerName: string, apiKey: string) => void;
  uploadedFiles: File[];
  imageDataList: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement> | undefined;
  input: string;
  handlePaste: (e: React.ClipboardEvent) => void;
  TEXTAREA_MIN_HEIGHT: number;
  TEXTAREA_MAX_HEIGHT: number;
  isStreaming: boolean;
  handleSendMessage: (event: React.UIEvent, messageInput?: string) => void;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  chatStarted: boolean;
  exportChat?: () => void;
  qrModalOpen: boolean;
  setQrModalOpen: (open: boolean) => void;
  handleFileUpload: () => void;
  setProvider?: ((provider: ProviderInfo) => void) | undefined;
  model?: string | undefined;
  setModel?: ((model: string) => void) | undefined;
  setUploadedFiles?: ((files: File[]) => void) | undefined;
  setImageDataList?: ((dataList: string[]) => void) | undefined;
  handleInputChange?: ((event: React.ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
  handleStop?: (() => void) | undefined;
  enhancingPrompt?: boolean | undefined;
  enhancePrompt?: (() => void) | undefined;
  onWebSearchResult?: (result: string) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: ((element: ElementInfo | null) => void) | undefined;
  supabaseConnection?: SupabaseConnectionState;
  constrainToPane?: boolean;
}

export const ChatBox: React.FC<ChatBoxProps> = (props) => {
  const liveTextareaValue = props.textareaRef?.current?.value ?? '';
  const hasMessageDraft = props.input.trim().length > 0 || liveTextareaValue.trim().length > 0;
  const hasAttachments = props.uploadedFiles.length > 0;

  return (
    <div
      className={classNames(
        'relative bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor w-full mx-auto z-prompt',
        props.constrainToPane ? 'max-w-none' : 'max-w-chat',

        /*
         * {
         *   'sticky bottom-2': chatStarted,
         * },
         */
      )}
      style={{ boxSizing: 'border-box' }}
    >
      <FilePreview
        files={props.uploadedFiles}
        imageDataList={props.imageDataList}
        onRemove={(index) => {
          props.setUploadedFiles?.(props.uploadedFiles.filter((_, i) => i !== index));
          props.setImageDataList?.(props.imageDataList.filter((_, i) => i !== index));
        }}
      />
      <ClientOnly>
        {() => (
          <ScreenshotStateManager
            setUploadedFiles={props.setUploadedFiles}
            setImageDataList={props.setImageDataList}
            uploadedFiles={props.uploadedFiles}
            imageDataList={props.imageDataList}
          />
        )}
      </ClientOnly>
      {props.selectedElement && (
        <div className="flex mx-1.5 gap-2 items-center justify-between rounded-lg rounded-b-none border border-b-none border-bolt-elements-borderColor text-bolt-elements-textPrimary flex py-1 px-2.5 font-medium text-xs">
          <div className="flex gap-2 items-center lowercase">
            <code className="bg-accent-500 rounded-4px px-1.5 py-1 mr-0.5 text-white">
              {props?.selectedElement?.tagName}
            </code>
            selected for inspection
          </div>
          <button
            className="bg-transparent text-accent-500 pointer-auto"
            onClick={() => props.setSelectedElement?.(null)}
          >
            Clear
          </button>
        </div>
      )}
      <div
        className={classNames('relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg')}
      >
        <textarea
          ref={props.textareaRef}
          className={classNames(
            'w-full pl-4 pt-4 pr-28 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm',
            'transition-all duration-200',
            'hover:border-bolt-elements-focus',
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid #1488fc';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid #1488fc';
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';

            const files = Array.from(e.dataTransfer.files);
            files.forEach((file) => {
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = (e) => {
                  const base64Image = e.target?.result as string;
                  props.setUploadedFiles?.([...props.uploadedFiles, file]);
                  props.setImageDataList?.([...props.imageDataList, base64Image]);
                };
                reader.readAsDataURL(file);
              }
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              if (event.shiftKey) {
                return;
              }

              event.preventDefault();

              if (props.isStreaming) {
                props.handleStop?.();
                return;
              }

              // ignore if using input method engine
              if (event.nativeEvent.isComposing) {
                return;
              }

              const currentValue = (event.currentTarget as HTMLTextAreaElement).value;
              props.handleSendMessage?.(event, currentValue);
            }
          }}
          value={props.input}
          onChange={(event) => {
            props.handleInputChange?.(event);
          }}
          onPaste={props.handlePaste}
          style={{
            minHeight: props.TEXTAREA_MIN_HEIGHT,
            maxHeight: props.TEXTAREA_MAX_HEIGHT,
          }}
          placeholder={props.chatMode === 'build' ? 'How can Bolt help you today?' : 'What would you like to discuss?'}
          translate="no"
        />
        <ClientOnly>
          {() => (
            <div
              style={{
                position: 'absolute',
                right: '10px',
                bottom: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '6px',
                zIndex: 2,
              }}
            >
              {Boolean(
                props.supabaseConnection?.enabled &&
                props.supabaseConnection?.token?.trim() &&
                  props.supabaseConnection?.credentials?.anonKey?.trim() &&
                  props.supabaseConnection?.credentials?.supabaseUrl?.trim(),
              ) && (
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'var(--bolt-elements-background-depth-1)',
                    border: '1px solid var(--bolt-elements-borderColor)',
                    color: 'var(--bolt-elements-textSecondary)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                  title={`Supabase connected${props.supabaseConnection?.project ? ': ' + props.supabaseConnection.project.name : ''}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M13.776 0.39a.5.5 0 0 0-.552 0L1.224 8.39A.5.5 0 0 0 1.5 9.25h8.75v14a.5.5 0 0 0 .948.224l12-18a.5.5 0 0 0-.448-.724H13.776z" fill="#3ECF8E"/>
                  </svg>
                </button>
              )}
              <SendButton
                show={true}
                isStreaming={props.isStreaming}
                disabled={Boolean(
                  !props.isStreaming &&
                    (!hasMessageDraft && !hasAttachments),
                )}
                onClick={(event) => {
                  if (props.isStreaming) {
                    props.handleStop?.();
                    return;
                  }

                  const currentValue = props.textareaRef?.current?.value ?? props.input;

                  if (currentValue.trim().length > 0 || hasAttachments) {
                    props.handleSendMessage?.(event, currentValue);
                  }
                }}
              />
            </div>
          )}
        </ClientOnly>
        <div className="flex justify-between items-center text-sm p-4 pt-2">
          <div className="flex gap-1 items-center">
            <ColorSchemeDialog designScheme={props.designScheme} setDesignScheme={props.setDesignScheme} />
            <McpTools />
            <IconButton title="Upload file" className="transition-all" onClick={() => props.handleFileUpload()}>
              <div className="i-ph:paperclip text-xl"></div>
            </IconButton>
            <WebSearch onSearchResult={(result) => props.onWebSearchResult?.(result)} disabled={props.isStreaming} />
            <IconButton
              title="Enhance prompt"
              disabled={props.input.length === 0 || props.enhancingPrompt}
              className={classNames('transition-all', props.enhancingPrompt ? 'opacity-100' : '')}
              onClick={() => {
                props.enhancePrompt?.();
                toast.success('Prompt enhanced!');
              }}
            >
              {props.enhancingPrompt ? (
                <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
              ) : (
                <div className="i-bolt:stars text-xl"></div>
              )}
            </IconButton>

            <SpeechRecognitionButton
              isListening={props.isListening}
              onStart={props.startListening}
              onStop={props.stopListening}
              disabled={props.isStreaming}
            />
            <IconButton
              title={props.chatMode === 'discuss' ? 'Switch to Build mode' : 'Switch to Discuss mode'}
              className={classNames(
                'transition-all flex items-center gap-1 px-1.5',
                props.chatMode === 'discuss' ? uiStateClassTokens.toggleActive : uiStateClassTokens.toggleInactive,
              )}
              onClick={() => {
                props.setChatMode?.(props.chatMode === 'discuss' ? 'build' : 'discuss');
              }}
            >
              <div className={`i-ph:chats text-xl`} />
              <span>{props.chatMode === 'discuss' ? 'Discuss' : 'Build'}</span>
            </IconButton>
          </div>
          {props.input.length > 3 ? (
            <div className="text-xs text-bolt-elements-textTertiary pr-12">
              Use <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Shift</kbd> +{' '}
              <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Return</kbd> a new line
            </div>
          ) : null}
          {props.supabaseConnection?.enabled ? <SupabaseConnection /> : null}
          <ExpoQrModal open={props.qrModalOpen} onClose={() => props.setQrModalOpen(false)} />
        </div>
      </div>
    </div>
  );
};
