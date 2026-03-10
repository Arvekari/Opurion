/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, useEffect, useMemo, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { Messages } from './Messages.client';
import { getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import * as Tooltip from '@radix-ui/react-tooltip';
import styles from './BaseChat.module.scss';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';
import type { ProviderInfo } from '~/types/model';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { AgentRunData, ProgressAnnotation } from '~/types/context';
import { AgentRunStatusPanel } from './AgentRunStatusPanel';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import { ChatBox } from './ChatBox';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import LlmErrorAlert from './LLMApiAlert';
import { syncServerPersistence } from '~/lib/persistence/serverPersistence.client';

const TEXTAREA_MIN_HEIGHT = 76;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  llmErrorAlert?: LlmErrorAlertType;
  clearLlmErrorAlert?: () => void;
  data?: JSONValue[] | undefined;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  append?: (message: Message) => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      chatMode,
      setChatMode,
      append,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => {
        throw new Error('addToolResult not implemented');
      },
      onWebSearchResult,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const [agentRun, setAgentRun] = useState<AgentRunData['run'] | null>(null);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);

        const agentRunUpdates = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'agentRun',
        ) as AgentRunData[];

        if (agentRunUpdates.length > 0) {
          setAgentRun(agentRunUpdates.at(-1)?.run || null);
        }
      }
    }, [data]);
    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          console.error('Error loading API keys from cookies:', error);
          Cookies.remove('apiKeys');
        }

        setIsModelLoading('all');
        fetch('/api/models')
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error('Error fetching model list:', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    const availableProviders = useMemo(() => {
      const sourceProviders = providerList || (PROVIDER_LIST as ProviderInfo[]);

      return sourceProviders.filter((candidate) => {
        const configuredKey = apiKeys[candidate.name];
        return typeof configuredKey === 'string' && configuredKey.trim().length > 0;
      });
    }, [providerList, apiKeys]);

    const availableProviderNames = useMemo(
      () => new Set(availableProviders.map((entry) => entry.name)),
      [availableProviders],
    );

    const availableModels = useMemo(
      () => modelList.filter((entry) => availableProviderNames.has(entry.provider)),
      [modelList, availableProviderNames],
    );

    useEffect(() => {
      if (!setProvider || availableProviders.length === 0) {
        return;
      }

      if (!provider || !availableProviderNames.has(provider.name)) {
        setProvider(availableProviders[0]);
      }
    }, [provider, setProvider, availableProviderNames, availableProviders]);

    useEffect(() => {
      if (!setModel || !provider) {
        return;
      }

      const providerModels = availableModels.filter((entry) => entry.provider === provider.name);

      if (providerModels.length === 0) {
        return;
      }

      const hasSelectedModel = providerModels.some((entry) => entry.name === model);

      if (!hasSelectedModel) {
        setModel(providerModels[0].name);
      }
    }, [provider, model, setModel, availableModels]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));
      void syncServerPersistence({ apiKeys: newApiKeys });

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (!provider || !model) {
        console.warn('Cannot send message before provider/model is selected');
        return;
      }

      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
          // Abort only when actively listening to avoid wiping input during normal sends.
          if (isListening) {
            recognition.abort();
            setIsListening(false);
          }

          setTranscript('');
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div className="flex flex-col lg:flex-row overflow-hidden flex-1 h-full min-w-0 bg-bolt-elements-background-depth-1">
          <div
            className={classNames(
              styles.Chat,
              'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full min-w-0',
            )}
          >
            {!chatStarted ? (
              <div className="relative flex h-full w-full flex-col justify-between overflow-hidden p-4 sm:p-6">
                <div className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

                <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6">
                  <div className="flex items-center gap-2 text-bolt-elements-textPrimary">
                    <img src="/logo.svg" alt="Bolt2.dyi" className="h-9 w-auto inline-block" />
                  </div>

                  <div className="w-full max-w-3xl rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/80 p-4 shadow-sm backdrop-blur sm:p-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-center text-bolt-elements-textPrimary">
                      What would you like to build?
                    </h1>
                    <p className="text-center text-bolt-elements-textSecondary text-sm">
                      Start a new conversation to get started
                    </p>

                    <ChatBox
                      provider={provider}
                      setProvider={setProvider}
                      providerList={availableProviders}
                      model={model}
                      setModel={setModel}
                      modelList={availableModels}
                      apiKeys={apiKeys}
                      isModelLoading={isModelLoading}
                      onApiKeysChange={onApiKeysChange}
                      uploadedFiles={uploadedFiles}
                      setUploadedFiles={setUploadedFiles}
                      imageDataList={imageDataList}
                      setImageDataList={setImageDataList}
                      textareaRef={textareaRef}
                      input={input}
                      handleInputChange={handleInputChange}
                      handlePaste={handlePaste}
                      TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
                      TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
                      isStreaming={isStreaming}
                      handleStop={handleStop}
                      handleSendMessage={handleSendMessage}
                      enhancingPrompt={enhancingPrompt}
                      enhancePrompt={enhancePrompt}
                      isListening={isListening}
                      startListening={startListening}
                      stopListening={stopListening}
                      chatStarted={chatStarted}
                      exportChat={exportChat}
                      qrModalOpen={qrModalOpen}
                      setQrModalOpen={setQrModalOpen}
                      handleFileUpload={handleFileUpload}
                      chatMode={chatMode}
                      setChatMode={setChatMode}
                      designScheme={designScheme}
                      setDesignScheme={setDesignScheme}
                      selectedElement={selectedElement}
                      setSelectedElement={setSelectedElement}
                      onWebSearchResult={onWebSearchResult}
                    />

                    <div className="pt-1">
                      {ExamplePrompts((event, messageInput) => {
                        if (isStreaming) {
                          handleStop?.();
                          return;
                        }

                        handleSendMessage(event, messageInput);
                      })}
                    </div>

                    <div className="pt-1">
                      <StarterTemplates />
                    </div>
                  </div>
                </div>

                <div className="relative z-10 w-full flex flex-col items-center gap-3 text-center">
                  {availableProviders.length > 0 && model && (
                    <div className="text-xs text-bolt-elements-textTertiary flex items-center gap-2 justify-center">
                      <span>{model.split('-')[model.split('-').length - 1]}</span>
                      <span>•</span>
                      <span>Connect your tools to {provider?.name || 'AI'}</span>
                    </div>
                  )}
                  {availableProviders.length === 0 && (
                    <div className="text-xs text-bolt-elements-textTertiary">
                      Add API keys in Settings to unlock providers and models
                    </div>
                  )}

                  <div className="flex justify-center gap-2">
                    {ImportButtons(importChat)}
                    <GitCloneButton importChat={importChat} />
                  </div>
                </div>
              </div>
            ) : (
              <StickToBottom
                className={classNames('pt-4 px-2 sm:px-6 relative flex-1 flex flex-col modern-scrollbar', {})}
                resize="smooth"
                initial="smooth"
              >
                <StickToBottom.Content className="flex flex-col gap-4 relative ">
                  <ClientOnly>
                    {() => {
                      return chatStarted ? (
                        <Messages
                          className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1"
                          messages={messages}
                          isStreaming={isStreaming}
                          append={append}
                          chatMode={chatMode}
                          setChatMode={setChatMode}
                          provider={provider}
                          model={model}
                          addToolResult={addToolResult}
                        />
                      ) : null;
                    }}
                  </ClientOnly>
                  <ScrollToBottom />
                </StickToBottom.Content>
                <div
                  className={classNames(
                    'mt-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/95 px-2 sm:px-4 py-3',
                  )}
                >
                  <div className="flex flex-col gap-2">
                    {deployAlert && (
                      <DeployChatAlert
                        alert={deployAlert}
                        clearAlert={() => clearDeployAlert?.()}
                        postMessage={(message: string | undefined) => {
                          sendMessage?.({} as any, message);
                          clearSupabaseAlert?.();
                        }}
                      />
                    )}
                    {supabaseAlert && (
                      <SupabaseChatAlert
                        alert={supabaseAlert}
                        clearAlert={() => clearSupabaseAlert?.()}
                        postMessage={(message) => {
                          sendMessage?.({} as any, message);
                          clearSupabaseAlert?.();
                        }}
                      />
                    )}
                    {actionAlert && (
                      <ChatAlert
                        alert={actionAlert}
                        clearAlert={() => clearAlert?.()}
                        postMessage={(message) => {
                          sendMessage?.({} as any, message);
                          clearAlert?.();
                        }}
                      />
                    )}
                    {llmErrorAlert && <LlmErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />}
                  </div>
                  {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
                  <AgentRunStatusPanel run={agentRun} />
                  <ChatBox
                    provider={provider}
                    setProvider={setProvider}
                    providerList={availableProviders}
                    model={model}
                    setModel={setModel}
                    modelList={availableModels}
                    apiKeys={apiKeys}
                    isModelLoading={isModelLoading}
                    onApiKeysChange={onApiKeysChange}
                    uploadedFiles={uploadedFiles}
                    setUploadedFiles={setUploadedFiles}
                    imageDataList={imageDataList}
                    setImageDataList={setImageDataList}
                    textareaRef={textareaRef}
                    input={input}
                    handleInputChange={handleInputChange}
                    handlePaste={handlePaste}
                    TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
                    TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
                    isStreaming={isStreaming}
                    handleStop={handleStop}
                    handleSendMessage={handleSendMessage}
                    enhancingPrompt={enhancingPrompt}
                    enhancePrompt={enhancePrompt}
                    isListening={isListening}
                    startListening={startListening}
                    stopListening={stopListening}
                    chatStarted={chatStarted}
                    exportChat={exportChat}
                    qrModalOpen={qrModalOpen}
                    setQrModalOpen={setQrModalOpen}
                    handleFileUpload={handleFileUpload}
                    chatMode={chatMode}
                    setChatMode={setChatMode}
                    designScheme={designScheme}
                    setDesignScheme={setDesignScheme}
                    selectedElement={selectedElement}
                    setSelectedElement={setSelectedElement}
                    onWebSearchResult={onWebSearchResult}
                  />
                </div>
              </StickToBottom>
            )}
          </div>
          {chatStarted && (
            <ClientOnly>
              {() => (
                <Workbench
                  chatStarted={chatStarted}
                  isStreaming={isStreaming}
                  setSelectedElement={setSelectedElement}
                />
              )}
            </ClientOnly>
          )}
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
        <button
          className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
