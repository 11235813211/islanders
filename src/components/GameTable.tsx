import { ArrowRight, Clock3, Dices, Eye, Flame, Hammer, Trophy, Undo2 } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { playerVars } from '../../shared/colors';
import { emptyBag, isLargeGame } from '../../shared/engine';
import { isBotGame } from '../../shared/settings';
import type { DevelopmentType, GameView, Tradable, TradeBag } from '../../shared/types';
import { SEA } from '../art';
import type { useRoom } from '../hooks/useRoom';
import { useTurnAlerts } from '../hooks/useTurnAlerts';
import type { BoardMode, PlaceKind, Selection } from './Board';
import BoardViewport from './BoardViewport';
import BuildBar from './game/BuildBar';
import { addDiscard, DiscardPanel, GoldPanel, MonopolyPanel, PlentyPanel } from './game/CornerPanels';
import DevelopmentDialog from './game/DevelopmentDialog';
import DevelopmentHand from './game/DevelopmentHand';
import DiscoveryPanel from './game/DiscoveryPanel';
import EndGame from './game/EndGame';
import LeaveDialog from './game/LeaveDialog';
import { PausedNotice, ProposalNotice, StealChooser } from './game/Overlays';
import PlayerPanel from './game/PlayerPanel';
import ResourceFlights, { useLandedView } from './game/ResourceFlights';
import TablePanel, { type PanelTab } from './game/TablePanel';
import TableToolbar from './game/TableToolbar';
import { TradeNotice } from './game/TradeNotice';
import ResourceHand from './ResourceHand';
import TradeComposer, { addTradeResource, counterDraft, type TradeDraft } from './TradePanel';
import './GameTable.css';
import './game/game.css';
import './game/trade.css';
import './game/phone.css';

/**
 * The special build button for this seat: `ask` while another player's turn is on and you haven't
 * asked yet, `waiting` once you're in line, else null.
 */
function specialBuildState(view: GameView): 'ask' | 'waiting' | null {
  if (view.role !== 'player' || !isLargeGame(view.players.length)) return null;
  if (['lobby', 'finished', 'setup-settlement', 'setup-road'].includes(view.phase)) return null;
  if (view.turnPlayerId === view.selfId || view.activePlayerId === view.selfId) return null;
  if (view.specialQueue.includes(view.selfId)) return 'waiting';
  return view.specialAsked.includes(view.selfId) ? null : 'ask';
}

/** Whole seconds until a deadline (never below 0), or null when there is none. */
const secondsUntil = (deadline: number | null, clock: number) =>
  deadline === null ? null : Math.max(0, Math.ceil((deadline - clock) / 1000));

/** " · 12s" after an instruction, or nothing without a deadline. */
const countdown = (seconds: number | null) => (seconds === null ? '' : ` · ${seconds}s`);

function instructionFor(view: GameView, ownTurn: boolean, clock: number): string {
  const rollIn = secondsUntil(view.rollDeadline, clock);
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
      return view.seafaring ? 'Placing free roads or ships…' : 'Placing free roads…';
    case 'roll':
      return `Roll dice${rollIn === null ? '' : ` · auto ${rollIn}s`}`;
    case 'robber':
      return ownTurn
        ? `Move the robber${view.seafaring ? ' or pirate' : ''}${countdown(secondsUntil(view.robberDeadline, clock))}`
        : 'Moving robber…';
    case 'steal':
      return 'Choosing a player…';
    case 'discard':
      return 'Discarding resources…';
    case 'gold':
      return view.pendingGold[view.selfId]
        ? `Choose your gold${countdown(secondsUntil(view.goldDeadline, clock))}`
        : 'Choosing gold…';
    case 'eruption':
      return ownTurn ? 'Roll the volcano dice' : `${active?.name} rolls for the volcanoes…`;
    case 'special-build':
      return ownTurn ? 'Special build: no trading' : `${active?.name} is building…`;
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
  const [mode, setModeState] = useState<BoardMode>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [trade, setTrade] = useState<TradeDraft | null>(null);
  const [devKind, setDevKind] = useState<DevelopmentType | null>(null);
  const [discard, setDiscard] = useState<TradeBag>(emptyBag);
  const [endHidden, setEndHidden] = useState(false);
  const [buying, setBuying] = useState(false);
  /** Hands and counts without the cards still flying to their owners. */
  const { shown, flights } = useLandedView(view);
  /** Where the robber or pirate was just put, before confirming. */
  const [robberPick, setRobberPick] = useState<string | null>(null);
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

  const setMode = (next: BoardMode) => {
    setModeState(next);
    setSelected(null);
    setMoveFrom(null);
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
        : view.phase === 'gold'
          ? Object.keys(view.pendingGold)[0]
          : view.activePlayerId;
    if (next && next !== view.selfId && !view.players.find(p => p.id === next)?.bot) room.viewAs(next);
  }, [view, follow, busy, room.viewAs, spectator, paused]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset local choices when the seat or phase changes.
  useEffect(() => {
    setModeState(null);
    setSelected(null);
    setMoveFrom(null);
    setDevKind(null);
    setBuying(false);
    setRobberPick(null);
    setDiscard(emptyBag());
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
    const legal = {
      road: view.legal.roads,
      ship: view.legal.ships,
      city: view.legal.cities,
      settlement: view.legal.settlements,
    };
    if (!(selected.choices ?? [selected.kind]).some(kind => legal[kind].includes(selected.id))) setSelected(null);
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

  function place(kind: PlaceKind, id: string) {
    if (blocked) return;
    const setup = view.phase === 'setup-road';
    if (kind === 'road') send({ type: setup ? 'place-road' : 'build-road', edgeId: id });
    else if (kind === 'ship') send({ type: setup ? 'place-ship' : 'build-ship', edgeId: id });
    else
      send({
        type:
          view.phase === 'setup-settlement' ? 'place-settlement' : kind === 'city' ? 'build-city' : 'build-settlement',
        vertexId: id,
      });
    setMode(null);
  }
  function pickVertex(id: string) {
    const kind = view.legal.cities.includes(id) ? 'city' : 'settlement';
    if (mode) place(kind, id);
    else setSelected({ kind, id });
  }
  /** An edge: a ship to move (or where it goes), or a road or ship, asking which when a coast takes both. */
  function pickEdge(id: string) {
    if (mode === 'move-ship') {
      if (!moveFrom) return setMoveFrom(id);
      send({ type: 'move-ship', from: moveFrom, to: id });
      return setMode(null);
    }
    // Tapping one of your movable ships picks it up, as the Move button would.
    if (view.legal.shipMoves[id]) {
      setSelected(null);
      setModeState('move-ship');
      return setMoveFrom(id);
    }
    const choices: PlaceKind[] = [];
    if (mode !== 'ship' && view.legal.roads.includes(id)) choices.push('road');
    if (mode !== 'road' && view.legal.ships.includes(id)) choices.push('ship');
    if (!choices.length) return;
    if (mode && choices.length === 1) return place(choices[0]!, id);
    setSelected({ kind: choices[0]!, id, ...(choices.length > 1 ? { choices } : {}) });
  }

  const discarding = view.phase === 'discard' && (view.pendingDiscards[view.selfId] ?? 0) > 0 && !paused;
  const choosingGold = view.phase === 'gold' && (view.pendingGold[view.selfId] ?? 0) > 0 && !paused;
  const inCorner = (kind: DevelopmentType | null) => kind === 'year-of-plenty' || kind === 'monopoly';
  /** A card in your hand: set aside for a discard on a 7, otherwise added to a trade. */
  function tapCard(resource: Tradable) {
    if (discarding) return setDiscard(bag => addDiscard(bag, resource, view));
    if (view.phase === 'special-build') return; // building only: no trades
    setDevKind(kind => (inCorner(kind) ? null : kind));
    setTrade(previous => addTradeResource(previous, resource, view));
  }
  /** A development stack: corner panels replace an open trade; the rest open a confirm popup. */
  function openCard(kind: DevelopmentType) {
    if (inCorner(kind)) setTrade(null);
    setDevKind(kind);
  }
  /** The board's corner holds one panel: a discard first, then a card being played, then a trade. */
  function cornerPanel(): ReactNode {
    const close = () => setDevKind(null);
    if (discarding)
      return <DiscardPanel key={view.selfId} view={view} bag={discard} setBag={setDiscard} busy={busy} send={send} />;
    if (choosingGold)
      return (
        <GoldPanel
          key={view.selfId}
          view={view}
          busy={busy}
          send={send}
          secondsLeft={secondsUntil(view.goldDeadline, clock)}
        />
      );
    if (buying && self)
      return (
        <DiscoveryPanel
          view={view}
          discoveries={self.discoveries}
          busy={busy}
          send={send}
          close={() => setBuying(false)}
        />
      );
    if (devKind === 'year-of-plenty') return <PlentyPanel view={view} busy={busy} send={send} close={close} />;
    if (devKind === 'monopoly') return <MonopolyPanel view={view} busy={busy} send={send} close={close} />;
    if (!trade) return null;
    return (
      <TradeComposer
        view={view}
        draft={trade}
        setDraft={setTrade}
        busy={busy}
        send={send}
        close={() => setTrade(null)}
      />
    );
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
  if (ownTurn && view.phase === 'eruption')
    turnAction = (
      <button
        className="button turn-action volcano-roll"
        disabled={blocked}
        onClick={() => send({ type: 'roll-volcanoes' })}
      >
        <Flame size={19} />
        <span>Roll volcanoes</span>
      </button>
    );
  if (ownTurn && view.phase === 'special-build')
    turnAction = (
      <button className="button primary turn-action" disabled={blocked} onClick={() => send({ type: 'end-turn' })}>
        <span>Done building</span>
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
  // Five or six players: during someone else's turn, ask to build when it ends (once per turn).
  const special = specialBuildState(view);
  if (!ownTurn && special === 'ask')
    turnAction = (
      <button
        className="button secondary turn-action"
        disabled={busy || paused}
        data-tip="Build (no trading) after this turn. You don't have to build."
        onClick={() => send({ type: 'request-special-build' })}
      >
        <Hammer size={18} />
        <span>Special build</span>
      </button>
    );
  if (!ownTurn && special === 'waiting')
    turnAction = (
      <span className="turn-action special-waiting" role="status">
        <Hammer size={17} />
        In line to build ({view.specialQueue.indexOf(view.selfId) + 1})
      </span>
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
      <PlayerPanel view={shown} online={room.online} />
      <ResourceFlights view={view} {...flights} />
      <BoardViewport
        view={view}
        mode={view.phase === 'robber' ? 'robber' : mode}
        disabled={blocked}
        selected={selected}
        moveFrom={moveFrom}
        onConfirm={kind => selected && place(kind, selected.id)}
        onVertex={pickVertex}
        onEdge={pickEdge}
        corner={cornerPanel()}
        onHex={setRobberPick}
        robberPick={robberPick}
        onRobberConfirm={confirm => {
          if (confirm && robberPick) send({ type: 'move-robber', hexId: robberPick });
          setRobberPick(null);
        }}
      >
        <ProposalNotice view={view} busy={busy} send={send} />
        {view.phase === 'eruption' && (
          <div className="eruption-banner" role="alert">
            <Flame size={20} />
            Volcano eruption
          </div>
        )}
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
          {instructionFor(view, ownTurn, clock)}
        </span>
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
          <ResourceHand hand={shown.hand} playerName={self?.name} compact onSelect={tapCard} disabled={busy || paused}>
            {view.development.length > 0 && <DevelopmentHand view={view} open={openCard} />}
            {!!self?.discoveries && (
              <button
                type="button"
                className="discovery-count"
                aria-label={`${self.discoveries} discoveries`}
                data-tip="Discoveries from jungles. Each pays one resource of a development card. Tap to trade or discard one, where the room allows it."
                disabled={busy || paused}
                onClick={() => tapCard('discovery')}
              >
                <SEA.DiscoveryIcon size={22} />
                {self.discoveries}
              </button>
            )}
          </ResourceHand>
        )}
      </section>
      <div className="table-actions">
        {!spectator && self && (
          <BuildBar
            view={view}
            self={self}
            blocked={blocked}
            mode={mode}
            setMode={setMode}
            send={send}
            buyWithDiscoveries={() => {
              setTrade(null);
              setBuying(true);
            }}
          />
        )}
        {turnAction}
      </div>
      <TablePanel view={view} busy={busy} send={send} panel={panel} setPanel={setPanel} />
      {(devKind === 'knight' || devKind === 'road-building' || devKind === 'victory-point') && (
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
