import type { AccountSession } from '../../shared/types';

export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function authHeaders(account?: AccountSession | null): Record<string, string> {
  return account ? { Authorization: `Bearer ${account.username}:${account.token}` } : {};
}
export async function apiRequest<T>(path: string, options: RequestInit = {}, account?: AccountSession | null): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...authHeaders(account), ...options.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : 'The server could not complete that request.', response.status);
  return data as T;
}
export function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
