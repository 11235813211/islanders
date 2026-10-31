import { useCallback, useEffect, useState } from 'react';
import type { AccountRoom, AccountSession } from '../../shared/types';
import { ApiError, apiRequest } from '../lib/api';

const ACCOUNT_KEY = 'islanders-account';
function loadAccount(): AccountSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null') as AccountSession | null;
    return value && typeof value.username === 'string' && typeof value.token === 'string' && value.expiresAt > Date.now() ? value : null;
  } catch { return null; }
}
export function useAccount() {
  const [account, setAccount] = useState<AccountSession | null>(loadAccount);
  const [rooms, setRooms] = useState<AccountRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!account) { setRooms([]); return; }
    try {
      const data = await apiRequest<{ username: string; rooms: AccountRoom[] }>('/api/accounts/me', {}, account);
      setRooms(data.rooms); setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        try { localStorage.removeItem(ACCOUNT_KEY); } catch { /* Storage may be disabled. */ }
        setAccount(null); setRooms([]);
      }
      setError(err instanceof Error ? err.message : 'Account could not be loaded.');
    }
  }, [account]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function authenticate(mode: 'login' | 'register', username: string, password: string) {
    if (!window.isSecureContext) throw new Error('Use the HTTPS playtest link to sign in on this device.');
    const next = await apiRequest<AccountSession>(`/api/accounts/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) });
    try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next)); } catch { /* Sign-in works for this visit. */ }
    setAccount(next); setError(null);
    return next;
  }
  async function logout() {
    if (account) {
      try { await apiRequest('/api/accounts/logout', { method: 'POST', body: '{}' }, account); }
      catch (err) { if (!(err instanceof ApiError && err.status === 401)) throw err; }
    }
    try {
      localStorage.removeItem(ACCOUNT_KEY);
      Object.keys(localStorage).filter(key => key.startsWith('islanders:')).forEach(key => localStorage.removeItem(key));
    } catch { /* Storage may be disabled. */ }
    setAccount(null); setRooms([]); setError(null);
  }
  return { account, rooms, error, refresh, authenticate, logout };
}
