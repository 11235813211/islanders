import type { RecordInfo } from '../../shared/replay';
import type { AccountSession } from '../../shared/types';
import { apiRequest } from './api';

/** Saved game records (playtest accounts only). */
export const listRecords = (account: AccountSession | null) => apiRequest<RecordInfo[]>('/api/records', {}, account);

/** Delete one saved game record. */
export const deleteRecord = (account: AccountSession | null, id: string) =>
  apiRequest<{ ok: true }>(`/api/records/${encodeURIComponent(id)}`, { method: 'DELETE' }, account);
