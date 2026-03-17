import { atom } from 'nanostores';
import type { CPanelConnection } from '~/types/cpanel';

const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('cpanel_connection') : null;

const initialConnection: CPanelConnection = storedConnection
  ? JSON.parse(storedConnection)
  : {
      user: null,
      token: '',
      host: '',
      username: '',
      rootPath: '/public_html',
      stats: undefined,
    };

export const cpanelConnection = atom<CPanelConnection>(initialConnection);

export function updateCpanelConnection(updates: Partial<CPanelConnection>) {
  const currentState = cpanelConnection.get();
  const nextState = { ...currentState, ...updates };
  cpanelConnection.set(nextState);

  if (typeof window !== 'undefined') {
    localStorage.setItem('cpanel_connection', JSON.stringify(nextState));
  }
}

export function clearCpanelConnection() {
  const cleared: CPanelConnection = {
    user: null,
    token: '',
    host: '',
    username: '',
    rootPath: '/public_html',
    stats: undefined,
  };

  cpanelConnection.set(cleared);

  if (typeof window !== 'undefined') {
    localStorage.removeItem('cpanel_connection');
  }
}
