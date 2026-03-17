/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nanostores/react', () => ({
  useStore: (store: any) => (store && typeof store.get === 'function' ? store.get() : store),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    previews: {
      get: () => [],
    },
  },
}));

vi.mock('~/components/deploy/DeployButton', () => ({
  DeployButton: () => <div>Deploy</div>,
}));

import { HeaderActionButtons } from '~/components/header/HeaderActionButtons.client';

describe('components/header/HeaderActionButtons.client.tsx', () => {
  it('keeps debug tools visible when chat has started even without an active preview', () => {
    render(<HeaderActionButtons chatStarted />);

    expect(screen.getByText('Report Bug')).toBeTruthy();
    expect(screen.getByText('Debug Log')).toBeTruthy();
    expect(screen.queryByText('Deploy')).toBeNull();
  });
});