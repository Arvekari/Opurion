import { useEffect, useMemo, useState } from 'react';

export type SetupDbProvider = 'sqlite' | 'postgres';

export function buildSetupDbConfig(input: { provider: SetupDbProvider; postgresUrl: string }) {
  if (input.provider === 'postgres' && input.postgresUrl.trim()) {
    return {
      provider: 'postgres' as const,
      postgresUrl: input.postgresUrl.trim(),
    };
  }

  return {
    provider: 'sqlite' as const,
    postgresUrl: '',
  };
}

type SessionResponse = {
  authenticated: boolean;
  requireSignup: boolean;
  user: {
    id: string;
    username: string;
    isAdmin: boolean;
  } | null;
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [dbProvider, setDbProvider] = useState<SetupDbProvider>('sqlite');
  const [postgresUrl, setPostgresUrl] = useState('');
  const [savingSetup, setSavingSetup] = useState(false);

  const loadSession = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/auth/session');
      const data = (await response.json()) as SessionResponse;
      setSession(data);
      setIsSignupMode(data.requireSignup);
      setSetupComplete(!data.requireSignup);
    } catch {
      setSession({ authenticated: false, requireSignup: true, user: null });
      setIsSignupMode(true);
      setSetupComplete(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  const title = useMemo(() => {
    if (session?.requireSignup || isSignupMode) {
      return 'Create your account';
    }

    return 'Sign in required';
  }, [session, isSignupMode]);

  const saveSetup = async () => {
    if (dbProvider === 'sqlite') {
      setError(null);
      setSetupComplete(true);

      return;
    }

    setSavingSetup(true);
    setError(null);

    try {
      const dbConfig = buildSetupDbConfig({
        provider: dbProvider,
        postgresUrl,
      });

      const response = await fetch('/api/persistence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dbConfig }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Failed to save setup configuration.');

        return;
      }

      setSetupComplete(true);
    } catch {
      setError('Failed to save setup configuration.');
    } finally {
      setSavingSetup(false);
    }
  };

  const submit = async () => {
    if (isSignupMode && session?.requireSignup && !setupComplete) {
      setError('Complete database setup before creating the first account.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const endpoint = isSignupMode ? '/api/auth/signup' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }

      await loadSession();
      setPassword('');
    } catch {
      setError('Network error during authentication.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-bolt-elements-textSecondary">Loading session…</div>
    );
  }

  if (session?.authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-xl p-5 flex flex-col gap-3">
        <img src="/logo.svg" alt="Bolt2.dyi" className="h-10 w-auto self-start" />
        <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">{title}</h2>
        <p className="text-sm text-bolt-elements-textSecondary">
          {isSignupMode
            ? 'First use requires creating an account. Your settings and memory will be stored under this account.'
            : 'Sign in to access your personal settings and chat memory.'}
        </p>

        {isSignupMode && session?.requireSignup && !setupComplete && (
          <div className="p-3 rounded bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor flex flex-col gap-2">
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">
              Setup database before account creation
            </h3>
            <p className="text-xs text-bolt-elements-textSecondary">
              Choose database mode now. If PostgreSQL/PostgREST is not provided, the app uses SQLite automatically.
            </p>

            <select
              value={dbProvider}
              onChange={(e) => setDbProvider((e.target.value as SetupDbProvider) || 'sqlite')}
              className="w-full p-2 rounded bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
            >
              <option value="sqlite">SQLite (recommended)</option>
              <option value="postgres">PostgreSQL + PostgREST</option>
            </select>

            {dbProvider === 'postgres' && (
              <input
                value={postgresUrl}
                onChange={(e) => setPostgresUrl(e.target.value)}
                placeholder="PostgreSQL URL (optional: empty => fallback to SQLite)"
                className="w-full p-2 rounded bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
              />
            )}

            <button
              onClick={() => void saveSetup()}
              disabled={savingSetup}
              className="w-full p-2 rounded bg-purple-500/20 text-purple-500 hover:bg-purple-500/30 disabled:opacity-60"
            >
              {savingSetup ? 'Saving setup…' : 'Continue to account creation'}
            </button>
          </div>
        )}

        {!session?.requireSignup && (
          <div className="flex gap-2 text-xs">
            <button
              className={`px-2 py-1 rounded ${!isSignupMode ? 'bg-purple-500/20 text-purple-500' : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary'}`}
              onClick={() => setIsSignupMode(false)}
            >
              Sign in
            </button>
            <button
              className={`px-2 py-1 rounded ${isSignupMode ? 'bg-purple-500/20 text-purple-500' : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary'}`}
              onClick={() => setIsSignupMode(true)}
            >
              Create account
            </button>
          </div>
        )}

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full p-2 rounded bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          className="w-full p-2 rounded bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
        />

        {error && <div className="text-sm text-red-500">{error}</div>}

        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="w-full p-2 rounded bg-purple-500/20 text-purple-500 hover:bg-purple-500/30 disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : isSignupMode ? 'Create account' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
