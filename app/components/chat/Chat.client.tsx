import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoltChatTransport } from '~/lib/chat/boltChatTransport';
import { toast } from 'react-toastify';
import { getDebugLogger } from '~/utils/debugLogger';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { chatId, chatMetadata, description, useChatHistory } from '~/lib/persistence';
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
import { bumpCollabRefresh, collabStore, setCollabProjectContext } from '~/lib/stores/collab';
import {
  buildProjectPlanContent,
  buildProjectPlanStatusContent,
  formatProjectPlanRunStatus,
  PROJECT_PLAN_FILE_NAME,
  PROJECT_PLAN_KIND,
  PROJECT_PLAN_STATUS_FILE_NAME,
  PROJECT_PLAN_STATUS_KIND,
  type ProjectPlanRunStatus,
} from '~/lib/collab/project-plan';
import {
  getStreamingStallTimeoutMs,
  isStreamingStalled,
  resolveEffectiveStreamingState,
} from './streamingGuard';
import { buildRuntimeDiagnosticsPrefix } from './runtime-diagnostics';
import { restartWebContainer } from '~/lib/webcontainer';

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

function showInfoToast(message: string) {
  const maybeInfoToast = (toast as { info?: (content: string) => void }).info;

  if (typeof maybeInfoToast === 'function') {
    maybeInfoToast(message);
    return;
  }

  logger.info(`Toast info unavailable: ${message}`);
}

function getWebContainerDependencyRepairHints(alertContent?: string): string[] {
  const details = (alertContent || '').toLowerCase();
  const hints: string[] = [];

  const hasSqliteNativeIssue =
    details.includes("cannot find package 'sqlite3'") ||
    details.includes('cannot find package "sqlite3"') ||
    details.includes('better-sqlite3') ||
    details.includes('db.exec is not a function');
  const hasFastApiContext = details.includes('fastapi') || details.includes('uvicorn') || details.includes('python');
  const hasUnexpectedTokenHtml =
    details.includes("unexpected token '<'") ||
    details.includes('unexpected token <') ||
    details.includes('application error');

  if (hasSqliteNativeIssue) {
    hints.push('- Requirement: SQLite support must remain enabled in-container; do not remove DB functionality as a workaround.');
    hints.push('- WebContainer compatibility: for Node backends prefer `node:sqlite` (`DatabaseSync`) or another non-native SQLite path instead of native addons that fail to load.');
    hints.push('- If DB adapter changes, update server code so used methods (for example `exec`) match the selected API.');
  }

  if (hasFastApiContext || hasSqliteNativeIssue) {
    hints.push('- FastAPI + SQLite support is required in container previews; for Python use built-in `sqlite3` and ensure `uvicorn` startup still works.');
  }

  if (hasUnexpectedTokenHtml) {
    hints.push('- Parser fix: `Unexpected token \'<\'` usually means HTML error content is being parsed as JSON/JS; verify API response `content-type` before parsing.');
    hints.push('- Add guarded parsing in frontend/backend (`response.ok` + `content-type.includes("application/json")`) and surface raw text on non-JSON responses.');
  }

  return hints;
}

const AUTO_REPAIR_MIN_INTERVAL_MS = 45_000;
const AUTO_REPAIR_MAX_ATTEMPTS_PER_CATEGORY = 3;
const AUTO_REPAIR_COUNTDOWN_SECONDS = 6;
const QUEUE_WATCHDOG_INTERVAL_MS = 1500;
const QUEUE_WATCHDOG_STUCK_MS = 8000;
const QUEUE_WATCHDOG_LOG_THROTTLE_MS = 15000;
const CHAT_MODE_COOKIE_KEY = 'chatMode';

function normalizePreviewAlertContent(content?: string): string {
  return (content || '')
    .replace(/URL:\s.*$/gim, '')
    .replace(/Ready state:\s.*$/gim, '')
    .replace(/\"reason\"\s*:\s*\"[^\"]+\"/gim, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPreviewAutoRepairSignature(alert: { title: string; description: string; content?: string }): string {
  const normalizedContent = normalizePreviewAlertContent(alert.content);
  return `${alert.title}::${alert.description}::${normalizedContent.slice(0, 500)}`;
}

function buildAutoRepairProjectFileContext(files: unknown): string {
  const entries = Object.entries((files as Record<string, any>) || {});

  if (entries.length === 0) {
    return '';
  }

  const normalizedEntries = entries
    .map(([filePath, value]) => {
      const content = typeof value?.content === 'string' ? value.content : typeof value === 'string' ? value : undefined;
      const isBinary = value?.isBinary === true;
      const type = value?.type;

      if (!content || isBinary || (type && type !== 'file')) {
        return undefined;
      }

      return {
        path: filePath.replace(/\\/g, '/').replace(/^\/+/, ''),
        content,
      };
    })
    .filter((entry): entry is { path: string; content: string } => !!entry);

  if (normalizedEntries.length === 0) {
    return '';
  }

  const preferredMatchers: RegExp[] = [
    /(?:^|\/)package\.json$/i,
    /(?:^|\/)index\.html$/i,
    /(?:^|\/)vite\.config\.(?:js|mjs|cjs|ts|mts|cts)$/i,
    /(?:^|\/)src\/(?:main|index)\.(?:js|jsx|ts|tsx)$/i,
    /(?:^|\/)src\/App\.(?:js|jsx|ts|tsx)$/i,
  ];

  const selectedFiles: Array<{ path: string; content: string }> = [];

  for (const matcher of preferredMatchers) {
    const match = normalizedEntries.find((entry) => matcher.test(entry.path));

    if (match && !selectedFiles.some((selected) => selected.path === match.path)) {
      selectedFiles.push(match);
    }
  }

  if (selectedFiles.length === 0) {
    return '';
  }

  const maxCharsPerFile = 4000;
  const inventoryPaths = normalizedEntries
    .map((entry) => entry.path)
    .filter(
      (filePath) =>
        /(?:^|\/)(package\.json|index\.html)$/i.test(filePath) ||
        /(?:^|\/)vite\.config\.(?:js|mjs|cjs|ts|mts|cts)$/i.test(filePath) ||
        /(?:^|\/)(src|app)\/.+\.(?:js|jsx|ts|tsx|mjs|cjs)$/i.test(filePath),
    )
    .slice(0, 20);

  const blocks = selectedFiles.map((entry) => {
    const snippet = entry.content.slice(0, maxCharsPerFile);
    return [`--- ${entry.path} ---`, snippet].join('\n');
  });

  const inventoryBlock =
    inventoryPaths.length > 0
      ? ['Project file inventory (inspect related files, not only the first failing file):', ...inventoryPaths.map((filePath) => `- ${filePath}`)].join('\n')
      : '';

  return ['Project file context (authoritative current contents):', inventoryBlock, ...blocks].filter(Boolean).join('\n\n');
}

function buildStreamActivitySignature(messages: Message[]) {
  return messages
    .map((message) => {
      const parts = (message as any).parts;
      const partText = Array.isArray(parts)
        ? parts
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text ?? '')
            .join('')
        : '';
      const content = typeof message.content === 'string' ? message.content : '';

      return `${message.id}:${message.role}:${content}:${partText}`;
    })
    .join('|');
}

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat, updateChatMetadata } = useChatHistory();
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
          updateChatMetadata={updateChatMetadata}
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
  updateChatMetadata: (metadata: { providerName?: string; modelName?: string; [key: string]: any }) => Promise<void>;
  description?: string;
}

interface QueuedChatMessage {
  id: string;
  editableText: string;
  messageText: string;
  imageDataList: string[];
  uploadedFiles: File[];
  conversationId?: string;
  branchMode?: string;
  queuedAtMs: number;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat, updateChatMetadata }: ChatProps) => {
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
    const [chatMode, setChatModeState] = useState<'discuss' | 'build'>('discuss');
    const currentChatId = useStore(chatId);
    const currentChatMetadata = useStore(chatMetadata);
    const hydratedModelProviderSignatureRef = useRef<string>('');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const [isStalledStream, setIsStalledStream] = useState(false);
    const queuedMessagesRef = useRef<QueuedChatMessage[]>([]);
    const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
    const [queuedMessageCount, setQueuedMessageCount] = useState(0);
    const [isDispatchingQueuedMessage, setIsDispatchingQueuedMessage] = useState(false);
    const [previewAutoRepairCountdownSeconds, setPreviewAutoRepairCountdownSeconds] = useState<number | null>(null);
    const [queueDispatchTick, setQueueDispatchTick] = useState(0);
    const lastSubmittedUserMessageRef = useRef('');
    const lastQueueWatchdogLogAtRef = useRef(0);
    const previewAutoRepairRef = useRef<{
      attemptsBySignature: Map<string, number>;
      attemptsByCategory: Map<string, number>;
      lastAttemptBySignature: Map<string, number>;
      inFlightSignature?: string;
      countdownIntervalId?: number;
      countdownTimeoutId?: number;
    }>({
      attemptsBySignature: new Map<string, number>(),
      attemptsByCategory: new Map<string, number>(),
      lastAttemptBySignature: new Map<string, number>(),
      inFlightSignature: undefined,
      countdownIntervalId: undefined,
      countdownTimeoutId: undefined,
    });
    const streamStartedAtRef = useRef<number | null>(null);
    const lastChunkReceivedAtRef = useRef<number | null>(null);
    const lastStreamActivitySignatureRef = useRef<string>('');
    const lastLoggedStreamingPhaseRef = useRef<'submitted' | 'streaming' | null>(null);
    const mcpSettings = useMCPStore((state) => state.settings);
    const collab = useStore(collabStore);

    const upsertProjectArtifact = useCallback(
      async (input: {
        artifactId?: string;
        name: string;
        content: string;
        description: string;
        metadata: Record<string, any>;
      }) => {
        if (!collab.selectedProjectId) {
          return null;
        }

        const body = input.artifactId
          ? {
              intent: 'update' as const,
              artifactId: input.artifactId,
              content: input.content,
              metadata: input.metadata,
            }
          : {
              intent: 'create' as const,
              projectId: collab.selectedProjectId,
              name: input.name,
              description: input.description,
              artifactType: 'snippet' as const,
              visibility: 'project' as const,
              content: input.content,
              metadata: input.metadata,
            };

        const response = await fetch('/api/collab/artifacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = (await response.json()) as any;

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || `Failed to sync ${input.name}`);
        }

        return data?.artifact as { id?: string } | null;
      },
      [collab.selectedProjectId],
    );

    const syncProjectPlan = useCallback(
      async (assistantResponse: string) => {
        if (!collab.selectedProjectId) {
          return;
        }

        const updatedAt = new Date().toISOString();

        const planContent = buildProjectPlanContent({
          userRequest: lastSubmittedUserMessageRef.current,
          assistantResponse,
          chatMode,
        });

        if (!planContent) {
          return;
        }

        const metadata = {
          systemKind: PROJECT_PLAN_KIND,
          fileName: PROJECT_PLAN_FILE_NAME,
          description: 'Shared active project plan synchronized from planning-oriented chat replies',
          updatedAt,
          sourceMode: chatMode,
        };

        const artifact = await upsertProjectArtifact({
          artifactId: collab.projectPlanArtifactId,
          name: PROJECT_PLAN_FILE_NAME,
          content: planContent,
          description: metadata.description,
          metadata,
        });

        setCollabProjectContext({
          plan: planContent,
          planArtifactId: typeof artifact?.id === 'string' ? artifact.id : collab.projectPlanArtifactId,
          planUpdatedAt: updatedAt,
        });
        bumpCollabRefresh();
      },
      [chatMode, collab.projectPlanArtifactId, collab.selectedProjectId, upsertProjectArtifact],
    );

    const syncProjectPlanStatus = useCallback(
      async (input: { status: ProjectPlanRunStatus; assistantResponse?: string; errorMessage?: string }) => {
        if (!collab.selectedProjectId || !lastSubmittedUserMessageRef.current.trim()) {
          return;
        }

        const updatedAt = new Date().toISOString();
        const latestResult = (input.errorMessage || input.assistantResponse || '').trim();
        const summary = latestResult
          ? `${formatProjectPlanRunStatus(input.status)}: ${latestResult.slice(0, 140)}`
          : `${formatProjectPlanRunStatus(input.status)}: ${lastSubmittedUserMessageRef.current.trim().slice(0, 140)}`;
        const content = buildProjectPlanStatusContent({
          userRequest: lastSubmittedUserMessageRef.current,
          chatMode,
          status: input.status,
          assistantResponse: input.assistantResponse,
          errorMessage: input.errorMessage,
          updatedAt,
        });
        const metadata = {
          systemKind: PROJECT_PLAN_STATUS_KIND,
          fileName: PROJECT_PLAN_STATUS_FILE_NAME,
          description: 'Shared execution tracking for the active plan',
          updatedAt,
          runStatus: input.status,
          summary,
          sourceMode: chatMode,
        };
        const artifact = await upsertProjectArtifact({
          artifactId: collab.projectPlanStatusArtifactId,
          name: PROJECT_PLAN_STATUS_FILE_NAME,
          content,
          description: metadata.description,
          metadata,
        });

        setCollabProjectContext({
          planStatusContent: content,
          planStatusArtifactId:
            typeof artifact?.id === 'string' ? artifact.id : collab.projectPlanStatusArtifactId,
          planRunStatus: input.status,
          planStatusSummary: summary,
          planStatusUpdatedAt: updatedAt,
        });
        bumpCollabRefresh();
      },
      [chatMode, collab.projectPlanStatusArtifactId, collab.selectedProjectId, upsertProjectArtifact],
    );

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
        developmentPostgres: {
          enabled: !!supabaseConn?.developmentPostgres?.enabled,
          host: supabaseConn?.developmentPostgres?.host,
          port: supabaseConn?.developmentPostgres?.port,
          database: supabaseConn?.developmentPostgres?.database,
          username: supabaseConn?.developmentPostgres?.username,
          ssl: supabaseConn?.developmentPostgres?.ssl,
          hasPassword: Boolean(supabaseConn?.developmentPostgres?.password),
        },
        postgrest: {
          enabled: !!supabaseConn?.postgrest?.enabled,
          endpoint: supabaseConn?.postgrest?.endpoint,
          schema: supabaseConn?.postgrest?.schema,
          hasApiKey: Boolean(supabaseConn?.postgrest?.apiKey),
        },
      },
      maxLLMSteps: mcpSettings.maxLLMSteps,
    };

    const streamStallTimeoutMs = getStreamingStallTimeoutMs(provider.name);

    useEffect(() => {
      const persistedChatMode = Cookies.get(CHAT_MODE_COOKIE_KEY);

      if (persistedChatMode === 'build' || persistedChatMode === 'discuss') {
        setChatModeState(persistedChatMode);
      }
    }, []);

    const setChatMode = useCallback((mode: 'discuss' | 'build') => {
      setChatModeState(mode);
      Cookies.set(CHAT_MODE_COOKIE_KEY, mode, { expires: 30 });
    }, []);

    useEffect(() => {
      hydratedModelProviderSignatureRef.current = '';
    }, [currentChatId]);

    useEffect(() => {
      if (!currentChatId) {
        return;
      }

      const persistedProviderName = currentChatMetadata?.providerName;
      const persistedModelName = currentChatMetadata?.modelName;
      const metadataSignature = `${currentChatId}:${persistedProviderName || ''}:${persistedModelName || ''}`;

      if (hydratedModelProviderSignatureRef.current === metadataSignature) {
        return;
      }

      if (persistedProviderName) {
        const matchedProvider = PROVIDER_LIST.find((entry) => entry.name === persistedProviderName) as
          | ProviderInfo
          | undefined;

        if (matchedProvider && matchedProvider.name !== provider.name) {
          setProvider(matchedProvider);
          Cookies.set('selectedProvider', matchedProvider.name, { expires: 30 });
        }
      }

      if (persistedModelName && persistedModelName !== model) {
        setModel(persistedModelName);
        Cookies.set('selectedModel', persistedModelName, { expires: 30 });
      }

      hydratedModelProviderSignatureRef.current = metadataSignature;
    }, [currentChatId, currentChatMetadata?.providerName, currentChatMetadata?.modelName, provider.name, model]);

    useEffect(() => {
      if (!currentChatId || !hydratedModelProviderSignatureRef.current.startsWith(`${currentChatId}:`)) {
        return;
      }

      const nextProviderName = provider.name;
      const nextModelName = model;
      const metadataProviderName = currentChatMetadata?.providerName;
      const metadataModelName = currentChatMetadata?.modelName;

      if (metadataProviderName === nextProviderName && metadataModelName === nextModelName) {
        return;
      }

      void updateChatMetadata({
        ...(currentChatMetadata || {}),
        providerName: nextProviderName,
        modelName: nextModelName,
      });
    }, [currentChatId, currentChatMetadata, provider.name, model, updateChatMetadata]);

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
        setQueueDispatchTick((current) => current + 1);
        void syncProjectPlanStatus({
          status: 'failed',
          errorMessage: e instanceof Error ? e.message : String(e ?? 'Unknown error'),
        }).catch(() => undefined);
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
        setQueueDispatchTick((current) => current + 1);

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

        if (msgContent) {
          void syncProjectPlanStatus({ status: 'completed', assistantResponse: msgContent }).catch((statusError) => {
            logStore.logError('Failed to sync project plan status from assistant response', statusError, {
              component: 'Chat',
              action: 'project-plan-status-sync',
              provider: provider.name,
              model,
            });
          });

          void syncProjectPlan(msgContent).catch((planError) => {
            logStore.logError('Failed to sync project plan from assistant response', planError, {
              component: 'Chat',
              action: 'project-plan-sync',
              provider: provider.name,
              model,
            });
          });
        }
      },
    });

    // v3 useChat no longer returns isLoading — derive from status
    const isLoading = status === 'streaming' || status === 'submitted';

    useEffect(() => {
      if (status === 'submitted' && lastLoggedStreamingPhaseRef.current !== 'submitted') {
        lastLoggedStreamingPhaseRef.current = 'submitted';
        logStore.logSystem('Model request submitted; waiting for first response chunk', {
          component: 'Chat',
          action: 'stream-status',
          phase: 'submitted',
          provider: provider.name,
          model,
        });

        return;
      }

      if (status === 'streaming' && lastLoggedStreamingPhaseRef.current !== 'streaming') {
        lastLoggedStreamingPhaseRef.current = 'streaming';
        logStore.logSystem('Model response is actively streaming', {
          component: 'Chat',
          action: 'stream-status',
          phase: 'streaming',
          provider: provider.name,
          model,
        });

        return;
      }

      if (status === 'ready') {
        lastLoggedStreamingPhaseRef.current = null;
      }
    }, [model, provider.name, status]);

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
      const streamActivitySignature = buildStreamActivitySignature(messages);

      if ((isLoading || fakeLoading) && streamActivitySignature !== lastStreamActivitySignatureRef.current) {
        lastStreamActivitySignatureRef.current = streamActivitySignature;
        lastChunkReceivedAtRef.current = Date.now();
      } else if (!isLoading && !fakeLoading) {
        lastStreamActivitySignatureRef.current = streamActivitySignature;
      }

      if (collab.selectedConversationId) {
        parseMessages(messages, isLoading, chatMode);
        return;
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
      void syncProjectPlanStatus({ status: 'aborted' }).catch(() => undefined);

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

    const setQueuedMessageState = useCallback((nextQueuedMessages: QueuedChatMessage[]) => {
      queuedMessagesRef.current = nextQueuedMessages;
      setQueuedMessages(nextQueuedMessages);
      setQueuedMessageCount(nextQueuedMessages.length);
    }, []);

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

    const sendPreparedMessage = async (payload: QueuedChatMessage, action: string) => {
      const attachmentOptions =
        payload.uploadedFiles.length > 0
          ? { experimental_attachments: await filesToAttachments(payload.uploadedFiles) }
          : undefined;

      await Promise.resolve(
        sendViaChatApi(
          {
            role: 'user',
            content: payload.messageText,
            parts: createMessageParts(payload.messageText, payload.imageDataList),
          },
          attachmentOptions,
        ),
      );

      logStore.logProvider('Submitting message to /api/chat', {
        component: 'Chat',
        action,
        provider: provider.name,
        model,
        hasAttachments: !!attachmentOptions,
      });

      if (payload.conversationId) {
        void fetch('/api/collab/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: 'addMessage',
            conversationId: payload.conversationId,
            role: 'user',
            content: payload.messageText,
            branchMode: payload.branchMode,
          }),
        });
      }
    };

    const buildCollabContextPrefix = useCallback(() => {
      if (!collab.selectedProjectId) {
        return '';
      }

      const narratives = collab.projectNarratives?.trim() || '';
      const materials = collab.projectMaterials?.trim() || '';
      const guides = collab.projectGuides?.trim() || '';
      const plan = collab.projectPlan?.trim() || '';
      const files = collab.projectFiles || [];
      const discussionIndex = collab.discussionIndex || [];

      if (!narratives && !materials && !guides && !plan && discussionIndex.length === 0 && files.length === 0) {
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
        plan ? `Plan (${PROJECT_PLAN_FILE_NAME}):\n${plan}` : '',
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
      collab.projectPlan,
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
      const originalComposerInput = messageContent;
      const hasAttachments = uploadedFiles.length > 0 || imageDataList.length > 0;
      lastSubmittedUserMessageRef.current = messageContent;
      void syncProjectPlanStatus({ status: 'in_progress' }).catch(() => undefined);

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

      let finalMessageContent = messageContent;

      if (selectedElement) {
        console.log('Selected Element:', selectedElement);

        const elementInfo = `<div class="__boltSelectedElement__" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      const runtimeDiagnosticsPrefix = buildRuntimeDiagnosticsPrefix(finalMessageContent, actionAlert);

      if (runtimeDiagnosticsPrefix) {
        finalMessageContent = `${runtimeDiagnosticsPrefix}\n\n${finalMessageContent}`;
      }

      if (isLoading || fakeLoading || isDispatchingQueuedMessage) {
        const contextualContent = withCollabContext(finalMessageContent);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${contextualContent}`;
        const queuedPayload: QueuedChatMessage = {
          id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          editableText: finalMessageContent,
          messageText,
          imageDataList: [...imageDataList],
          uploadedFiles: [...uploadedFiles],
          conversationId: collab.selectedConversationId || undefined,
          branchMode: collab.branchMode,
          queuedAtMs: Date.now(),
        };

        setQueuedMessageState([...queuedMessagesRef.current, queuedPayload]);
        setQueueDispatchTick((current) => current + 1);

        addToAttachmentLibrary([...uploadedFiles], [...imageDataList]);
        setDraftInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);
        setUploadedFiles([]);
        setImageDataList([]);
        resetEnhancer();
        textareaRef.current?.blur();

        logStore.logSystem('Message queued while response is in progress', {
          component: 'Chat',
          action: 'sendMessage:queued',
          provider: provider.name,
          model,
          queuedCount: queuedMessagesRef.current.length,
        });

        showInfoToast(`Message queued (${queuedMessagesRef.current.length})`);
        return;
      }

      if (isStalledStream) {
        setIsStalledStream(false);
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
        const capturedImageDataList = [...imageDataList];
        const capturedUploadedFiles = [...uploadedFiles];

        setDraftInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);
        setUploadedFiles([]);
        setImageDataList([]);
        resetEnhancer();
        textareaRef.current?.blur();

        try {
          await sendPreparedMessage(
            {
              messageText,
              imageDataList: capturedImageDataList,
              uploadedFiles: capturedUploadedFiles,
              conversationId: collab.selectedConversationId || undefined,
              branchMode: collab.branchMode,
            },
            'sendMessage:append-modified-files',
          );
          addToAttachmentLibrary(capturedUploadedFiles, capturedImageDataList);
        } catch (appendError) {
          logger.error('Message append failed (modified files path)', appendError);
          logStore.logError('Message append failed (modified files path)', appendError, {
            component: 'Chat',
            action: 'sendMessage:append-modified-files',
            provider: provider.name,
            model,
          });
          handleError(appendError, 'chat');
          setDraftInput(originalComposerInput ?? '');
          setUploadedFiles(capturedUploadedFiles);
          setImageDataList(capturedImageDataList);
          return;
        }

        workbenchStore.resetAllFileModifications();
      } else {
        const contextualContent = withCollabContext(finalMessageContent);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${contextualContent}`;
        const capturedImageDataList = [...imageDataList];
        const capturedUploadedFiles = [...uploadedFiles];

        console.log('🚀 Sending message via chat API:', {
          content: messageText.substring(0, 100),
          hasAttachments: uploadedFiles.length > 0,
        });

        setDraftInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);
        setUploadedFiles([]);
        setImageDataList([]);
        resetEnhancer();
        textareaRef.current?.blur();

        try {
          await sendPreparedMessage(
            {
              messageText,
              imageDataList: capturedImageDataList,
              uploadedFiles: capturedUploadedFiles,
              conversationId: collab.selectedConversationId || undefined,
              branchMode: collab.branchMode,
            },
            'sendMessage:append',
          );
          addToAttachmentLibrary(capturedUploadedFiles, capturedImageDataList);
        } catch (appendError) {
          logger.error('Message append failed', appendError);
          logStore.logError('Message append failed', appendError, {
            component: 'Chat',
            action: 'sendMessage:append',
            provider: provider.name,
            model,
          });
          handleError(appendError, 'chat');
          setDraftInput(originalComposerInput ?? '');
          setUploadedFiles(capturedUploadedFiles);
          setImageDataList(capturedImageDataList);
          return;
        }

        console.log('✅ Append called, messages state should update soon');
      }
    };

    useEffect(() => {
      const currentlyStreaming = isLoading || fakeLoading;

      if (currentlyStreaming || isDispatchingQueuedMessage) {
        return;
      }

      const [nextMessage, ...remainingMessages] = queuedMessagesRef.current;

      if (!nextMessage) {
        if (queuedMessageCount !== 0) {
          setQueuedMessageCount(0);
        }

        return;
      }

      setQueuedMessageState(remainingMessages);
      setIsDispatchingQueuedMessage(true);

      sendPreparedMessage(nextMessage, 'sendMessage:queued-dispatch')
        .catch((queuedError) => {
          setQueuedMessageState([nextMessage, ...queuedMessagesRef.current]);
          logger.error('Queued message dispatch failed', queuedError);
          logStore.logError('Queued message dispatch failed', queuedError, {
            component: 'Chat',
            action: 'sendMessage:queued-dispatch',
            provider: provider.name,
            model,
          });
          handleError(queuedError, 'chat');
        })
        .finally(() => {
          setIsDispatchingQueuedMessage(false);
          setQueueDispatchTick((current) => current + 1);
        });
    }, [
      fakeLoading,
      handleError,
      isDispatchingQueuedMessage,
      isLoading,
      model,
      provider.name,
      queueDispatchTick,
      queuedMessageCount,
    ]);

    useEffect(() => {
      if (isLoading || fakeLoading || isDispatchingQueuedMessage) {
        return;
      }

      const timer = setInterval(() => {
        if (isLoading || fakeLoading || isDispatchingQueuedMessage) {
          return;
        }

        const queuedCount = queuedMessagesRef.current.length;

        if (queuedCount === 0) {
          if (queuedMessageCount !== 0) {
            setQueuedMessageCount(0);
          }

          return;
        }

        const oldestQueuedMessage = queuedMessagesRef.current[0];

        if (!oldestQueuedMessage) {
          return;
        }

        const queuedForMs = Date.now() - oldestQueuedMessage.queuedAtMs;

        if (queuedForMs < QUEUE_WATCHDOG_STUCK_MS) {
          return;
        }

        const now = Date.now();

        if (now - lastQueueWatchdogLogAtRef.current >= QUEUE_WATCHDOG_LOG_THROTTLE_MS) {
          lastQueueWatchdogLogAtRef.current = now;
          logger.warn('Queue watchdog detected stuck queued messages; forcing next dispatch', {
            queuedCount,
            queuedForMs,
            provider: provider.name,
            model,
          });
        }

        const [nextMessage, ...remainingMessages] = queuedMessagesRef.current;

        if (!nextMessage) {
          return;
        }

        setQueuedMessageState(remainingMessages);
        setIsDispatchingQueuedMessage(true);

        sendPreparedMessage(nextMessage, 'sendMessage:queued-watchdog-dispatch')
          .catch((queuedError) => {
            setQueuedMessageState([nextMessage, ...queuedMessagesRef.current]);
            logger.error('Queued message watchdog dispatch failed', queuedError);
            logStore.logError('Queued message watchdog dispatch failed', queuedError, {
              component: 'Chat',
              action: 'sendMessage:queued-watchdog-dispatch',
              provider: provider.name,
              model,
            });
            handleError(queuedError, 'chat');
          })
          .finally(() => {
            setIsDispatchingQueuedMessage(false);
          });
      }, QUEUE_WATCHDOG_INTERVAL_MS);

      return () => {
        clearInterval(timer);
      };
    }, [fakeLoading, handleError, isDispatchingQueuedMessage, isLoading, model, provider.name, queuedMessageCount, setQueuedMessageState]);

    const handleRemoveQueuedMessage = useCallback(
      (queuedMessageId: string) => {
        const remainingMessages = queuedMessagesRef.current.filter((message) => message.id !== queuedMessageId);
        setQueuedMessageState(remainingMessages);
      },
      [setQueuedMessageState],
    );

    const handleEditQueuedMessage = useCallback(
      (queuedMessageId: string) => {
        const queuedMessage = queuedMessagesRef.current.find((message) => message.id === queuedMessageId);

        if (!queuedMessage) {
          return;
        }

        const remainingMessages = queuedMessagesRef.current.filter((message) => message.id !== queuedMessageId);
        setQueuedMessageState(remainingMessages);
        setDraftInput(queuedMessage.editableText);
        setUploadedFiles(queuedMessage.uploadedFiles);
        setImageDataList(queuedMessage.imageDataList);

        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      },
      [setQueuedMessageState],
    );

    const displayedMessages = useMemo(() => {
      const normalizedMessages = messages.map((message: Message, i: number) => {
        if (message.role === 'user') {
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
      });

      const queuedMessagePreviews = queuedMessages.map((queuedMessage) => ({
        id: queuedMessage.id,
        role: 'user' as const,
        content: queuedMessage.messageText,
        parts: createMessageParts(queuedMessage.messageText, queuedMessage.imageDataList),
        annotations: ['queued'],
      }));

      return [...normalizedMessages, ...queuedMessagePreviews];
    }, [messages, parsedMessages, queuedMessages]);

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

    useEffect(() => {
      // Always cleanup previous timers when effect runs, regardless of alert state
      const cleanupCountdown = () => {
        if (previewAutoRepairRef.current.countdownIntervalId !== undefined) {
          window.clearInterval(previewAutoRepairRef.current.countdownIntervalId);
          previewAutoRepairRef.current.countdownIntervalId = undefined;
        }

        if (previewAutoRepairRef.current.countdownTimeoutId !== undefined) {
          window.clearTimeout(previewAutoRepairRef.current.countdownTimeoutId);
          previewAutoRepairRef.current.countdownTimeoutId = undefined;
        }

        setPreviewAutoRepairCountdownSeconds(null);
      };

      if (!actionAlert || actionAlert.source !== 'preview') {
        cleanupCountdown();
        return;
      }

      const signature = buildPreviewAutoRepairSignature(actionAlert);
      const attempts = previewAutoRepairRef.current.attemptsBySignature.get(signature) || 0;
      const alertCategory = `${actionAlert.title}::${actionAlert.description}`;
      const categoryAttempts = previewAutoRepairRef.current.attemptsByCategory.get(alertCategory) || 0;
      const lastAttemptAt = previewAutoRepairRef.current.lastAttemptBySignature.get(signature) || 0;
      const now = Date.now();

      if (previewAutoRepairRef.current.inFlightSignature === signature) {
        return;
      }

      if (lastAttemptAt > 0 && now - lastAttemptAt < AUTO_REPAIR_MIN_INTERVAL_MS) {
        return;
      }

      if (attempts >= 2) {
        return;
      }

      if (categoryAttempts >= AUTO_REPAIR_MAX_ATTEMPTS_PER_CATEGORY) {
        return;
      }

      if (isLoading || fakeLoading) {
        return;
      }

      previewAutoRepairRef.current.inFlightSignature = signature;
      previewAutoRepairRef.current.attemptsBySignature.set(signature, attempts + 1);
      previewAutoRepairRef.current.attemptsByCategory.set(alertCategory, categoryAttempts + 1);
      previewAutoRepairRef.current.lastAttemptBySignature.set(signature, now);

      const dispatchAutoRepair = async () => {
        // Kill the old WebContainer instance and start a fresh one before attempting auto-repair
        // This prevents multiple stale instances from accumulating and ensures the preview
        // connects to the correct (fresh) instance
        try {
          console.log('[Auto-Repair] Restarting WebContainer before repair attempt');
          await restartWebContainer();
        } catch (restartError) {
          logStore.logError('WebContainer restart during auto-repair failed', restartError, {
            component: 'Chat',
            action: 'preview-auto-repair:restart-webcontainer',
            attempt: attempts + 1,
          });
          // Continue with repair attempt even if restart fails
        }

        let diagnosticsBundle = '';
        const projectFileContext = buildAutoRepairProjectFileContext(files);

        if (attempts >= 1) {
          try {
            const [debugLog, eventLogs] = await Promise.all([
              getDebugLogger().generateDebugLog(),
              Promise.resolve(logStore.getLogs()),
            ]);
            const recentTerminal = debugLog.terminalLogs.slice(-20);
            const recentErrors = debugLog.errors.slice(-10);
            const recentEventLogs = eventLogs.slice(0, 25);

            diagnosticsBundle = [
              'Attached diagnostics from repeated auto-repair attempts:',
              `- Terminal log entries: ${debugLog.terminalLogs.length}`,
              `- Runtime errors: ${debugLog.errors.length}`,
              `- Event logs: ${eventLogs.length}`,
              '',
              'Recent terminal logs:',
              JSON.stringify(recentTerminal, null, 2),
              '',
              'Recent runtime errors:',
              JSON.stringify(recentErrors, null, 2),
              '',
              'Recent event logs:',
              JSON.stringify(recentEventLogs, null, 2),
            ].join('\n');
          } catch (diagnosticsError) {
            logStore.logError('Failed to collect auto-repair diagnostics bundle', diagnosticsError, {
              component: 'Chat',
              action: 'preview-auto-repair:collect-diagnostics',
              attempt: attempts + 1,
            });
          }
        }

        const repairPrompt = [
          'Auto-repair request: preview validation failed. Diagnose and fix the project until preview renders correctly.',
          'Constraints:',
          '- Detect and fix root cause (build errors, invalid entrypoint content, parser errors, blank render states).',
          '- Fix the whole request, not just the first failing file or the first stack-trace location.',
          '- If one fix changes imports, exports, config, setup, or entrypoints, update every dependent file in the same repair pass.',
          '- Preserve existing non-broken project files; do not blank/truncate files or recreate them with empty content unless explicitly required by the fix.',
          '- Do not ask for additional context; use the attached project file context and workspace files to diagnose and fix directly.',
          '- Before finishing, ensure package.json, entry files, imported modules, configs, and start command are mutually consistent for the entire app.',
          '- Prefer a complete multi-file repair sequence over a partial one-file patch that leaves the request broken.',
          '- Apply concrete file changes and rerun required setup/start steps.',
          '- Do not ask user for confirmation; continue until preview is working.',
          '- WebContainer working directory is /home/project — NEVER use /workspace or any other root.',
          '- Do NOT run diagnostic-only commands like `which node` or `which yarn`; run install/start directly.',
          '- Prefer `pnpm install` and `pnpm run dev` for WebContainer-based repairs unless the project already proves another package manager is required.',
          ...getWebContainerDependencyRepairHints(actionAlert.content),
          '',
          `Alert title: ${actionAlert.title}`,
          `Alert description: ${actionAlert.description}`,
          `Alert details:\n${actionAlert.content || 'n/a'}`,
          projectFileContext ? `\n${projectFileContext}` : '',
          diagnosticsBundle ? `\n${diagnosticsBundle}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        await Promise.resolve(sendMessage({} as any, repairPrompt));
      };

      if (previewAutoRepairRef.current.countdownIntervalId !== undefined) {
        window.clearInterval(previewAutoRepairRef.current.countdownIntervalId);
        previewAutoRepairRef.current.countdownIntervalId = undefined;
      }

      if (previewAutoRepairRef.current.countdownTimeoutId !== undefined) {
        window.clearTimeout(previewAutoRepairRef.current.countdownTimeoutId);
        previewAutoRepairRef.current.countdownTimeoutId = undefined;
      }

      setPreviewAutoRepairCountdownSeconds(AUTO_REPAIR_COUNTDOWN_SECONDS);

      previewAutoRepairRef.current.countdownIntervalId = window.setInterval(() => {
        setPreviewAutoRepairCountdownSeconds((current) => {
          if (current === null) {
            return null;
          }

          if (current <= 1) {
            return 0;
          }

          return current - 1;
        });
      }, 1000);

      previewAutoRepairRef.current.countdownTimeoutId = window.setTimeout(() => {
        if (previewAutoRepairRef.current.countdownIntervalId !== undefined) {
          window.clearInterval(previewAutoRepairRef.current.countdownIntervalId);
          previewAutoRepairRef.current.countdownIntervalId = undefined;
        }

        previewAutoRepairRef.current.countdownTimeoutId = undefined;
        setPreviewAutoRepairCountdownSeconds(null);

        workbenchStore.clearAlert();
        showInfoToast(`Auto-repairing preview issue (attempt ${attempts + 1}/2)...`);

        dispatchAutoRepair()
          .catch((error) => {
            logStore.logError('Automatic preview repair dispatch failed', error, {
              component: 'Chat',
              action: 'preview-auto-repair',
              attempt: attempts + 1,
            });
          })
          .finally(() => {
            previewAutoRepairRef.current.inFlightSignature = undefined;
          });
      }, AUTO_REPAIR_COUNTDOWN_SECONDS * 1000);
    }, [actionAlert, fakeLoading, isLoading, sendMessage]);

    useEffect(() => {
      return () => {
        if (previewAutoRepairRef.current.countdownIntervalId !== undefined) {
          window.clearInterval(previewAutoRepairRef.current.countdownIntervalId);
          previewAutoRepairRef.current.countdownIntervalId = undefined;
        }

        if (previewAutoRepairRef.current.countdownTimeoutId !== undefined) {
          window.clearTimeout(previewAutoRepairRef.current.countdownTimeoutId);
          previewAutoRepairRef.current.countdownTimeoutId = undefined;
        }
      };
    }, []);

    const effectiveStreaming = resolveEffectiveStreamingState({
      isLoading,
      fakeLoading,
      stalled: isStalledStream,
    });

    const streamingPhase: 'submitted' | 'streaming' | 'stalled' | undefined = isStalledStream
      ? 'stalled'
      : status === 'submitted'
        ? 'submitted'
        : effectiveStreaming
          ? 'streaming'
          : undefined;

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={draftInput}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={effectiveStreaming}
        streamingState={streamingPhase}
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
        messages={displayedMessages}
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
        previewAutoRepairCountdownSeconds={
          actionAlert?.source === 'preview' ? previewAutoRepairCountdownSeconds : null
        }
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
        onEditQueuedMessage={handleEditQueuedMessage}
        onRemoveQueuedMessage={handleRemoveQueuedMessage}
        onReuseAttachment={(entry) => {
          setUploadedFiles((prev) => [...prev, entry.file]);
          setImageDataList((prev) => [...prev, entry.dataUrl]);
        }}
      />
    );
  },
);
