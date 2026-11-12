import { Bot, Database, Trash2, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { RecordInfo } from '../../shared/replay';
import type { AccountSession } from '../../shared/types';
import { deleteRecord, listRecords } from '../lib/recordsApi';

/** Who sat at a recorded table: bot levels, or "person". */
function Seats({ seats }: { seats: RecordInfo['seats'] }) {
  return (
    <span className="saved-seats">
      {seats.map((level, i) => (
        <span key={i} title={level ? `${level} bot` : 'Person'}>
          {level ? <Bot size={14} /> : <User size={14} />}
        </span>
      ))}
    </span>
  );
}

/**
 * Games saved for bot training, newest first, for playtest accounts to review and delete (for
 * example a test game that shouldn't train the bots).
 */
export default function SavedGames({ account }: { account: AccountSession | null }) {
  const [records, setRecords] = useState<RecordInfo[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRecords([...(await listRecords(account))].reverse());
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [account]);
  useEffect(() => {
    void load();
  }, [load]);
  const remove = async (record: RecordInfo) => {
    if (!confirm(`Delete the game saved ${new Date(record.endedAt).toLocaleString()}? This can't be undone.`)) return;
    setBusy(record.id);
    try {
      await deleteRecord(account, record.id);
      setRecords(list => list?.filter(item => item.id !== record.id) ?? null);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="panel saved-games">
      <div className="section-heading">
        <h2>
          <Database size={18} /> Saved games
        </h2>
        <button className="text-button" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error && <p className="inline-alert">{error}</p>}
      {records && !records.length && <p>No saved games.</p>}
      {records && records.length > 0 && (
        <ul>
          {records.map(record => (
            <li key={record.id}>
              <span className="saved-when">{new Date(record.endedAt).toLocaleString()}</span>
              <Seats seats={record.seats} />
              <span className="saved-turns">{record.turns} turns</span>
              <button
                className="icon-button"
                aria-label={`Delete saved game ${record.id}`}
                disabled={busy === record.id}
                onClick={() => void remove(record)}
              >
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
