import { useMemo, useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { profileStore } from '~/lib/stores/profile';
import { ModelSelector } from '~/components/chat/ModelSelector';
import { getApiKeysFromCookies } from '~/components/chat/APIKeyManager';
import { PROVIDER_LIST } from '~/utils/constants';
import type { ProviderInfo } from '~/types/model';
import type { ModelInfo } from '~/lib/modules/llm/types';

function getInitials(name?: string): string {
  if (!name) {
    return 'G';
  }

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export function Header() {
  const chat = useStore(chatStore);
  const profile = useStore(profileStore);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<ProviderInfo | undefined>(undefined);
  const [model, setModel] = useState<string | undefined>(undefined);
  const [modelList, setModelList] = useState<ModelInfo[]>([]);
  const [modelLoading, setModelLoading] = useState<string | undefined>('all');

  useEffect(() => {
    const keys = getApiKeysFromCookies();
    setApiKeys(keys);

    const savedProviderName = getCookieValue('selectedProvider');
    const savedModel = getCookieValue('selectedModel');
    const initialProvider = (PROVIDER_LIST.find((entry) => entry.name === savedProviderName) || PROVIDER_LIST[0]) as
      | ProviderInfo
      | undefined;

    setProvider(initialProvider);
    setModel(savedModel);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setModelLoading('all');
    fetch('/api/models')
      .then((response) => response.json())
      .then((data) => setModelList((data as { modelList: ModelInfo[] }).modelList || []))
      .catch((error) => console.error('Failed to fetch model list for header toolbar:', error))
      .finally(() => setModelLoading(undefined));
  }, []);

  const availableProviders = useMemo(() => {
    return (PROVIDER_LIST as ProviderInfo[]).filter((entry) => {
      const configured = apiKeys[entry.name];
      return typeof configured === 'string' && configured.trim().length > 0;
    });
  }, [apiKeys]);

  const availableModels = useMemo(() => {
    const providerSet = new Set(availableProviders.map((entry) => entry.name));
    return modelList.filter((entry) => providerSet.has(entry.provider));
  }, [modelList, availableProviders]);

  useEffect(() => {
    if (!provider && availableProviders.length > 0) {
      setProvider(availableProviders[0]);
      return;
    }

    if (provider && !availableProviders.some((entry) => entry.name === provider.name)) {
      setProvider(availableProviders[0]);
    }
  }, [provider, availableProviders]);

  useEffect(() => {
    if (!provider) {
      return;
    }

    const providerModels = availableModels.filter((entry) => entry.provider === provider.name);

    if (providerModels.length > 0 && !providerModels.some((entry) => entry.name === model)) {
      setModel(providerModels[0].name);
    }
  }, [provider, model, availableModels]);

  useEffect(() => {
    if (!provider || !model || typeof window === 'undefined') {
      return;
    }

    document.cookie = `selectedProvider=${provider.name}; path=/; max-age=${60 * 60 * 24 * 30}`;
    document.cookie = `selectedModel=${model}; path=/; max-age=${60 * 60 * 24 * 30}`;

    window.dispatchEvent(
      new CustomEvent('bolt:model-selection-changed', {
        detail: { providerName: provider.name, model },
      }),
    );
  }, [provider, model]);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-bolt-elements-borderColor': true,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer shrink-0">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-bolt:logo-text?mask w-[46px] inline-block" /> */}
          <img src="/logo.svg" alt="Bolt2.dyi" className="h-7 w-auto inline-block" />
        </a>
      </div>

      <div className="flex-1 px-4 min-w-0">
        <ClientOnly>
          {() => (
            <div className="w-full max-w-5xl mx-auto flex items-center gap-3 min-w-0">
              <div className="hidden lg:flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2.5 py-1 text-xs text-bolt-elements-textSecondary">
                <span className="i-ph:circles-four h-3.5 w-3.5" />
                Workspace
              </div>

              <div className="min-w-0 flex-1">
                <ModelSelector
                  key={`${provider?.name || 'none'}:${availableModels.length}`}
                  model={model}
                  setModel={setModel}
                  modelList={availableModels}
                  provider={provider}
                  setProvider={setProvider}
                  providerList={availableProviders}
                  apiKeys={apiKeys}
                  modelLoading={modelLoading}
                />
              </div>

              {!chat.started && (
                <span className="hidden xl:block truncate text-xs text-bolt-elements-textTertiary">
                  <ChatDescription />
                </span>
              )}
            </div>
          )}
        </ClientOnly>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <ClientOnly>{() => <HeaderActionButtons chatStarted={chat.started} />}</ClientOnly>
        <div className="flex items-center gap-2 rounded-full border border-bolt-elements-borderColor px-2 py-1">
          <div className="flex items-center justify-center w-7 h-7 overflow-hidden bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary rounded-full">
            {profile?.avatar ? (
              <img src={profile.avatar} alt={profile?.username || 'User'} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-semibold leading-none">{getInitials(profile?.username)}</span>
            )}
          </div>
          <span className="text-xs text-bolt-elements-textSecondary max-w-28 truncate">
            {profile?.username || 'Guest User'}
          </span>
        </div>
      </div>
    </header>
  );
}

function getCookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const pair = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}
