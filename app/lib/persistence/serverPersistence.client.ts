export async function syncServerPersistence(payload: {
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, any>;
  customPrompt?: { enabled?: boolean; instructions?: string; mode?: 'append' | 'replace' };
  dbConfig?: { provider?: 'sqlite' | 'postgres'; postgresUrl?: string };
}) {
  try {
    await fetch('/api/persistence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // No-op by design: this is an optional persistence channel.
  }
}
