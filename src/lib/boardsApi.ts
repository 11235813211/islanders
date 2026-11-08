import type { BoardDesign, BoardLibrary } from '../../shared/maps';
import type { AccountSession } from '../../shared/types';
import { apiRequest } from './api';

/** Save one board (create or replace). Board editors only. */
export const saveBoard = (account: AccountSession | null, design: BoardDesign) =>
  apiRequest<BoardDesign>(
    `/api/boards/${encodeURIComponent(design.id)}`,
    { method: 'PUT', body: JSON.stringify(design) },
    account,
  );

export const deleteBoard = (account: AccountSession | null, id: string) =>
  apiRequest<{ ok: true }>(`/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' }, account);

/** Save categories and the order and category of every board. */
export const saveLayout = (account: AccountSession | null, library: BoardLibrary) =>
  apiRequest<BoardLibrary>(
    '/api/boards',
    {
      method: 'PUT',
      body: JSON.stringify({
        categories: library.categories,
        order: library.boards.map(b => ({ id: b.id, categoryId: b.categoryId })),
      }),
    },
    account,
  );
