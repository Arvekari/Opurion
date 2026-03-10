import { atom } from 'nanostores';

interface Profile {
  username: string;
  bio: string;
  avatar: string;
}

const LEGACY_PROFILE_STORAGE_KEY = 'bolt_profile';
const ACTIVE_PROFILE_STORAGE_KEY = 'bolt_active_profile_key';
const GUEST_PROFILE_KEY = 'bolt_profile:guest';

const DEFAULT_PROFILE: Profile = {
  username: '',
  bio: '',
  avatar: '',
};

let activeProfileStorageKey = GUEST_PROFILE_KEY;

function readProfile(storageKey: string): Profile {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PROFILE };
  }

  const raw = localStorage.getItem(storageKey);

  if (!raw) {
    return { ...DEFAULT_PROFILE };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Profile>;

    return {
      username: parsed.username || '',
      bio: parsed.bio || '',
      avatar: parsed.avatar || '',
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function getProfileStorageKeyForUser(userId?: string | null): string {
  return userId ? `bolt_profile:${userId}` : GUEST_PROFILE_KEY;
}

export function setActiveProfileUser(userId?: string | null) {
  activeProfileStorageKey = getProfileStorageKeyForUser(userId);

  if (typeof window === 'undefined') {
    profileStore.set({ ...DEFAULT_PROFILE });
    return;
  }

  // One-time migration of pre-multi-user profile storage.
  if (userId && !localStorage.getItem(activeProfileStorageKey)) {
    const legacyRaw = localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY);

    if (legacyRaw) {
      localStorage.setItem(activeProfileStorageKey, legacyRaw);
    }
  }

  localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeProfileStorageKey);
  profileStore.set(readProfile(activeProfileStorageKey));
}

const initialProfile = readProfile(activeProfileStorageKey);

export const profileStore = atom<Profile>(initialProfile);

export const updateProfile = (updates: Partial<Profile>) => {
  profileStore.set({ ...profileStore.get(), ...updates });

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    const serialized = JSON.stringify(profileStore.get());
    localStorage.setItem(activeProfileStorageKey, serialized);
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeProfileStorageKey);
  }
};
