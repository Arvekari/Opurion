import { atom } from 'nanostores';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import type { ProviderInfo } from '~/types/model';
import type { ModelInfo } from '~/lib/modules/llm/types';
import Cookies from 'js-cookie';

function readSavedProvider(): ProviderInfo {
  const saved = Cookies.get('selectedProvider');
  return (PROVIDER_LIST.find((p) => p.name === saved) || DEFAULT_PROVIDER) as ProviderInfo;
}

function readSavedModel(): string {
  return Cookies.get('selectedModel') || DEFAULT_MODEL;
}

/** Currently selected provider — shared between Header and Chat */
export const selectedProviderStore = atom<ProviderInfo>(readSavedProvider());

/** Currently selected model name — shared between Header and Chat */
export const selectedModelStore = atom<string>(readSavedModel());

/** Available (configured) providers — populated by BaseChat after API key check */
export const availableProvidersStore = atom<ProviderInfo[]>([]);

/** Available models for the selected provider — populated by BaseChat */
export const availableModelsStore = atom<ModelInfo[]>([]);

export function setSelectedProvider(provider: ProviderInfo) {
  selectedProviderStore.set(provider);
  Cookies.set('selectedProvider', provider.name);
}

export function setSelectedModel(model: string) {
  selectedModelStore.set(model);
  Cookies.set('selectedModel', model);
}
