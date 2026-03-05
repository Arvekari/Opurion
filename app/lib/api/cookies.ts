export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  // Split the cookie string by semicolons and spaces
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      // Decode the name and value, and join value parts in case it contains '='
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  const cookies = parseCookies(cookieHeader);
  return cookies.apiKeys ? JSON.parse(cookies.apiKeys) : {};
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  const cookies = parseCookies(cookieHeader);
  return cookies.providers ? JSON.parse(cookies.providers) : {};
}

export function getCustomPromptFromCookie(cookieHeader: string | null): {
  enabled: boolean;
  instructions: string;
  mode: 'append' | 'replace';
} {
  const cookies = parseCookies(cookieHeader);

  if (!cookies.customPrompt) {
    return { enabled: false, instructions: '', mode: 'append' };
  }

  try {
    const parsed = JSON.parse(cookies.customPrompt);
    return {
      enabled: !!parsed?.enabled,
      instructions: typeof parsed?.instructions === 'string' ? parsed.instructions : '',
      mode: parsed?.mode === 'replace' ? 'replace' : 'append',
    };
  } catch {
    return { enabled: false, instructions: '', mode: 'append' };
  }
}

export function getDbConfigFromCookie(cookieHeader: string | null): {
  provider: 'sqlite' | 'postgres';
  postgresUrl: string;
} {
  const cookies = parseCookies(cookieHeader);

  if (!cookies.dbConfig) {
    return { provider: 'sqlite', postgresUrl: '' };
  }

  try {
    const parsed = JSON.parse(cookies.dbConfig);
    return {
      provider: parsed?.provider === 'postgres' ? 'postgres' : 'sqlite',
      postgresUrl: typeof parsed?.postgresUrl === 'string' ? parsed.postgresUrl : '',
    };
  } catch {
    return { provider: 'sqlite', postgresUrl: '' };
  }
}

export function getUserIdFromCookie(cookieHeader: string | null): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies.bolt_uid || null;
}

export async function resolveApiKeys(
  cookieHeader: string | null,
  env?: Record<string, any>,
): Promise<Record<string, string>> {
  const cookieApiKeys = getApiKeysFromCookie(cookieHeader);
  const userId = getUserIdFromCookie(cookieHeader);

  const { readPersistedMemory, readPersistedMemoryForUser, upsertPersistedMemory, upsertPersistedMemoryForUser } =
    await import('../.server/persistence');
  const persisted = userId ? await readPersistedMemoryForUser(userId, env) : await readPersistedMemory(env);
  const persistedApiKeys = (persisted?.apiKeys ?? {}) as Record<string, string>;
  const merged = { ...persistedApiKeys, ...cookieApiKeys };

  if (Object.keys(merged).length > 0) {
    if (userId) {
      await upsertPersistedMemoryForUser(userId, { apiKeys: merged }, env);
    } else {
      await upsertPersistedMemory({ apiKeys: merged }, env);
    }
  }

  return merged;
}

export async function resolveProviderSettings(
  cookieHeader: string | null,
  env?: Record<string, any>,
): Promise<Record<string, any>> {
  const cookieProviders = getProviderSettingsFromCookie(cookieHeader);
  const userId = getUserIdFromCookie(cookieHeader);

  const { readPersistedMemory, readPersistedMemoryForUser, upsertPersistedMemory, upsertPersistedMemoryForUser } =
    await import('../.server/persistence');
  const persisted = userId ? await readPersistedMemoryForUser(userId, env) : await readPersistedMemory(env);
  const persistedProviders = persisted?.providerSettings ?? {};
  const merged = { ...persistedProviders, ...cookieProviders };

  if (Object.keys(merged).length > 0) {
    if (userId) {
      await upsertPersistedMemoryForUser(userId, { providerSettings: merged }, env);
    } else {
      await upsertPersistedMemory({ providerSettings: merged }, env);
    }
  }

  return merged;
}

export async function resolveCustomPrompt(
  cookieHeader: string | null,
  env?: Record<string, any>,
): Promise<{ enabled: boolean; instructions: string; mode: 'append' | 'replace' }> {
  const cookieCustomPrompt = getCustomPromptFromCookie(cookieHeader);
  const userId = getUserIdFromCookie(cookieHeader);

  const { readPersistedMemory, readPersistedMemoryForUser, upsertPersistedMemory, upsertPersistedMemoryForUser } =
    await import('../.server/persistence');
  const persisted = userId ? await readPersistedMemoryForUser(userId, env) : await readPersistedMemory(env);
  const persistedMode = (persisted?.customPrompt as { mode?: 'append' | 'replace' } | undefined)?.mode;
  const mode: 'append' | 'replace' = cookieCustomPrompt.mode === 'replace' || persistedMode === 'replace' ? 'replace' : 'append';
  const merged = {
    enabled: cookieCustomPrompt.enabled || !!persisted?.customPrompt?.enabled,
    instructions: cookieCustomPrompt.instructions || persisted?.customPrompt?.instructions || '',
    mode,
  };

  if (merged.enabled || merged.instructions) {
    if (userId) {
      await upsertPersistedMemoryForUser(userId, { customPrompt: merged }, env);
    } else {
      await upsertPersistedMemory({ customPrompt: merged }, env);
    }
  }

  return merged;
}

export async function resolveDbConfig(
  cookieHeader: string | null,
  env?: Record<string, any>,
): Promise<{ provider: 'sqlite' | 'postgres'; postgresUrl: string }> {
  const cookieDbConfig = getDbConfigFromCookie(cookieHeader);
  const userId = getUserIdFromCookie(cookieHeader);

  const { readPersistedMemory, readPersistedMemoryForUser, upsertPersistedMemory, upsertPersistedMemoryForUser } =
    await import('../.server/persistence');
  const persisted = userId ? await readPersistedMemoryForUser(userId, env) : await readPersistedMemory(env);
  const merged = {
    provider: cookieDbConfig.provider || persisted?.dbConfig?.provider || 'sqlite',
    postgresUrl: cookieDbConfig.postgresUrl || persisted?.dbConfig?.postgresUrl || '',
  } as const;

  if (userId) {
    await upsertPersistedMemoryForUser(userId, { dbConfig: merged }, env);
  } else {
    await upsertPersistedMemory({ dbConfig: merged }, env);
  }

  return merged;
}
