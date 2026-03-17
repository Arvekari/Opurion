import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import {
  getAll,
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  updateChatMetadata as updateChatMetadataInDb,
  type IChatMetadata,
} from './db';
import { deriveChatTitleFromMessages } from './chatTitle';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

export const db = persistenceEnabled ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);

function shouldDeriveTitleFromDescription(currentDescription?: string): boolean {
  const normalized = (currentDescription || '').trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return normalized === 'new chat' || normalized.startsWith('discussion ') || normalized.startsWith('[model:');
}

function applyDuplicateTitleNumbering(baseTitle: string, ordinal: number): string {
  return `${String(ordinal).padStart(3, '0')}- ${baseTitle}`;
}

async function resolveUniqueChatDescription(db: IDBDatabase, proposedTitle: string, currentChatId?: string): Promise<string> {
  const normalizedTitle = proposedTitle.trim();

  if (!normalizedTitle) {
    return proposedTitle;
  }

  const chats = await getAll(db);
  const normalizedKey = normalizedTitle.toLowerCase();
  const matchingChats = chats.filter((chat) => {
    if (currentChatId && chat.id === currentChatId) {
      return false;
    }

    return (chat.description || '').trim().toLowerCase() === normalizedKey;
  });

  if (matchingChats.length === 0) {
    return normalizedTitle;
  }

  return applyDuplicateTitleNumbering(normalizedTitle, matchingChats.length + 1);
}

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const chatIdReservationRef = useRef<Promise<string> | null>(null);
  const latestSnapshotMessageIdRef = useRef<string>('');
  const latestSnapshotSummaryRef = useRef<string | undefined>(undefined);
  const snapshotDebounceTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!db) {
      setReady(true);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (mixedId) {
      getMessages(db, mixedId)
        .then(async (storedMessages) => {
          const snapshot =
            (await getSnapshot(db, storedMessages.id).catch(() => undefined)) ||
            (await getSnapshot(db, mixedId).catch(() => undefined));

          if (storedMessages && storedMessages.messages.length > 0) {
            /*
             * const snapshotStr = localStorage.getItem(`snapshot:${mixedId}`); // Remove localStorage usage
             * const snapshot: Snapshot = snapshotStr ? JSON.parse(snapshotStr) : { chatIndex: 0, files: {} }; // Use snapshot from DB
             */
            const validSnapshot = snapshot || { chatIndex: '', files: {} }; // Ensure snapshot is not undefined
            const summary = validSnapshot.summary;

            const rewindId = searchParams.get('rewindTo');
            let startingIdx = -1;
            const endingIdx = rewindId
              ? storedMessages.messages.findIndex((m) => m.id === rewindId) + 1
              : storedMessages.messages.length;
            const snapshotIndex = storedMessages.messages.findIndex((m) => m.id === validSnapshot.chatIndex);

            if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
              startingIdx = snapshotIndex;
            }

            if (snapshotIndex > 0 && storedMessages.messages[snapshotIndex].id == rewindId) {
              startingIdx = -1;
            }

            const shouldRestoreFromSnapshot = Boolean(rewindId) && startingIdx > 0;

            let filteredMessages = shouldRestoreFromSnapshot
              ? storedMessages.messages.slice(startingIdx + 1, endingIdx)
              : storedMessages.messages.slice(0, endingIdx);
            let archivedMessages: Message[] = shouldRestoreFromSnapshot
              ? storedMessages.messages.slice(0, startingIdx + 1)
              : [];

            setArchivedMessages(archivedMessages);

            if (shouldRestoreFromSnapshot) {
              const files = Object.entries(validSnapshot?.files || {})
                .map(([key, value]) => {
                  if (value?.type !== 'file') {
                    return null;
                  }

                  return {
                    content: value.content,
                    path: key,
                  };
                })
                .filter((x): x is { content: string; path: string } => !!x); // Type assertion
              const projectCommands = await detectProjectCommands(files);

              // Call the modified function to get only the command actions string
              const commandActionsString = createCommandActionsString(projectCommands);

              filteredMessages = [
                {
                  id: generateId(),
                  role: 'user',
                  content: `Restore project from snapshot`, // Removed newline
                  annotations: ['no-store', 'hidden'],
                },
                {
                  id: storedMessages.messages[snapshotIndex].id,
                  role: 'assistant',

                  // Combine followup message and the artifact with files and command actions
                  content: `Opurion restored your chat from a snapshot. You can revert this message to load the full chat history.
                  <boltArtifact id="restored-project-setup" title="Restored Project & Setup" type="bundled">
                  ${Object.entries(snapshot?.files || {})
                    .map(([key, value]) => {
                      if (value?.type === 'file') {
                        return `
                      <boltAction type="file" filePath="${key}">
${value.content}
                      </boltAction>
                      `;
                      } else {
                        return ``;
                      }
                    })
                    .join('\n')}
                  ${commandActionsString} 
                  </boltArtifact>
                  `, // Added commandActionsString, followupMessage, updated id and title
                  annotations: [
                    'no-store',
                    ...(summary
                      ? [
                          {
                            chatId: storedMessages.messages[snapshotIndex].id,
                            type: 'chatSummary',
                            summary,
                          } satisfies ContextAnnotation,
                        ]
                      : []),
                  ],
                },

                // Remove the separate user and assistant messages for commands
                /*
                 *...(commands !== null // This block is no longer needed
                 *  ? [ ... ]
                 *  : []),
                 */
                ...filteredMessages,
              ];
            }

            const snapshotFiles = validSnapshot?.files || {};

            if (Object.keys(snapshotFiles).length > 0) {
              await restoreSnapshot(mixedId, validSnapshot);
              workbenchStore.files.set(snapshotFiles);
              workbenchStore.setDocuments(snapshotFiles);
              workbenchStore.resetAllFileModifications();
            }

            setInitialMessages(filteredMessages);
            latestSnapshotMessageIdRef.current = filteredMessages[filteredMessages.length - 1]?.id || '';
            latestSnapshotSummaryRef.current = summary;

            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            chatMetadata.set(storedMessages.metadata);
          } else {
            navigate('/', { replace: true });
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);

          logStore.logError('Failed to load chat messages or snapshot', error); // Updated error message
          toast.error('Failed to load chat: ' + error.message); // More specific error
          setReady(true);
        });
    } else {
      // Handle case where there is no mixedId (e.g., new chat)
      chatId.set(undefined);
      description.set(undefined);
      chatMetadata.set(undefined);
      setReady(true);
    }
  }, [mixedId, db, navigate, searchParams]); // Added db, navigate, searchParams dependencies

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, snapshotChatId?: string | undefined, chatSummary?: string) => {
      const id = snapshotChatId || chatId.get();

      if (!id || !db) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
      };

      // localStorage.setItem(`snapshot:${id}`, JSON.stringify(snapshot)); // Remove localStorage usage
      try {
        await setSnapshot(db, id, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [db],
  );

  const restoreSnapshot = useCallback(async (id: string, snapshot?: Snapshot) => {
    // const snapshotStr = localStorage.getItem(`snapshot:${id}`); // Remove localStorage usage
    const container = await webcontainer;

    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!validSnapshot?.files) {
      return;
    }

    const normalizedEntries = Object.entries(validSnapshot.files).map(([path, entry]) => {
      let normalizedPath = path;

      if (normalizedPath.startsWith(container.workdir)) {
        normalizedPath = normalizedPath.replace(container.workdir, '');
      }

      return [normalizedPath, entry] as const;
    });

    for (const [path, entry] of normalizedEntries) {
      if (entry?.type !== 'folder') {
        continue;
      }

      try {
        await container.fs.mkdir(path, { recursive: true });
      } catch (error) {
        logStore.logError(`Failed to restore snapshot folder: ${path}`, error);
      }
    }

    for (const [path, entry] of normalizedEntries) {
      if (entry?.type !== 'file') {
        continue;
      }

      try {
        await container.fs.writeFile(path, entry.content, { encoding: entry.isBinary ? undefined : 'utf8' });
      } catch (error) {
        logStore.logError(`Failed to restore snapshot file: ${path}`, error);
      }
    }

    // workbenchStore.files.setKey(snapshot?.files)
  }, []);

  const ensureChatId = useCallback(
    async (messages: Message[]): Promise<string | undefined> => {
      const currentChatId = chatId.get();

      if (currentChatId) {
        return currentChatId;
      }

      if (!db) {
        return undefined;
      }

      const pathMatch = window.location.pathname.match(/^\/chat\/([^/?#]+)/i);
      const routeChatToken = pathMatch?.[1];

      if (routeChatToken) {
        try {
          const routeChat = await getMessages(db, decodeURIComponent(routeChatToken));

          if (routeChat?.id) {
            chatId.set(routeChat.id);

            if (!urlId && routeChat.urlId) {
              setUrlId(routeChat.urlId);
            }

            description.set(routeChat.description);
            chatMetadata.set(routeChat.metadata);

            return routeChat.id;
          }
        } catch {
          // route token does not map to a persisted chat yet; reserve a new id below
        }
      }

      if (!chatIdReservationRef.current) {
        chatIdReservationRef.current = (async () => {
          const nextId = await getNextId(db);
          chatId.set(nextId);

          const hasAssistantMessage = messages.some((message) => message.role === 'assistant');

          if (!urlId && hasAssistantMessage) {
            navigateChat(nextId);
          }

          return nextId;
        })().finally(() => {
          chatIdReservationRef.current = null;
        });
      }

      return chatIdReservationRef.current;
    },
    [db, urlId],
  );

  useEffect(() => {
    const unsubscribe = workbenchStore.files.subscribe((files) => {
      const activeChatId = chatId.get();
      const latestMessageId = latestSnapshotMessageIdRef.current;

      if (!activeChatId || !latestMessageId) {
        return;
      }

      if (snapshotDebounceTimerRef.current) {
        window.clearTimeout(snapshotDebounceTimerRef.current);
      }

      snapshotDebounceTimerRef.current = window.setTimeout(() => {
        void takeSnapshot(latestMessageId, files, activeChatId, latestSnapshotSummaryRef.current);
      }, 700);
    });

    return () => {
      unsubscribe();

      if (snapshotDebounceTimerRef.current) {
        window.clearTimeout(snapshotDebounceTimerRef.current);
      }
    };
  }, [takeSnapshot]);

  return {
    ready: !mixedId || ready,
    initialMessages,
    updateChatMetadata: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!db || !id) {
        return;
      }

      try {
        await updateChatMetadataInDb(db, id, metadata);
        const stored = await getMessages(db, id);
        const savedUrlId = stored?.urlId || urlId || id;
        setUrlId(savedUrlId);
        chatMetadata.set(metadata);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('Chat not found')) {
          chatMetadata.set(metadata);
          return;
        }

        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!db || !id) {
        return;
      }

      try {
        await updateChatMetadataInDb(db, id, metadata);
        const stored = await getMessages(db, id);
        const savedUrlId = stored?.urlId || urlId || id;
        setUrlId(savedUrlId);
        chatMetadata.set(metadata);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('Chat not found')) {
          chatMetadata.set(metadata);
          return;
        }

        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!db || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      let _urlId = urlId;

      if (!urlId && firstArtifact?.id) {
        const urlId = await getUrlId(db, firstArtifact.id);
        _urlId = urlId;
        navigateChat(urlId);
        setUrlId(urlId);
      }

      let chatSummary: string | undefined = undefined;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      if (shouldDeriveTitleFromDescription(description.get())) {
        const derivedTitle = deriveChatTitleFromMessages(messages, firstArtifact?.title);

        if (derivedTitle) {
          const uniqueDescription = await resolveUniqueChatDescription(db, derivedTitle, chatId.get());
          description.set(uniqueDescription);
        }
      }

      const ensuredChatId = await ensureChatId(messages);

      // Ensure chatId.get() is used for the final setMessages call
      const finalChatId = chatId.get() || ensuredChatId;

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');

        return;
      }

      const effectiveUrlId = _urlId || finalChatId;
      const latestMessageId = messages[messages.length - 1]?.id;

      if (latestMessageId) {
        latestSnapshotMessageIdRef.current = latestMessageId;
      }

      latestSnapshotSummaryRef.current = chatSummary;

      await takeSnapshot(latestMessageId || finalChatId, workbenchStore.files.get(), finalChatId, chatSummary);

      const savedUrlId = await setMessages(
        db,
        finalChatId, // Use the potentially updated chatId
        [...archivedMessages, ...messages],
        effectiveUrlId,
        description.get(),
        undefined,
        chatMetadata.get(),
      );

      if (savedUrlId !== urlId) {
        setUrlId(savedUrlId);

        if (!urlId) {
          navigateChat(savedUrlId);
        }
      }
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!db || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(db, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!db) {
        return;
      }

      try {
        const newId = await createChatFromMessages(db, description, messages, metadata);
        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!db || !id) {
        return;
      }

      const chat = await getMessages(db, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}


function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
