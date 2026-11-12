import { useCallback, useEffect, useState } from 'react';
import type { AccountRoomStatus, AccountSession } from '../../shared/types';
import { ApiError, apiRequest } from '../lib/api';

const ACCOUNT_KEY = 'islanders-account';
type SignInResponse = AccountSession & { recoveryCode?: string };

/** The signed-in account saved on this device, if its sign-in hasn't expired. */
export function loadAccount(): AccountSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null') as AccountSession | null;
    return value &&
      typeof value.username === 'string' &&
      typeof value.token === 'string' &&
      value.expiresAt > Date.now()
      ? value
      : null;
  } catch {
    return null;
  }
}

function clearStoredSessions(): void {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
    for (const key of Object.keys(localStorage)) if (key.startsWith('islanders:')) localStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}

/** The signed-in account (if any), its rooms, and account actions. */
export function useAccount() {
  const [account, setAccount] = useState<AccountSession | null>(loadAccount);
  const [rooms, setRooms] = useState<AccountRoomStatus[]>([]);
  const [playtest, setPlaytest] = useState(false);
  const [hasRecoveryCode, setHasRecoveryCode] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!account) {
      setRooms([]);
      setPlaytest(false);
      return;
    }
    try {
      const data = await apiRequest<{
        username: string;
        rooms: AccountRoomStatus[];
        playtest?: boolean;
        hasRecoveryCode?: boolean;
      }>('/api/accounts/me', {}, account);
      setRooms(data.rooms);
      setPlaytest(data.playtest === true);
      setHasRecoveryCode(data.hasRecoveryCode !== false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearStoredSessions();
        setAccount(null);
        setRooms([]);
      }
      setError(err instanceof Error ? err.message : 'Account could not be loaded.');
    }
  }, [account]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  function signedIn(next: SignInResponse): SignInResponse {
    const { recoveryCode: _code, ...session } = next;
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(session));
    } catch {
      /* Sign-in works for this visit. */
    }
    setAccount(session);
    setError(null);
    return next;
  }

  /** Sign in or register. A new account's response includes its one-time recovery code. */
  async function authenticate(mode: 'login' | 'register', username: string, password: string) {
    if (!window.isSecureContext) throw new Error('Use the HTTPS link to sign in on this device.');
    return signedIn(
      await apiRequest<SignInResponse>(`/api/accounts/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    );
  }

  /** Set a new password with the recovery code. Returns the replacement code. */
  async function recover(username: string, code: string, password: string) {
    if (!window.isSecureContext) throw new Error('Use the HTTPS link to reset your password.');
    return signedIn(
      await apiRequest<SignInResponse>('/api/accounts/recover', {
        method: 'POST',
        body: JSON.stringify({ username, code, password }),
      }),
    );
  }

  async function replaceRecoveryCode(password: string): Promise<string> {
    const data = await apiRequest<{ recoveryCode: string }>(
      '/api/accounts/recovery-code',
      { method: 'POST', body: JSON.stringify({ password }) },
      account,
    );
    setHasRecoveryCode(true);
    return data.recoveryCode;
  }

  async function deleteAccount(password: string): Promise<void> {
    await apiRequest('/api/accounts/delete', { method: 'POST', body: JSON.stringify({ password }) }, account);
    clearStoredSessions();
    setAccount(null);
    setRooms([]);
  }

  async function logout() {
    if (account) {
      try {
        await apiRequest('/api/accounts/logout', { method: 'POST', body: '{}' }, account);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
      }
    }
    clearStoredSessions();
    setAccount(null);
    setRooms([]);
    setPlaytest(false);
    setError(null);
  }

  return {
    account,
    rooms,
    playtest,
    hasRecoveryCode,
    error,
    refresh,
    authenticate,
    recover,
    replaceRecoveryCode,
    deleteAccount,
    logout,
  };
}
