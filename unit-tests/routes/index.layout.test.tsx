/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Index from '../../app/routes/_index';

vi.mock('@remix-run/cloudflare', () => ({
  json: (value: unknown) => value,
}));

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: any) => (typeof children === 'function' ? children() : children ?? null),
}));

vi.mock('../../app/components/sidebar/Menu.client', () => ({
  Menu: () => <nav data-testid="menu">menu</nav>,
}));

vi.mock('../../app/components/header/Header', () => ({
  Header: () => <header data-testid="header">header</header>,
}));

vi.mock('../../app/components/auth/AuthGate', () => ({
  AuthGate: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../app/components/chat/Chat.client', () => ({
  Chat: () => <section data-testid="chat">chat</section>,
}));

vi.mock('../../app/components/chat/BaseChat', () => ({
  BaseChat: () => <section data-testid="basechat-fallback">fallback</section>,
}));

vi.mock('../../app/components/@settings/core/ControlPanel', () => ({
  ControlPanel: () => <aside data-testid="control-panel">settings</aside>,
}));

describe('app/routes/_index.tsx layout', () => {
  it('renders sidebar, header, and right-panel main chat area', () => {
    render(<Index />);

    expect(screen.getByTestId('menu')).toBeTruthy();
    expect(screen.getByTestId('header')).toBeTruthy();
    expect(screen.getByTestId('chat')).toBeTruthy();

    const main = screen.getByRole('main');
    expect(main).toBeTruthy();
    expect((main as HTMLElement).style.display).toBe('flex');
    expect((main as HTMLElement).style.flexDirection).toBe('column');
  });

  it('keeps settings panel closed by default', () => {
    render(<Index />);

    expect(screen.queryByTestId('control-panel')).toBeNull();
  });

  it('sets scalable sidebar-aware 20/80 workbench split with 500 px r1 floor', () => {
    render(<Index />);

    const appShell = document.querySelector('.app-shell') as HTMLElement;
    expect(appShell).toBeTruthy();
    expect(appShell.style.getPropertyValue('--sidebar-width')).toBe('260px');
    // Workbench is 80 % of available space, but capped so r1 keeps at least 500 px.
    expect(appShell.style.getPropertyValue('--workbench-width')).toBe(
      'min(calc((100vw - var(--sidebar-width)) * 0.8), calc(100vw - var(--sidebar-width) - 500px))',
    );
    // Workbench starts at the point where r1 ends: viewport minus workbench width.
    expect(appShell.style.getPropertyValue('--workbench-left')).toBe('calc(100vw - var(--workbench-width))');
    expect(appShell.style.getPropertyValue('--workbench-inner-width')).toBe('var(--workbench-width)');
  });
});
