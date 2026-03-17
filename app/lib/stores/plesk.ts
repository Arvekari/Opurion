import { atom } from 'nanostores';
import type { PleskConnection } from '~/types/plesk';

const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('plesk_connection') : null;

const initialConnection: PleskConnection = storedConnection
  ? JSON.parse(storedConnection)
  : {
      user: null,
      token: '',
      host: '',
      rootPath: '/httpdocs',
      stats: undefined,
    };

export const pleskConnection = atom<PleskConnection>(initialConnection);

export function updatePleskConnection(updates: Partial<PleskConnection>) {
  const currentState = pleskConnection.get();
  const nextState = { ...currentState, ...updates };
  pleskConnection.set(nextState);

  if (typeof window !== 'undefined') {
    localStorage.setItem('plesk_connection', JSON.stringify(nextState));
  }
}

export function clearPleskConnection() {
  const cleared: PleskConnection = {
    user: null,
    token: '',
    host: '',
    rootPath: '/httpdocs',
    stats: undefined,
  };

  pleskConnection.set(cleared);

  if (typeof window !== 'undefined') {
    localStorage.removeItem('plesk_connection');
  }
}
