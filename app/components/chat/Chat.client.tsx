import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BoltChatTransport } from '~/lib/chat/boltChatTransport';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import {
  selectedModelStore,
  selectedProviderStore,
  setSelectedModel,
  setSelectedProvider,
} from '~/lib/stores/model';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import { useMCPStore } from '~/lib/stores/mcp';
import type { LlmErrorAlertType } from '~/types/actions';
import { collabStore } from '~/lib/stores/collab';
import {
  getStreamingStallTimeoutMs,
  isStreamingStalled,
  resolveEffectiveStreamingState,
} from './streamingGuard';
import { buildRuntimeDiagnosticsPrefix } from './runtime-diagnostics';

const logger = createScopedLogger('Chat');

const shouldRetryTransientSendError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

  return (
    error instanceof TypeError ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed')
  );
};

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    chatMode: 'discuss' | 'build';
    parseMessages: (messages: Message[], isLoading: boolean, chatMode: 'discuss' | 'build') => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, chatMode, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading, chatMode);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const initialPrompt = Cookies.get(PROMPT_COOKIE_KEY) || '';
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [attachmentLibrary, setAttachmentLibrary] = useState<Array<{ id: string; file: File; dataUrl: string }>>([]);

    const addToAttachmentLibrary = (files: File[], dataUrls: string[]) => {
      if (files.length === 0) {
        return;
      }

      const entries = files.map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        dataUrl: dataUrls[i] ?? '',
      }));

      setAttachmentLibrary((prev) => {
        // De-dupe by file name + size so re-attaching the same file doesn't create duplicates
        const existingKeys = new Set(prev.map((e) => `${e.file.name}:${e.file.size}`));
        const fresh = entries.filter((e) => !existingKeys.has(`${e.file.name}:${e.file.size}`));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    };
    const [draftInput, setDraftInput] = useState(initialPrompt);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled, ollamaBridgedSystemPromptSplit } =
      useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const model = useStore(selectedModelStore);
    const provider = useStore(selectedProviderStore);
    const setModel = (m: string) => setSelectedModel(m);
    const setProvider = (p: ProviderInfo) => setSelectedProvider(p);
    const { showChat } = useStore(chatStore);
    const [animationScope, animate] = useAnimate();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const [isStalledStream, setIsStalledStream] = useState(false);
    const streamStartedAtRef = useRef<number | null>(null);
    const lastChunkReceivedAtRef = useRef<number | null>(null);
    const mcpSettings = useMCPStore((state) => state.settings);
    const collab = useStore(collabStore);

    // Keep a ref with the current dynamic body values so the stable transport always
    // reads the most recent state without needing to be recreated.
    const chatBodyRef = useRef<Record<string, unknown>>({});
    chatBodyRef.current = {
      files,
      promptId,
      contextOptimization: contextOptimizationEnabled,
      chatMode,
      ollamaBridgedSystemPromptSplit,
      selectedProviderName: provider.name,
      selectedModelName: model,
      designScheme,
      supabase: {
        isConnected: supabaseConn.isConnected,
        hasSelectedProject: !!selectedProject,
        credentials: {
          supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
          anonKey: supabaseConn?.credentials?.anonKey,
        },
      },
      maxLLMSteps: mcpSettings.maxLLMSteps,
    };

    const streamStallTimeoutMs = getStreamingStallTimeoutMs(provider.name);

    // Create transport once; it reads chatBodyRef.current on every request.
    const chatTransportRef = useRef<BoltChatTransport | null>(null);

    if (!chatTransportRef.current) {
      chatTransportRef.current = new BoltChatTransport('/api/chat', () => chatBodyRef.current);
    }

    const {
      messages,
      status,
      stop,
      sendMessage: chatSendMessage,
      setMessages,
      error,
      addToolOutput,
    } = (useChat as any)({
      transport: chatTransportRef.current,
      messages: initialMessages,
      onError: (e: unknown) => {
        setFakeLoading(false);
        handleError(e, 'chat');
      },
      onFinish: (eventOrMessage: any) => {
        // v3 passes { message, ... }; guard for both shapes
        const message = eventOrMessage?.message ?? eventOrMessage;
        const msgContent: string =
          typeof message?.content === 'string'
            ? message.content
            : (message?.parts ?? [])
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text ?? '')
                .join('');
        const usage = eventOrMessage?.usage ?? eventOrMessage?.response?.usage;

        setFakeLoading(false);
        console.log('✅ onFinish called - response received!', { content: msgContent.substring(0, 100), usage });

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: msgContent.length,
          });
        }

        logger.debug('Finished streaming');

        if (collab.selectedConversationId && msgContent) {
          void fetch('/api/collab/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              intent: 'addMessage',
              conversationId: collab.selectedConversationId,
              role: 'assistant',
              content: msgContent,
              branchMode: collab.branchMode,
            }),
          });
        }
      },
    });

    // v3 useChat no longer returns isLoading — derive from status
    const isLoading = status === 'streaming' || status === 'submitted';

    // Compatibility shim: expose append() so BaseChat action buttons keep working
    const append = useCallback(
      (message: any) => {
        if (typeof chatSendMessage !== 'function') {
          return Promise.reject(new TypeError('sendMessage not available'));
        }

        const text =
          typeof message.content === 'string'
            ? message.content
            : (message.parts ?? [])
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text ?? '')
                .join('');

        return chatSendMessage({ text });
      },
      [chatSendMessage],
    );
    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        void sendViaChatApi(
          {
            role: 'user',
            content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
          },
          undefined,
        );
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      if (collab.selectedConversationId) {
        parseMessages(messages, isLoading, chatMode);
        return;
      }

      // Track when chunks arrive during streaming
      if (isLoading || fakeLoading) {
        lastChunkReceivedAtRef.current = Date.now();
      }

      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
          chatMode,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages, collab.selectedConversationId]);

    useEffect(() => {
      if (!collab.selectedConversationId) {
        return;
      }

      const loadSharedMessages = async () => {
        const params = new URLSearchParams({
          conversationId: collab.selectedConversationId!,
          limit: '500',
          branchMode: collab.branchMode,
        });

        const response = await fetch(`/api/collab/conversations?${params.toString()}`);
        const data = (await response.json()) as any;

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Failed to load shared conversation');
        }

        const sharedMessages = (data.messages || []).map((message: any) => ({
          id: `collab-${message.id}-${message.createdAt}`,
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
          parts: [{ type: 'text', text: message.content }],
        })) as Message[];

        setMessages(sharedMessages);
        setChatStarted(sharedMessages.length > 0);
        chatStore.setKey('started', sharedMessages.length > 0);
      };

      loadSharedMessages().catch((error) => {
        console.error(error);
        toast.error('Failed to load shared conversation messages');
      });
    }, [collab.selectedConversationId, collab.branchMode, collab.refreshToken]);

    useEffect(() => {
      const currentlyStreaming = isLoading || fakeLoading;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;

      if (!currentlyStreaming) {
        streamStartedAtRef.current = null;
        lastChunkReceivedAtRef.current = null;

        if (isStalledStream) {
          setIsStalledStream(false);
        }
      } else {
        if (!streamStartedAtRef.current) {
          streamStartedAtRef.current = Date.now();
          lastChunkReceivedAtRef.current = Date.now();
        }

        stallTimer = setTimeout(() => {
          if (
            isStreamingStalled(
              streamStartedAtRef.current,
              lastChunkReceivedAtRef.current,
              Date.now(),
              streamStallTimeoutMs,
            )
          ) {
            logger.warn('Detected stalled chat streaming state; auto-aborting stream guard path triggered');
            stop();
            setFakeLoading(false);
            setIsStalledStream(true);
            chatStore.setKey('aborted', true);
            setLlmErrorAlert({
              type: 'error',
              title: 'Response Timed Out',
              description:
                'The model response stalled for too long. Streaming was auto-stopped so you can type and send again.',
              provider: provider.name,
              errorType: 'network',
            });
            toast.error('Response timed out and was stopped. You can type and resend now.');
          }
        }, streamStallTimeoutMs);
      }

      return () => {
        if (stallTimer) {
          clearTimeout(stallTimer);
        }
      };
    }, [isLoading, fakeLoading, isStalledStream, provider.name, stop, streamStallTimeoutMs]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        logger.error(`${context} request failed`, error);

        stop();
        setFakeLoading(false);

        let errorInfo = {
          message: 'An unexpected error occurred',
          isRetryable: true,
          statusCode: 500,
          provider: provider.name,
          type: 'unknown' as const,
          retryDelay: 0,
        };

        if (error.message) {
          try {
            const parsed = JSON.parse(error.message);

            if (parsed.error || parsed.message) {
              errorInfo = { ...errorInfo, ...parsed };
            } else {
              errorInfo.message = error.message;
            }
          } catch {
            errorInfo.message = error.message;
          }
        }

        let errorType: LlmErrorAlertType['errorType'] = 'unknown';
        let title = 'Request Failed';

        if (errorInfo.statusCode === 401 || errorInfo.message.toLowerCase().includes('api key')) {
          errorType = 'authentication';
          title = 'Authentication Error';
        } else if (errorInfo.statusCode === 429 || errorInfo.message.toLowerCase().includes('rate limit')) {
          errorType = 'rate_limit';
          title = 'Rate Limit Exceeded';
        } else if (errorInfo.message.toLowerCase().includes('quota')) {
          errorType = 'quota';
          title = 'Quota Exceeded';
        } else if (errorInfo.statusCode >= 500) {
          errorType = 'network';
          title = 'Server Error';
        }

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: errorInfo.message,
          context,
          retryable: errorInfo.isRetryable,
          errorType,
          provider: provider.name,
        });

        setLlmErrorAlert({
          type: 'error',
          title,
          description: errorInfo.message,
          provider: provider.name,
          errorType,
        });
      },
      [provider.name, stop],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [draftInput, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      const parts: Array<TextUIPart | FileUIPart> = [
        {
          type: 'text',
          text,
        },
      ];

      images.forEach((imageData) => {
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
      if (files.length === 0) {
        return undefined;
      }

      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment>((resolve) => {
              const reader = new FileReader();

              reader.onloadend = () => {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result as string,
                });
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      return attachments;
    };

    const sendViaChatApi = async (
      userMessage: {
        role: 'user';
        content: string;
        parts?: Array<TextUIPart | FileUIPart>;
      },
      _attachmentOptions?: { experimental_attachments?: Attachment[] | undefined },
    ) => {
      if (typeof chatSendMessage !== 'function') {
        throw new TypeError('Chat SDK sendMessage is not available');
      }

      try {
        return await chatSendMessage({ text: userMessage.content });
      } catch (error) {
        if (!shouldRetryTransientSendError(error)) {
          throw error;
        }

        logStore.logSystem('Transient send error detected, retrying once', {
          component: 'Chat',
          action: 'sendMessage:retry-once',
          provider: provider.name,
          model,
          error: error instanceof Error ? error.message : String(error),
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
        return chatSendMessage({ text: userMessage.content });
      }
    };

    const buildCollabContextPrefix = useCallback(() => {
      if (!collab.selectedProjectId) {
        return '';
      }

      const narratives = collab.projectNarratives?.trim() || '';
      const materials = collab.projectMaterials?.trim() || '';
      const guides = collab.projectGuides?.trim() || '';
      const files = collab.projectFiles || [];
      const discussionIndex = collab.discussionIndex || [];

      if (!narratives && !materials && !guides && discussionIndex.length === 0 && files.length === 0) {
        return '';
      }

      const discussionLines = discussionIndex
        .map((discussion, index) => `- Discussion ${index + 1}: ${discussion.title}${discussion.id === collab.selectedConversationId ? ' (active)' : ''}`)
        .join('\n');

      const fileLines = files
        .slice(0, 5)
        .map((file) => {
          const snippet = file.content.trim().slice(0, 800);
          return `- ${file.name}${file.mimeType ? ` (${file.mimeType})` : ''}\n${snippet}`;
        })
        .join('\n\n');

      return [
        '[Project Shared Context]',
        narratives ? `Narratives:\n${narratives}` : '',
        materials ? `Materials:\n${materials}` : '',
        guides ? `Guides:\n${guides}` : '',
        fileLines ? `Attached Reference Files:\n${fileLines}` : '',
        discussionLines ? `Discussion Index:\n${discussionLines}` : '',
        'Use this shared context across discussions and resolve references like "discussion 1" or "discussion 2" by the index above.',
      ]
        .filter(Boolean)
        .join('\n\n');
    }, [
      collab.selectedProjectId,
      collab.projectNarratives,
      collab.projectMaterials,
      collab.projectGuides,
      collab.projectFiles,
      collab.discussionIndex,
      collab.selectedConversationId,
    ]);

    const withCollabContext = useCallback(
      (messageBody: string) => {
        const prefix = buildCollabContextPrefix();

        if (!prefix) {
          return messageBody;
        }

        return `${prefix}\n\n${messageBody}`;
      },
      [buildCollabContextPrefix],
    );

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || draftInput;
      const hasAttachments = uploadedFiles.length > 0 || imageDataList.length > 0;

      logStore.logUserAction('Send requested', {
        component: 'Chat',
        action: 'sendMessage:init',
        provider: provider.name,
        model,
        chatStarted,
        hasAttachments,
        messageLength: messageContent?.length ?? 0,
      });

      if (!messageContent?.trim() && !hasAttachments) {
        return;
      }

      if (isLoading) {
        // Recovery path: if UI is stuck in loading state with no visible messages,
        // clear loading and continue with the new send instead of hard-aborting.
        if (messages.length === 0 || fakeLoading) {
          logStore.logSystem('Recovered from stuck loading state before send', {
            component: 'Chat',
            action: 'sendMessage:recover-stuck-loading',
            isLoading,
            fakeLoading,
            isStalledStream,
            messagesLength: messages.length,
          });
          stop();
          setFakeLoading(false);
          setIsStalledStream(false);
        } else if (isStalledStream) {
          stop();
        } else {
          abort();
          return;
        }
      }

      if (isStalledStream) {
        setIsStalledStream(false);
      }

      let finalMessageContent = messageContent;

      if (selectedElement) {
        console.log('Selected Element:', selectedElement);

        const elementInfo = `<div class=\"__boltSelectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      const runtimeDiagnosticsPrefix = buildRuntimeDiagnosticsPrefix(finalMessageContent, actionAlert);

      if (runtimeDiagnosticsPrefix) {
        finalMessageContent = `${runtimeDiagnosticsPrefix}\n\n${finalMessageContent}`;
      }

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);
        setChatStarted(true);
        chatStore.setKey('started', true);

        const contextualContent = withCollabContext(finalMessageContent);
        const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${contextualContent}`;
        const capturedImageDataList = [...imageDataList];
        const capturedUploadedFiles = [...uploadedFiles];

        addToAttachmentLibrary(capturedUploadedFiles, capturedImageDataList);

        setDraftInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);
        setUploadedFiles([]);
        setImageDataList([]);
        resetEnhancer();
        textareaRef.current?.blur();

        const attachmentOptions =
          capturedUploadedFiles.length > 0
            ? { experimental_attachments: await filesToAttachments(capturedUploadedFiles) }
            : undefined;

        try {
          logStore.logProvider('Submitting first message to /api/chat', {
            component: 'Chat',
            action: 'sendMessage:first-append',
            provider: provider.name,
            model,
            hasAttachments: !!attachmentOptions,
          });

          await Promise.resolve(
            sendViaChatApi(
              {
                role: 'user',
                content: userMessageText,
                parts: createMessageParts(userMessageText, capturedImageDataList),
              },
              attachmentOptions,
            ),
          );
        } catch (appendError) {
          logger.error('First message append failed', appendError);
          logStore.logError('First message append failed', appendError, {
            component: 'Chat',
            action: 'sendMessage:first-append',
            provider: provider.name,
            model,
          });
          handleError(appendError, 'chat');
          setFakeLoading(false);
          return;
        }

        if (collab.selectedConversationId) {
          void fetch('/api/collab/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              intent: 'addMessage',
              conversationId: collab.selectedConversationId,
              role: 'user',
              content: userMessageText,
              branchMode: collab.branchMode,
            }),
          });
        }

        setFakeLoading(false);
        return;
      }

      if (error != null) {
        setMessages((currentMessages: Message[]) => {
          if (currentMessages.length === 0) {
            return currentMessages;
          }

          const lastMessage = currentMessages[currentMessages.length - 1];

          if (lastMessage?.role === 'assistant') {
            return currentMessages.slice(0, -1);
          }

          return currentMessages;
        });
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const contextualContent = withCollabContext(`${userUpdateArtifact}${finalMessageContent}`);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${contextualContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        try {
          await Promise.resolve(
            sendViaChatApi(
              {
                role: 'user',
                content: messageText,
                parts: createMessageParts(messageText, imageDataList),
              },
              attachmentOptions,
            ),
          );
        } catch (appendError) {
          logger.error('Message append failed (modified files path)', appendError);
          logStore.logError('Message append failed (modified files path)', appendError, {
            component: 'Chat',
            action: 'sendMessage:append-modified-files',
            provider: provider.name,
            model,
          });
          handleError(appendError, 'chat');
          return;
        }

        logStore.logProvider('Submitting message update to /api/chat', {
          component: 'Chat',
          action: 'sendMessage:append-modified-files',
          provider: provider.name,
          model,
          hasAttachments: !!attachmentOptions,
        });

        if (collab.selectedConversationId) {
          void fetch('/api/collab/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              intent: 'addMessage',
              conversationId: collab.selectedConversationId,
              role: 'user',
              content: messageText,
              branchMode: collab.branchMode,
            }),
          });
        }

        workbenchStore.resetAllFileModifications();
      } else {
        const contextualContent = withCollabContext(finalMessageContent);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${contextualContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        console.log('🚀 Sending message via chat API:', {
          content: messageText.substring(0, 100),
          hasAttachments: !!attachmentOptions,
        });

        try {
          await Promise.resolve(
            sendViaChatApi(
              {
                role: 'user',
                content: messageText,
                parts: createMessageParts(messageText, imageDataList),
              },
              attachmentOptions,
            ),
          );
        } catch (appendError) {
          logger.error('Message append failed', appendError);
          logStore.logError('Message append failed', appendError, {
            component: 'Chat',
            action: 'sendMessage:append',
            provider: provider.name,
            model,
          });
          handleError(appendError, 'chat');
          return;
        }

        logStore.logProvider('Submitting message to /api/chat', {
          component: 'Chat',
          action: 'sendMessage:append',
          provider: provider.name,
          model,
          hasAttachments: !!attachmentOptions,
        });

        console.log('✅ Append called, messages state should update soon');

        if (collab.selectedConversationId) {
          void fetch('/api/collab/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              intent: 'addMessage',
              conversationId: collab.selectedConversationId,
              role: 'user',
              content: messageText,
              branchMode: collab.branchMode,
            }),
          });
        }
      }

      setDraftInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      addToAttachmentLibrary([...uploadedFiles], [...imageDataList]);
      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setDraftInput(nextValue);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((value: string) => {
        const trimmedValue = value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    useEffect(() => {
      if (typeof window === 'undefined') {
        return undefined;
      }

      const onSelectionChanged = (event: Event) => {
        const detail = (event as CustomEvent<{ providerName?: string; model?: string }>).detail;

        if (!detail) {
          return;
        }

        if (detail.providerName) {
          const matchedProvider = PROVIDER_LIST.find((entry) => entry.name === detail.providerName) as
            | ProviderInfo
            | undefined;

          if (matchedProvider) {
            setProvider(matchedProvider);
          }
        }

        if (detail.model) {
          setModel(detail.model);
        }
      };

      window.addEventListener('bolt:model-selection-changed', onSelectionChanged);

      return () => window.removeEventListener('bolt:model-selection-changed', onSelectionChanged);
    }, []);

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = draftInput || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;

        setDraftInput(newInput);
      },
      [draftInput],
    );

    const effectiveStreaming = resolveEffectiveStreamingState({
      isLoading,
      fakeLoading,
      stalled: isStalledStream,
    });

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={draftInput}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={effectiveStreaming}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e.target.value);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message: Message, i: number) => {
          if (message.role === 'user') {
            // v3 UIMessages use parts instead of content — populate content for rendering
            if (!message.content && (message as any).parts?.length) {
              const textFromParts = (message as any).parts
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text ?? '')
                .join('');
              return { ...message, content: textFromParts };
            }

            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || message.content || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(
            draftInput,
            (input) => {
              setDraftInput(input);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        data={undefined}
        chatMode={chatMode}
        setChatMode={setChatMode}
        append={append}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        addToolResult={addToolOutput}
        onWebSearchResult={handleWebSearchResult}
        attachmentLibrary={attachmentLibrary}
        onReuseAttachment={(entry) => {
          setUploadedFiles((prev) => [...prev, entry.file]);
          setImageDataList((prev) => [...prev, entry.dataUrl]);
        }}
      />
    );
  },
);
