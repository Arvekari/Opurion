import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import {
  selectedProviderStore,
  selectedModelStore,
  availableProvidersStore,
  availableModelsStore,
  setSelectedProvider,
  setSelectedModel,
} from '~/lib/stores/model';
import { workbenchStore } from '~/lib/stores/workbench';
import { PROVIDER_LIST } from '~/utils/constants';
import type { ProviderInfo } from '~/types/model';

const selectStyle: React.CSSProperties = {
  background: 'var(--bolt-elements-background-depth-2)',
  color: 'var(--bolt-elements-textPrimary)',
  border: '1px solid var(--bolt-elements-borderColor)',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '13px',
  cursor: 'pointer',
  outline: 'none',
  maxWidth: '160px',
};

export function Header() {
  const chat = useStore(chatStore);
  const provider = useStore(selectedProviderStore);
  const model = useStore(selectedModelStore);
  const availableProviders = useStore(availableProvidersStore);
  const availableModels = useStore(availableModelsStore);
  const showWorkbench = useStore(workbenchStore.showWorkbench);

  const providerList: ProviderInfo[] =
    availableProviders.length > 0 ? availableProviders : (PROVIDER_LIST as unknown as ProviderInfo[]);
  const modelList = availableModels.filter((m) => m.provider === provider?.name);

  return (
    <header
      style={{
        gridColumn: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderBottom: '1px solid var(--bolt-elements-borderColor)',
        background: 'var(--bolt-elements-sidebar-background)',
        height: '60px',
        minHeight: '60px',
        color: 'var(--bolt-elements-textPrimary)',
        overflow: 'hidden',
        gap: '12px',
      }}
    >
      {/* Left: chat title/topic */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, overflow: 'hidden', flex: 1 }}>
        <ClientOnly>
          {() => (
            <span
              style={{
                fontSize: '14px',
                color: 'var(--bolt-elements-textPrimary)',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {chat.started ? <ChatDescription /> : 'New chat'}
            </span>
          )}
        </ClientOnly>
      </div>

      {/* Center: provider + model selects */}
      <ClientOnly>
        {() => (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <select
              value={provider?.name ?? ''}
              onChange={(e) => {
                const p = providerList.find((x) => x.name === e.target.value);
                if (p) setSelectedProvider(p);
              }}
              style={selectStyle}
              title="Provider"
            >
              {providerList.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>

            <select
              value={model ?? ''}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={selectStyle}
              title="Model"
              disabled={modelList.length === 0}
            >
              {modelList.length === 0 ? (
                <option value={model}>{model}</option>
              ) : (
                modelList.map((m) => (
                  <option key={m.name} value={m.name}>{m.label || m.name}</option>
                ))
              )}
            </select>

            <button
              onClick={() => workbenchStore.setShowWorkbench(!showWorkbench)}
              title={showWorkbench ? 'Hide Workbench' : 'Show Workbench'}
              style={{
                ...selectStyle,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                maxWidth: 'none',
              }}
            >
              <span className="i-ph:layout-duotone" aria-hidden="true" />
              <span>Workbench</span>
            </button>
          </div>
        )}
      </ClientOnly>

      {/* Right: action buttons */}
      <ClientOnly>{() => <HeaderActionButtons chatStarted={chat.started} />}</ClientOnly>
    </header>
  );
}
