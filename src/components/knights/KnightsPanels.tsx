// Corner panels for Cities & Knights: what a knight can do, the city improvements, and playing a
// progress card whose choice isn't made on the board.
import { Check, Minus, Plus } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import {
  KNIGHT_NAMES,
  KNIGHTS_COSTS,
  KNIGHTS_LIMITS,
  type KnightLevel,
  PROGRESS,
  type ProgressKind,
  TRACK_INFO,
  TRACKS,
  type Track,
} from '../../../shared/knights';
import {
  CLASSIC_RESOURCES,
  COMMODITIES,
  type GameAction,
  type GameView,
  type Resource,
  type ResourceBag,
} from '../../../shared/types';
import { KNIGHTS, ResourceIcon } from '../../art';
import { Palette, Panel } from '../game/CornerPanels';
import { RESOURCE_LABELS } from '../ResourceHand';
import { cardBoardTarget } from './useKnights';
import './knights.css';

/** The cost as icons, for buttons. */
function CostIcons({ cost }: { cost: ResourceBag }) {
  return (
    <span className="ck-cost" aria-hidden="true">
      {(Object.entries(cost) as [Resource, number][]).flatMap(([r, n]) =>
        Array.from({ length: n }, (_, i) => <ResourceIcon key={`${r}${i}`} resource={r} size={16} />),
      )}
    </span>
  );
}

/** One of your knights: activate, promote, move, or chase the robber, whichever it can do now. */
export function KnightMenu({
  view,
  vertexId,
  blocked,
  act,
  move,
  close,
}: {
  view: GameView;
  vertexId: string;
  blocked: boolean;
  act: (action: GameAction) => void;
  move: () => void;
  close: () => void;
}) {
  const ck = view.ck!;
  const knight = ck.knights[vertexId];
  if (!knight) return null;
  const legal = ck.legal;
  const name = KNIGHT_NAMES[knight.level];
  const next = KNIGHT_NAMES[(knight.level + 1) as KnightLevel];
  const free = ck.smith > 0;
  return (
    <Panel
      title={name}
      close={close}
      status={knight.active ? `Active · strength ${knight.level}` : `Inactive · strength ${knight.level}`}
      action={null}
    >
      <div className="ck-actions">
        {legal.activate.includes(vertexId) && (
          <button
            className="button secondary"
            disabled={blocked}
            onClick={() => act({ type: 'activate-knight', vertexId })}
          >
            Activate <CostIcons cost={KNIGHTS_COSTS.activate} />
          </button>
        )}
        {legal.promote.includes(vertexId) && (
          <button
            className="button secondary"
            disabled={blocked}
            onClick={() => act({ type: 'promote-knight', vertexId })}
          >
            Promote to {next?.toLowerCase()}{' '}
            {free ? <span className="ck-free">free</span> : <CostIcons cost={KNIGHTS_COSTS.promote} />}
          </button>
        )}
        {legal.moves[vertexId] && (
          <button className="button secondary" disabled={blocked} onClick={move}>
            Move along your roads
          </button>
        )}
        {legal.chase.includes(vertexId) && (
          <button
            className="button secondary"
            disabled={blocked}
            onClick={() => act({ type: 'chase-robber', vertexId })}
          >
            Chase the robber
          </button>
        )}
      </div>
      <p className="ck-note">A knight that acts goes inactive. One activated this turn acts next turn.</p>
    </Panel>
  );
}

/** One improvement track: its level, what level 3 gives, and the button to raise it. */
function TrackRow({
  view,
  track,
  blocked,
  send,
}: {
  view: GameView;
  track: Track;
  blocked: boolean;
  send: (a: GameAction) => void;
}) {
  const ck = view.ck!;
  const info = TRACK_INFO[track];
  const level = ck.improvements[view.selfId]?.[track] ?? 0;
  const color = KNIGHTS.trackColors[track];
  const holder = ck.metropolis[track] ? view.buildings[ck.metropolis[track]!]?.playerId : null;
  const holderName = view.players.find(p => p.id === holder)?.name;
  const maxed = level >= KNIGHTS_LIMITS.maxLevel;
  const need = maxed ? 0 : Math.max(0, level + 1 - (ck.crane ? 1 : 0));
  return (
    <div className="ck-track" style={{ '--track': color.base, '--track-dark': color.dark } as CSSProperties}>
      <div className="ck-track-head">
        <strong>{info.name}</strong>
        <span className="ck-pips" role="img" aria-label={`Level ${level} of 5`}>
          {Array.from({ length: KNIGHTS_LIMITS.maxLevel }, (_, i) => (
            <span key={i} className={i < level ? 'on' : undefined} />
          ))}
        </span>
        <button
          className="button secondary ck-raise"
          disabled={blocked || !ck.legal.improve.includes(track)}
          aria-label={
            maxed
              ? `${info.name} is at level 5`
              : `Raise ${info.name} to level ${level + 1} for ${need} ${info.commodity}`
          }
          onClick={() => send({ type: 'improve-city', track })}
        >
          {maxed ? (
            'Max'
          ) : (
            <>
              <Plus size={15} />
              {need}
              <ResourceIcon resource={info.commodity} size={16} />
            </>
          )}
        </button>
      </div>
      <small className="ck-track-note">
        {level >= 3 ? '✓ ' : 'Level 3: '}
        {info.level3}
        {holderName ? ` Metropolis: ${holderName}.` : ' First to level 4 gets a metropolis (2 points).'}
      </small>
    </div>
  );
}

/** City improvements: three tracks raised with commodities. */
export function CityPanel({
  view,
  blocked,
  send,
  close,
}: {
  view: GameView;
  blocked: boolean;
  send: (a: GameAction) => void;
  close: () => void;
}) {
  const ownsCity = Object.values(view.buildings).some(b => b.playerId === view.selfId && b.kind === 'city');
  return (
    <Panel
      title="City improvements"
      close={close}
      status={ownsCity ? 'Each level costs its number in commodities' : 'You need a city to improve'}
      action={null}
    >
      <div className="ck-tracks">
        {TRACKS.map(track => (
          <TrackRow key={track} view={view} track={track} blocked={blocked} send={send} />
        ))}
      </div>
    </Panel>
  );
}

/** A die value picker: − value +. */
function DieStepper({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <span className="ck-die" role="group" aria-label={label}>
      <span>{label}</span>
      <button
        className="icon-button"
        aria-label={`Lower the ${label.toLowerCase()}`}
        disabled={value <= 1}
        onClick={() => set(value - 1)}
      >
        <Minus size={16} />
      </button>
      <strong>{value}</strong>
      <button
        className="icon-button"
        aria-label={`Raise the ${label.toLowerCase()}`}
        disabled={value >= 6}
        onClick={() => set(value + 1)}
      >
        <Plus size={16} />
      </button>
    </span>
  );
}

/** The items a card names: resources, commodities, or either (Merchant Fleet). */
function cardItems(kind: ProgressKind): Resource[] {
  const target = PROGRESS[kind].target;
  if (target === 'commodity') return [...COMMODITIES];
  if (target === 'card') return [...CLASSIC_RESOURCES, ...COMMODITIES];
  return [...CLASSIC_RESOURCES];
}

/** Players a card can name (Master Merchant, Spy, Deserter). */
function cardPlayers(view: GameView, kind: ProgressKind): string[] {
  const t = view.ck!.legal.targets;
  if (kind === 'master-merchant') return t.richer;
  if (kind === 'spy') return t.spy;
  if (kind === 'deserter') return t.deserter;
  return [];
}

/** A progress card: what it does, and whatever it needs chosen (dice, a resource, a player, or a spot). */
export function CardPanel({
  view,
  cardId,
  blocked,
  play,
  pickOnBoard,
  close,
}: {
  view: GameView;
  cardId: string;
  blocked: boolean;
  play: (action: GameAction) => void;
  pickOnBoard: () => void;
  close: () => void;
}) {
  const card = view.ck!.hand.find(c => c.id === cardId);
  const [red, setRed] = useState(1);
  const [yellow, setYellow] = useState(6);
  const [item, setItem] = useState<Resource | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  if (!card) return null;
  const info = PROGRESS[card.kind];
  const playable = view.ck!.legal.playable.includes(card.id);
  const reason = playable
    ? null
    : view.activePlayerId !== view.selfId
      ? 'Play it on your turn.'
      : card.kind === 'alchemist'
        ? 'Play it before you roll.'
        : view.phase === 'roll'
          ? 'Roll first.'
          : 'Nothing to use it on now.';
  const board = cardBoardTarget(view, card.kind);
  const target = info.target;
  const ready =
    playable && (target === 'player' ? !!player : ['resource', 'commodity', 'card'].includes(target) ? !!item : true);
  const send = () => {
    const base = { type: 'play-progress' as const, cardId };
    if (target === 'dice') return play({ ...base, red, yellow });
    if (target === 'player') return play({ ...base, playerId: player! });
    if (item) return play({ ...base, resource: item });
    play(base);
  };
  const color = KNIGHTS.trackColors[info.track];
  return (
    <Panel
      title={info.name}
      close={close}
      status={reason ?? TRACK_INFO[info.track].name}
      action={
        board ? (
          <button className="button primary" disabled={blocked || !playable} onClick={pickOnBoard}>
            Choose on the board
          </button>
        ) : (
          <button className="button primary" disabled={blocked || !ready} onClick={send}>
            <Check size={18} />
            Play
          </button>
        )
      }
    >
      <p className="ck-card-text" style={{ borderColor: color.base }}>
        {info.text}
      </p>
      {target === 'dice' && (
        <div className="ck-dice-pick">
          <DieStepper label="Red die" value={red} set={setRed} />
          <DieStepper label="Yellow die" value={yellow} set={setYellow} />
          <small>Total {red + yellow}</small>
        </div>
      )}
      {['resource', 'commodity', 'card'].includes(target) && (
        <Palette
          items={cardItems(card.kind)}
          label="Choose a card kind"
          name={r => `Choose ${RESOURCE_LABELS[r as Resource]}`}
          disabled={() => blocked}
          pressed={r => item === r}
          pick={r => setItem(r as Resource)}
        />
      )}
      {target === 'player' && (
        <div className="ck-players" role="group" aria-label="Choose a player">
          {cardPlayers(view, card.kind).map(id => (
            <button key={id} className="button secondary" aria-pressed={player === id} onClick={() => setPlayer(id)}>
              {view.players.find(p => p.id === id)?.name}
            </button>
          ))}
          {!cardPlayers(view, card.kind).length && <small>Nobody to choose now.</small>}
        </div>
      )}
    </Panel>
  );
}
