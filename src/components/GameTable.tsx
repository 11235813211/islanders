import { ArrowRight, Clock3, Dices, Eye, Trophy, Undo2 } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { playerVars } from '../../shared/colors';
import { isBotGame } from '../../shared/settings';
import type { DevelopmentType, GameView } from '../../shared/types';
import type { useRoom } from '../hooks/useRoom';
import { useTurnAlerts } from '../hooks/useTurnAlerts';
import BoardViewport from './BoardViewport';
import BuildBar, { type BuildKind } from './game/BuildBar';
import DevelopmentDialog from './game/DevelopmentDialog';
import DevelopmentHand from './game/DevelopmentHand';
import EndGame from './game/EndGame';
import LeaveDialog from './game/LeaveDialog';
import { DiscardPanel, PausedNotice, ProposalNotice, StealChooser } from './game/Overlays';
import PlayerPanel from './game/PlayerPanel';
import TablePanel, { type PanelTab } from './game/TablePanel';
import TableToolbar from './game/TableToolbar';
import ResourceHand from './ResourceHand';
import TradeComposer, { addTradeResource, counterDraft, type TradeDraft, TradeNotice } from './TradePanel';
import './GameTable.css';
import './game/game.css';
import './game/phone.css';

function Dice({ dice }: { dice: [number, number] | null }) {
  return (
    <span className="compact-dice" role="img" aria-label={dice ? `Dice total ${dice[0] + dice[1]}` : 'Not rolled'}>
      {dice ? dice.map((n, i) => <span key={i}>{['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n]}</span>) : <Dices size={25} />}
    </span>
  );
}

function instructionFor(view: GameView, ownTurn: boolean, rollIn: number | null): string {
  const active = view.players.find(p => p.id === view.activePlayerId);
  if (view.pausedAt !== null) return 'Game paused';
  switch (view.phase) {
    case 'finished': {
      const winner = view.players.find(p => p.id === view.winnerId);
      return winner ? `${winner.name} wins!` : 'Game over';
    }
    case 'setup-settlement':
      return 'Placing settlement…';
    case 'setup-road':
      return 'Placing road…';
    case 'free-roads':
      return 'Placing free roads…';
    case 'roll':
      return `Roll dice${rollIn === null ? '' : ` · auto ${rollIn}s`}`;
    case 'robber':
      return 'Moving robber…';
    case 'steal':
      return 'Choosing a player…';
    case 'discard':
      return 'Discarding resources…';
    default:
      return ownTurn ? 'Build or trade' : `${active?.name}’s turn`;
  }
}

/** The in-game screen. Layout is CSS grid (GameTable.css); pieces live in ./game. */
export default function GameTable({
  room,
  invite,
  home,
  leaving,
  setLeaving,
  signedIn,
}: {
  room: ReturnType<typeof useRoom>;
  invite: () => void;
  home: () => void;
  /** The leave dialog is open. Held by App so the site header's Home button can open it too. */
  leaving: boolean;
  setLeaving: (open: boolean) => void;
  signedIn: boolean;
}) {
  const view = room.view!;
  const send = room.send;
  const [mode, setModeState] = useState<BuildKind | null>(null);
  const [selected, setSelected] = useState<{ kind: BuildKind; id: string } | null>(null);
  const [trade, setTrade] = useState<TradeDraft | null>(null);
  const [devKind, setDevKind] = useState<DevelopmentType | null>(null);
  const [endHidden, setEndHidden] = useState(false);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<PanelTab | null>(() => (matchMedia('(min-width: 721px)').matches ? 'chat' : null));
  const busy = room.pending || room.connection !== 'online';
  const ownTurn = view.activePlayerId === view.selfId;
  const spectator = view.role === 'spectator';
  const paused = view.pausedAt !== null;
  const finished = view.phase === 'finished';
  const self = view.players.find(p => p.id === view.selfId);
  const active = view.players.find(p => p.id === view.activePlayerId);
  const blocked = busy || paused || spectator || !ownTurn;
  useTurnAlerts(view);

  const setMode = (next: BuildKind | null) => {
    setModeState(next);
    setSelected(null);
  };
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const portrait = matchMedia('(max-width: 720px) and (orientation: portrait)');
    const collapse = () => {
      if (portrait.matches) setPanel(null);
    };
    collapse();
    portrait.addEventListener('change', collapse);
    return () => portrait.removeEventListener('change', collapse);
  }, []);
  // Solo test rooms: switch to whichever seat needs to act.
  useEffect(() => {
    if (!view.testMode || spectator || !follow || busy || view.proposal || view.tradeOffer || paused) return;
    const next =
      view.phase === 'discard'
        ? Object.keys(view.pendingDiscards).find(id => (view.pendingDiscards[id] ?? 0) > 0)
        : view.activePlayerId;
    if (next && next !== view.selfId && !view.players.find(p => p.id === next)?.bot) room.viewAs(next);
  }, [view, follow, busy, room.viewAs, spectator, paused]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset local choices when the seat or phase changes.
  useEffect(() => {
    setModeState(null);
    setSelected(null);
    setDevKind(null);
    setTrade(previous => (previous?.counterOf && view.phase === 'build' ? previous : null));
  }, [view.selfId, view.phase]);
  // A counter draft closes with its offer.
  useEffect(() => {
    if (trade?.counterOf && view.tradeOffer?.id !== trade.counterOf) setTrade(null);
  }, [trade, view.tradeOffer?.id]);
  useEffect(() => {
    if (!finished) setEndHidden(false);
  }, [finished]);
  useEffect(() => {
    if (!selected) return;
    const legal =
      selected.kind === 'road'
        ? view.legal.roads
        : selected.kind === 'city'
          ? view.legal.cities
          : view.legal.settlements;
    if (!legal.includes(selected.id)) setSelected(null);
  }, [view.legal, selected]);
  useEffect(() => {
    if (!selected) return;
    const cancel = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.map-confirm, .board-target')) setSelected(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    document.addEventListener('pointerdown', cancel);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', cancel);
      document.removeEventListener('keydown', onEscape);
    };
  }, [selected]);

  const clock = view.pausedAt ?? now;
  const remaining = view.turnDeadline === null ? 0 : Math.max(0, Math.ceil((view.turnDeadline - clock) / 1000));
  const rollIn = view.rollDeadline === null ? null : Math.max(0, Math.ceil((view.rollDeadline - clock) / 1000));

  function place(selection: { kind: BuildKind; id: string }) {
    if (blocked) return;
    if (selection.kind === 'road')
      send({ type: view.phase === 'setup-road' ? 'place-road' : 'build-road', edgeId: selection.id });
    else
      send({
        type:
          view.phase === 'setup-settlement'
            ? 'place-settlement'
            : selection.kind === 'city'
              ? 'build-city'
              : 'build-settlement',
        vertexId: selection.id,
      });
    setMode(null);
  }
  function pick(kind: BuildKind, id: string) {
    if (mode) place({ kind, id });
    else setSelected({ kind, id });
  }

  let turnAction: ReactNode = null;
  if (ownTurn && view.phase === 'roll')
    turnAction = (
      <button className="button primary turn-action" disabled={blocked} onClick={() => send({ type: 'roll' })}>
        <Dices size={19} />
        <span>Roll dice</span>
      </button>
    );
  if (ownTurn && view.phase === 'build')
    turnAction = (
      <button className="button primary turn-action" disabled={blocked} onClick={() => send({ type: 'end-turn' })}>
        <span>End turn</span>
        <ArrowRight size={18} />
      </button>
    );
  if (ownTurn && view.phase === 'free-roads')
    turnAction = (
      <button
        className="button secondary turn-action"
        disabled={blocked}
        onClick={() => send({ type: 'finish-free-roads' })}
      >
        Finish roads
      </button>
    );
  // Right after ending your turn, the same spot offers to take it back (others vote, as for any undo).
  const canUndoEnd = !spectator && view.undoAvailable?.endsTurn && view.undoAvailable.actorId === view.selfId;
  if (!ownTurn && canUndoEnd)
    turnAction = (
      <button
        className="button secondary turn-action"
        disabled={busy || paused || (!!view.proposal && !view.proposal.rejected.length)}
        onClick={() => send({ type: 'propose', kind: 'undo' })}
      >
        <Undo2 size={18} />
        <span>Undo end turn</span>
      </button>
    );
  if (finished && endHidden)
    turnAction = (
      <button className="button primary turn-action" onClick={() => setEndHidden(false)}>
        <Trophy size={18} />
        <span>Results</span>
      </button>
    );

  return (
    <main className="game-table" style={playerVars(self?.color, 'self') as CSSProperties}>
      <TableToolbar
        view={view}
        connection={room.connection}
        busy={busy}
        follow={follow}
        setFollow={setFollow}
        viewAs={room.viewAs}
        send={send}
        toggleChat={() => setPanel(panel ? null : 'chat')}
        invite={invite}
        leave={() => setLeaving(true)}
        home={() => (!spectator && isBotGame(view) ? setLeaving(true) : home())}
      />
      <PlayerPanel view={view} online={room.online} />
      <BoardViewport
        view={view}
        mode={view.phase === 'robber' ? 'robber' : mode}
        disabled={blocked}
        selected={selected}
        onConfirm={() => selected && place(selected)}
        onVertex={id => pick(view.legal.cities.includes(id) ? 'city' : 'settlement', id)}
        onEdge={id => pick('road', id)}
        corner={
          trade && (
            <TradeComposer
              view={view}
              draft={trade}
              setDraft={setTrade}
              busy={busy}
              send={send}
              close={() => setTrade(null)}
            />
          )
        }
        onHex={hexId => send({ type: 'move-robber', hexId })}
      >
        {view.phase === 'discard' && (view.pendingDiscards[view.selfId] ?? 0) > 0 && !paused && (
          <DiscardPanel key={view.selfId} view={view} busy={busy} send={send} />
        )}
        <ProposalNotice view={view} busy={busy} send={send} />
        {!trade?.counterOf && (
          <TradeNotice view={view} busy={busy} now={now} send={send} counter={offer => setTrade(counterDraft(offer))} />
        )}
        {paused && !view.proposal && <PausedNotice />}
        {view.phase === 'steal' && ownTurn && <StealChooser view={view} blocked={blocked} send={send} />}
        {finished && !endHidden && (
          <EndGame view={view} busy={busy} send={send} leave={() => setLeaving(true)} hide={() => setEndHidden(true)} />
        )}
      </BoardViewport>
      <div className="table-turn">
        <span
          className={`turn-owner${active && !spectator ? ' has-color' : ''}`}
          style={active ? (playerVars(active.color) as CSSProperties) : undefined}
        >
          {spectator ? 'Spectating' : ownTurn ? 'Your turn' : active?.name}
        </span>
        <span className="turn-instruction" role="status">
          {instructionFor(view, ownTurn, rollIn)}
        </span>
        <Dice dice={view.dice} />
        <span
          className={`turn-clock ${view.turnExpired ? 'expired' : ''}`}
          role="timer"
          aria-label={`Turn time remaining ${remaining} seconds`}
        >
          <Clock3 size={15} />
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
      </div>
      <section className="table-hand" aria-label="Your hand">
        {spectator ? (
          <p className="spectator-hand">
            <Eye size={20} />
            Watching · hands stay private
          </p>
        ) : (
          <ResourceHand
            hand={view.hand}
            playerName={self?.name}
            compact
            onSelect={resource => setTrade(previous => addTradeResource(previous, resource, view))}
            disabled={busy || paused}
          >
            {view.development.length > 0 && <DevelopmentHand view={view} open={setDevKind} />}
          </ResourceHand>
        )}
      </section>
      <div className="table-actions">
        {!spectator && self && (
          <BuildBar view={view} self={self} blocked={blocked} mode={mode} setMode={setMode} send={send} />
        )}
        {turnAction}
      </div>
      <TablePanel view={view} busy={busy} send={send} panel={panel} setPanel={setPanel} />
      {devKind && (
        <DevelopmentDialog view={view} kind={devKind} busy={busy} send={send} close={() => setDevKind(null)} />
      )}
      {leaving && (
        <LeaveDialog
          view={view}
          busy={busy}
          signedIn={signedIn}
          close={() => setLeaving(false)}
          saveForLater={home}
          leave={() => {
            setLeaving(false);
            send({ type: 'leave' });
          }}
        />
      )}
    </main>
  );
}
