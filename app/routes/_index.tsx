import { useState } from 'react';
import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { Menu } from '~/components/sidebar/Menu.client';
import { AuthGate } from '~/components/auth/AuthGate';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';

export const meta: MetaFunction = () => {
  return [{ title: 'bolt2.dyi' }, { name: 'description', content: 'AI workspace' }];
};

export const loader = () => json({});

export default function Index() {
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'settings'>('profile');

  return (
    <div
      className="app-shell"
      style={{
        ['--sidebar-width' as any]: collapsed ? '70px' : '260px',
        // Workbench width is 80 % of available space but may not leave r1 with less than 500 px.
        ['--workbench-width' as any]:
          'min(calc((100vw - var(--sidebar-width)) * 0.8), calc(100vw - var(--sidebar-width) - 500px))',
        // r1 right edge = total viewport minus workbench width
        ['--workbench-left' as any]: 'calc(100vw - var(--workbench-width))',
        ['--workbench-inner-width' as any]: 'var(--workbench-width)',
        display: 'grid',
        gridTemplateColumns: collapsed ? '70px 1fr' : '260px 1fr',
        gridTemplateRows: '60px 1fr',
        height: '100vh',
        transition: 'grid-template-columns .25s',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar — spans both rows */}
      <ClientOnly fallback={<div style={{ gridRow: '1 / span 2', background: '#121216' }} />}>
        {() => <Menu collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} onOpenSettings={(tab = 'profile') => { setSettingsTab(tab); setSettingsOpen(true); }} />}
      </ClientOnly>

      {/* Topbar */}
      <div style={{ gridColumn: 2, gridRow: 1 }}>
        <Header />
      </div>

      {/* Main content */}
      <main
        style={{
          gridColumn: 2,
          gridRow: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          minHeight: 0,
          minWidth: 0,
          position: 'relative',
        }}
      >
        <AuthGate>
          <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
        </AuthGate>
        {/* Settings panel — rendered only when open and positioned absolutely */}
        {settingsOpen && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1000 }}>
            <ClientOnly>
              {() => <ControlPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={settingsTab} />}
            </ClientOnly>
          </div>
        )}
      </main>
    </div>
  );
}
