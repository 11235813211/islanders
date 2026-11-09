import { BarChart3, ChevronDown, ChevronUp, MessageCircle, ScrollText, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type GameAction, type GameView, RESOURCES } from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { cardStyle, RESOURCE_LABELS } from '../ResourceHand';

export type PanelTab = 'chat' | 'activity' | 'dice';

export function DiceTracker({ view }: { view: GameView }) {
  const counts = Object.values(view.diceCounts);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);
  const shown = view.settings.trackDice || view.phase === 'finished';
  return (
    <div className="compact-tracker">
      <p>
        {total} {total === 1 ? 'roll' : 'rolls'}
      </p>
      {shown ? (
        <div className="dice-chart" role="img" aria-label="Dice results histogram">
          {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
            <div key={n}>
              <span>{view.diceCounts[n] ?? 0}</span>
              <i style={{ height: `${Math.max(2, ((view.diceCounts[n] ?? 0) / max) * 90)}px` }} />
              <strong>{n}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>Tracking is off.</p>
      )}
    </div>
  );
}

/** Cards left in the bank, when the room shows them. */
export function BankCounts({ view }: { view: GameView }) {
  const counts = view.bankCounts;
  if (!counts) return null;
  return (
    <div className="bank-counts" role="group" aria-label="Cards left in the bank">
      <span>Bank</span>
      {RESOURCES.map(r => (
        <span
          key={r}
          className="bank-count"
          style={cardStyle(r)}
          role="img"
          aria-label={`${counts[r]} ${RESOURCE_LABELS[r]}`}
        >
          <ResourceIcon resource={r} size={18} />
          {counts[r]}
        </span>
      ))}
    </div>
  );
}

/** Chat, activity log, and dice tabs. Collapses to just its header. */
export default function TablePanel({
  view,
  busy,
  send,
  panel,
  setPanel,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
  panel: PanelTab | null;
  setPanel: (tab: PanelTab | null) => void;
}) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const lastChat = view.chat.at(-1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a message arrives or the tab opens.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [lastChat?.id, panel]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear the box once our own message comes back.
  useEffect(() => {
    if (lastChat?.senderId === view.selfId && lastChat.text === text.trim()) setText('');
  }, [lastChat?.id, view.selfId]);
  const tabs = [
    { id: 'chat', Icon: MessageCircle },
    { id: 'activity', Icon: ScrollText },
    { id: 'dice', Icon: BarChart3 },
  ] as const;
  return (
    <section className={`chat-panel ${panel ? 'is-open' : ''}`} aria-label="Room conversation">
      <header>
        <div className="panel-tabs">
          {tabs.map(({ id, Icon }) => (
            <button
              key={id}
              aria-label={id}
              aria-pressed={panel === id}
              className={panel === id ? 'selected' : ''}
              onClick={() => setPanel(panel === id ? null : id)}
            >
              <Icon size={17} />
              <span>{id}</span>
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label={panel ? 'Collapse chat panel' : 'Expand chat panel'}
          onClick={() => setPanel(panel ? null : 'chat')}
        >
          {panel ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>
      </header>
      {panel && (
        <div className="panel-body">
          {panel === 'chat' ? (
            <>
              <div className="chat-messages" role="log" aria-live="polite">
                {view.chat.length ? (
                  view.chat.map(m => (
                    <p key={m.id}>
                      <strong>
                        {m.name}
                        {m.spectator ? ' · watching' : ''}
                      </strong>
                      <span>{m.text}</span>
                    </p>
                  ))
                ) : (
                  <p className="chat-empty">Room chat. Only people with this code can join.</p>
                )}
                <div ref={end} />
              </div>
              <form
                className="chat-form"
                onSubmit={e => {
                  e.preventDefault();
                  if (text.trim()) send({ type: 'chat', text: text.trim() });
                }}
              >
                <input
                  aria-label="Chat message"
                  placeholder="Message the room…"
                  maxLength={280}
                  enterKeyHint="send"
                  value={text}
                  onChange={e => setText(e.target.value)}
                />
                <button aria-label="Send message" className="icon-button" disabled={busy || !text.trim()}>
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : panel === 'activity' ? (
            <ol className="activity-list">
              {[...view.log].reverse().map(e => (
                <li key={e.id}>{e.text}</li>
              ))}
            </ol>
          ) : (
            <>
              <BankCounts view={view} />
              <DiceTracker view={view} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
