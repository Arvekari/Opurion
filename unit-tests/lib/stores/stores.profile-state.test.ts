import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('stores/profile module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('persists updates to active user-scoped storage key', async () => {
    const backingStore = new Map<string, string>();
    const localStorageMock = {
      getItem: vi.fn((key: string) => backingStore.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        backingStore.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        backingStore.delete(key);
      }),
    };

    vi.stubGlobal('window', {} as any);
    vi.stubGlobal('localStorage', localStorageMock as any);

    const module = await import('~/lib/stores/profile');
    module.setActiveProfileUser('u1');
    module.updateProfile({ username: 'alice', bio: 'dev' });

    expect(backingStore.get('bolt_profile:u1')).toBe(JSON.stringify({ username: 'alice', bio: 'dev', avatar: '' }));
    expect(backingStore.get('bolt_profile:u2')).toBeUndefined();
  });

  it('loads the correct profile when session user changes', async () => {
    const backingStore = new Map<string, string>([
      ['bolt_profile:u1', JSON.stringify({ username: 'alice', bio: 'one', avatar: 'a.png' })],
      ['bolt_profile:u2', JSON.stringify({ username: 'bob', bio: 'two', avatar: 'b.png' })],
    ]);
    const localStorageMock = {
      getItem: vi.fn((key: string) => backingStore.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        backingStore.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        backingStore.delete(key);
      }),
    };

    vi.stubGlobal('window', {} as any);
    vi.stubGlobal('localStorage', localStorageMock as any);

    const module = await import('~/lib/stores/profile');

    module.setActiveProfileUser('u1');
    expect(module.profileStore.get().username).toBe('alice');

    module.setActiveProfileUser('u2');
    expect(module.profileStore.get().username).toBe('bob');
  });
});