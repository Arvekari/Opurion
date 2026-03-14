import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChatFromMessages,
  deleteById,
  deleteSnapshot,
  duplicateChat,
  forkChat,
  getAll,
  getMessages,
  getNextId,
  getSnapshot,
  getUrlId,
  openDatabase,
  resolveUniqueUrlId,
  setMessages,
  setSnapshot,
  updateChatDescription,
  updateChatMetadata,
} from '~/lib/persistence/db';

type ChatRecord = {
  id: string;
  urlId?: string;
  description?: string;
  messages: Array<{ id: string; role: string; content: string }>;
  timestamp: string;
  metadata?: any;
};

function asyncRequest<T>(result?: T, error?: Error) {
  const request: any = {
    result,
    error,
    onsuccess: null,
    onerror: null,
  };

  queueMicrotask(() => {
    if (error) {
      request.onerror?.({ target: request });
    } else {
      request.onsuccess?.({ target: request });
    }
  });

  return request;
}

function createMockDb(initial?: { chats?: ChatRecord[]; snapshots?: Record<string, any> }) {
  const chats = new Map<string, ChatRecord>((initial?.chats ?? []).map((chat) => [chat.id, { ...chat }]));
  const snapshots = new Map<string, any>(Object.entries(initial?.snapshots ?? {}));

  const chatsStore = {
    getAll: () => asyncRequest(Array.from(chats.values())),
    get: (id: string) => asyncRequest(chats.get(id) ?? undefined),
    put: (value: ChatRecord) => {
      chats.set(value.id, { ...value });
      return asyncRequest(undefined);
    },
    delete: (id: string) => {
      chats.delete(id);
      return asyncRequest(undefined);
    },
    getAllKeys: () => asyncRequest(Array.from(chats.keys())),
    index: () => ({
      get: (urlId: string) =>
        asyncRequest(
          Array.from(chats.values()).find((chat) => chat.urlId === urlId),
        ),
    }),
    openCursor: () => {
      const values = Array.from(chats.values());
      let index = 0;
      const request: any = { onsuccess: null, onerror: null, error: null };

      const emit = () => {
        const value = values[index];
        const cursor = value
          ? {
              value,
              continue: () => {
                index += 1;
                queueMicrotask(emit);
              },
            }
          : null;

        request.onsuccess?.({ target: { result: cursor } });
      };

      queueMicrotask(emit);
      return request;
    },
  };

  const snapshotsStore = {
    get: (chatId: string) => asyncRequest(snapshots.has(chatId) ? { snapshot: snapshots.get(chatId) } : undefined),
    put: ({ chatId, snapshot }: { chatId: string; snapshot: any }) => {
      snapshots.set(chatId, snapshot);
      return asyncRequest(undefined);
    },
    delete: (chatId: string) => {
      snapshots.delete(chatId);
      return asyncRequest(undefined);
    },
  };

  return {
    db: {
      transaction: (storeName: string | string[]) => {
        const storeNames = Array.isArray(storeName) ? storeName : [storeName];
        return {
          error: null,
          oncomplete: null,
          onerror: null,
          objectStore: (name: string) => {
            if (!storeNames.includes(name)) {
              throw new Error(`Unknown store ${name}`);
            }

            if (name === 'chats') {
              return chatsStore;
            }

            return snapshotsStore;
          },
        };
      },
    } as unknown as IDBDatabase,
    chats,
    snapshots,
  };
}

describe('persistence/db', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns undefined when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);

    const db = await openDatabase();
    expect(db).toBeUndefined();
  });

  it('opens indexedDB and handles upgrade path', async () => {
    const createIndexMock = vi.fn();
    const upgradeDb = {
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore: vi.fn(() => ({ createIndex: createIndexMock })),
    };

    const request: any = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: { name: 'boltHistory' },
    };

    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => request),
    });

    const openPromise = openDatabase();

    request.onupgradeneeded?.({
      oldVersion: 0,
      target: { result: upgradeDb },
    });
    request.onsuccess?.({ target: request });

    const db = await openPromise;

    expect(db).toEqual({ name: 'boltHistory' });
    expect(upgradeDb.createObjectStore).toHaveBeenCalled();
    expect(createIndexMock).toHaveBeenCalled();
  });

  it('handles basic chat storage and retrieval operations', async () => {
    const { db, chats } = createMockDb({
      chats: [
        {
          id: '1',
          urlId: '1',
          description: 'First',
          messages: [{ id: 'm1', role: 'user', content: 'hello' }],
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const allChats = await getAll(db);
    expect(allChats).toHaveLength(1);

    await setMessages(
      db,
      '2',
      [{ id: 'm2', role: 'assistant', content: 'ok' }] as any,
      '2',
      'Second',
      '2026-01-01T00:00:00.000Z',
      { gitUrl: 'https://github.com/x/y' },
    );

    expect(chats.get('2')?.description).toBe('Second');

    await expect(setMessages(db, '3', [] as any, '3', 'Bad', 'not-a-date')).rejects.toThrow('Invalid timestamp');

    const byId = await getMessages(db, '1');
    expect(byId.id).toBe('1');

    const byUrlIdFallback = await getMessages(db, '2');
    expect(byUrlIdFallback.id).toBe('2');
  });

  it('supports id/url generation and chat clone/fork flows', async () => {
    const { db } = createMockDb({
      chats: [
        {
          id: '1',
          urlId: '1',
          description: 'Original',
          messages: [
            { id: 'm1', role: 'user', content: 'a' },
            { id: 'm2', role: 'assistant', content: 'b' },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await expect(getNextId(db)).resolves.toBe('2');
    await expect(getUrlId(db, '1')).resolves.toBe('1-2');

    const duplicatedUrlId = await duplicateChat(db, '1');
    expect(duplicatedUrlId).toBeTruthy();

    const forkedUrlId = await forkChat(db, '1', 'm1');
    expect(forkedUrlId).toBeTruthy();

    await expect(forkChat(db, '1', 'missing-message')).rejects.toThrow('Message not found');
    await expect(duplicateChat(db, 'missing-chat')).rejects.toThrow('Chat not found');

    const createdUrlId = await createChatFromMessages(
      db,
      'Created from messages',
      [{ id: 'mx', role: 'user', content: 'content' }] as any,
    );
    expect(createdUrlId).toBeTruthy();
  });

  it('updates descriptions, metadata, and snapshots', async () => {
    const { db, snapshots } = createMockDb({
      chats: [
        {
          id: '10',
          urlId: '10',
          description: 'Desc',
          messages: [{ id: 'm1', role: 'user', content: 'x' }],
          timestamp: new Date().toISOString(),
          metadata: { gitUrl: 'https://github.com/a/b' },
        },
      ],
    });

    await updateChatDescription(db, '10', 'Updated');
    await updateChatMetadata(db, '10', { gitUrl: 'https://github.com/new/repo', gitBranch: 'main' });

    await expect(updateChatDescription(db, '10', '   ')).rejects.toThrow('Description cannot be empty');
    await expect(updateChatMetadata(db, '404', { gitUrl: 'x' })).rejects.toThrow('Chat not found');

    await setSnapshot(db, '10', { files: {}, chatIndex: 'm1' } as any);
    expect(snapshots.get('10')).toEqual({ files: {}, chatIndex: 'm1' });

    const snapshot = await getSnapshot(db, '10');
    expect(snapshot).toEqual({ files: {}, chatIndex: 'm1' });

    await deleteSnapshot(db, '10');
    expect(snapshots.has('10')).toBe(false);

    await deleteById(db, '10');
    await expect(getSnapshot(db, '10')).resolves.toBeUndefined();
  });

  describe('urlId uniqueness / collision handling', () => {
    it('resolveUniqueUrlId returns requested urlId when it is not taken', async () => {
      const { db } = createMockDb({ chats: [] });
      const result = await resolveUniqueUrlId(db, 'chat-1', 'my-project');
      expect(result).toBe('my-project');
    });

    it('resolveUniqueUrlId returns existing urlId when re-saving the same chat', async () => {
      const { db } = createMockDb({
        chats: [
          {
            id: 'chat-1',
            urlId: 'my-project',
            description: 'Chat 1',
            messages: [],
            timestamp: new Date().toISOString(),
          },
        ],
      });
      // Same chat saving with same urlId — must NOT collide with itself
      const result = await resolveUniqueUrlId(db, 'chat-1', 'my-project');
      expect(result).toBe('my-project');
    });

    it('resolveUniqueUrlId generates a de-duped urlId when taken by a different chat', async () => {
      const { db } = createMockDb({
        chats: [
          {
            id: 'chat-existing',
            urlId: 'my-project',
            description: 'Existing owner',
            messages: [],
            timestamp: new Date().toISOString(),
          },
        ],
      });
      // Different chat (chat-new) requesting same urlId — must get a suffix
      const result = await resolveUniqueUrlId(db, 'chat-new', 'my-project');
      expect(result).toBe('my-project-2');
    });

    it('resolveUniqueUrlId increments suffix past existing collisions', async () => {
      const { db } = createMockDb({
        chats: [
          {
            id: 'chat-a',
            urlId: 'my-project',
            description: 'Owner A',
            messages: [],
            timestamp: new Date().toISOString(),
          },
          {
            id: 'chat-b',
            urlId: 'my-project-2',
            description: 'Owner B',
            messages: [],
            timestamp: new Date().toISOString(),
          },
        ],
      });
      const result = await resolveUniqueUrlId(db, 'chat-new', 'my-project');
      expect(result).toBe('my-project-3');
    });

    it('setMessages returns the resolved urlId and stores it in the chat record', async () => {
      const { db, chats } = createMockDb({ chats: [] });
      const returnedUrlId = await setMessages(
        db,
        'chat-1',
        [{ id: 'm1', role: 'user', content: 'hello' }] as any,
        'first-project',
        'My Chat',
      );
      expect(returnedUrlId).toBe('first-project');
      expect(chats.get('chat-1')?.urlId).toBe('first-project');
    });

    it('setMessages de-dupes urlId when another chat already owns it', async () => {
      const { db, chats } = createMockDb({
        chats: [
          {
            id: 'chat-existing',
            urlId: 'first-project',
            description: 'Existing',
            messages: [],
            timestamp: new Date().toISOString(),
          },
        ],
      });
      const returnedUrlId = await setMessages(
        db,
        'chat-new',
        [{ id: 'm2', role: 'user', content: 'hi' }] as any,
        'first-project',
        'New Chat',
      );
      // Must NOT return the colliding urlId — must be suffixed
      expect(returnedUrlId).toBe('first-project-2');
      expect(chats.get('chat-new')?.urlId).toBe('first-project-2');
      // Original owner must be untouched
      expect(chats.get('chat-existing')?.urlId).toBe('first-project');
    });

    it('getUrlIds skips records with missing or empty urlId values', async () => {
      const { db } = createMockDb({
        chats: [
          {
            id: 'chat-valid',
            urlId: 'real-url',
            description: 'Valid',
            messages: [],
            timestamp: new Date().toISOString(),
          },
          // no urlId field (undefined) — must be skipped
          {
            id: 'chat-no-url',
            description: 'No URL',
            messages: [],
            timestamp: new Date().toISOString(),
          } as any,
        ],
      });
      // 'real-url' is taken, 'other-url' is free
      await expect(getUrlId(db, 'real-url')).resolves.toBe('real-url-2');
      await expect(getUrlId(db, 'other-url')).resolves.toBe('other-url');
    });
  });
});
