/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, useEffect, useMemo, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST, providerBaseUrlEnvKeys } from '~/utils/constants';
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
import { availableProvidersStore, availableModelsStore } from '~/lib/stores/model';
import { supabaseConnection } from '~/lib/stores/supabase';
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';

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
    const supabaseConn = useStore(supabaseConnection);
    const showWorkbench = useStore(workbenchStore.showWorkbench);
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
        const providerTokenKey = providerBaseUrlEnvKeys[candidate.name]?.apiTokenKey;

        if (!providerTokenKey) {
          // Local/self-hosted providers (e.g. Ollama/LMStudio) can be valid without API keys.
          return true;
        }

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

    // Push into shared stores so Header selects can read them
    useEffect(() => {
      availableProvidersStore.set(availableProviders);
    }, [availableProviders]);

    useEffect(() => {
      availableModelsStore.set(availableModels);
    }, [availableModels]);

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
        toast.warning('Select a provider and model before sending.');
        return;
      }

      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
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

    const hasMessages = (messages?.length ?? 0) > 0;
    // Show landing whenever there's nothing to display yet (no messages and not streaming).
    // This is intentionally independent of chatStarted so the first send immediately
    // transitions to the active-chat view without waiting for runAnimation to settle.
    const showLanding = !hasMessages && !isStreaming;

    const chatBoxProps = {
      provider,
      setProvider,
      providerList: availableProviders,
      model,
      setModel,
      modelList: availableModels,
      apiKeys,
      isModelLoading,
      onApiKeysChange,
      uploadedFiles,
      setUploadedFiles,
      imageDataList,
      setImageDataList,
      textareaRef,
      input,
      handleInputChange,
      handlePaste,
      TEXTAREA_MIN_HEIGHT,
      TEXTAREA_MAX_HEIGHT,
      isStreaming,
      handleStop,
      handleSendMessage,
      enhancingPrompt,
      enhancePrompt,
      isListening,
      startListening,
      stopListening,
      chatStarted,
      exportChat,
      qrModalOpen,
      setQrModalOpen,
      handleFileUpload,
      chatMode,
      setChatMode,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      onWebSearchResult,
      supabaseConnection: supabaseConn,
      constrainToPane: showWorkbench,
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <div className="flex flex-col lg:flex-row overflow-hidden flex-1 h-full min-w-0 bg-bolt-elements-background-depth-1">
          <div
            className={classNames(
              styles.Chat,
              'flex flex-col flex-grow h-full min-w-0',
            )}
            data-testid="workbench-r1-chat-pane"
            style={
              showWorkbench
                ? {
                    flex: '0 0 calc(100% - var(--workbench-width))',
                    width: 'calc(100% - var(--workbench-width))',
                    minWidth: 'max(500px, 20%)',
                    maxWidth: 'calc(100% - var(--workbench-width))',
                    ['--chat-max-width' as any]: '100%',
                    ['--chat-min-width' as any]: '0px',
                  }
                : undefined
            }
          >
            {showLanding ? (
              /* ── Landing: centered chatbox (reference .main > .chatbox) ── */
              <div
                data-testid="landing-container"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: showWorkbench ? 'flex-end' : 'center',
                  flex: 1,
                  minHeight: 0,
                  width: '100%',
                  padding: showWorkbench ? '12px' : '30px',
                  gap: showWorkbench ? '10px' : '20px',
                  position: 'relative',
                  boxSizing: 'border-box',
                }}
              >
              <div
                  style={{
                    width: showWorkbench ? '100%' : '650px',
                    maxWidth: showWorkbench ? '100%' : '96%',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '0',
                    padding: showWorkbench ? '0' : '0 6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      marginBottom: '8px',
                      paddingLeft: '0',
                    }}
                  >
                    <img src="/logo.svg" alt="Bolt2.dyi" style={{ height: '40px', width: 'auto' }} />
                  </div>

                  <ChatBox {...chatBoxProps} />
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: showWorkbench ? '100%' : 'auto',
                    flexWrap: showWorkbench ? 'nowrap' : 'wrap',
                  }}
                >
                  {ImportButtons(importChat, { compact: showWorkbench })}
                  <GitCloneButton
                    importChat={importChat}
                    className={showWorkbench ? 'h-10 px-2 py-2 min-w-0 text-sm' : undefined}
                  />
                </div>
              </div>
            ) : (
              /* ── Active chat: messages + chatbox ── */
              <StickToBottom
                className={classNames('pt-4 px-2 sm:px-6 relative flex-1 flex flex-col modern-scrollbar', {})}
                resize="smooth"
                initial="smooth"
              >
                <StickToBottom.Content className="flex flex-col gap-4 relative">
                  <ClientOnly>
                    {() =>
                      // showLanding is false here, meaning hasMessages || isStreaming is true.
                      // Render Messages unconditionally so streaming is visible from the first chunk.
                      (hasMessages || isStreaming) ? (
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
                      ) : null
                    }
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
                  <ChatBox {...chatBoxProps} />
                </div>
              </StickToBottom>
            )}
          </div>

          {showWorkbench && (
            <ClientOnly>
              {() => (
                <div data-testid="workbench-r2-pane" className="h-full min-w-0">
                  <Workbench
                    chatStarted={chatStarted}
                  isStreaming={isStreaming}
                  setSelectedElement={setSelectedElement}
                  />
                </div>
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
