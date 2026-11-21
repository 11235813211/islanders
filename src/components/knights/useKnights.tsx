import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { KNIGHT_NAMES, PROGRESS, type ProgressKind } from '../../../shared/knights';
import type { GameAction, GameView, Hex } from '../../../shared/types';
import { TERRAIN } from '../../art';
import type { BoardMode } from '../Board';
import type { KnightButtons } from '../game/BuildBar';
import type { TilePicking } from '../game/TileTargets';
import type { SpotPicking } from './KnightPieces';
import { CardPanel, CityPanel, KnightMenu } from './KnightsPanels';

/** What the player is picking on the board for a Cities & Knights move, if anything. */
type Pick =
  | { kind: 'knight' }
  | { kind: 'wall' }
  | { kind: 'move'; from: string }
  | { kind: 'card'; cardId: string; first?: string };

/** What the table needs from Cities & Knights: board picking, a corner panel, and the build buttons. */
export interface KnightsUi {
  mode: BoardMode;
  spots: SpotPicking | null;
  tiles: TilePicking | null;
  onKnight: (vertexId: string) => void;
  panel: ReactNode;
  buttons: KnightButtons;
  /** A progress card tapped in the hand. */
  openCard: (cardId: string) => void;
  /** Something is open (a panel or a pick). */
  open: boolean;
}

const tileName = (hex: Hex) => `${TERRAIN[hex.terrain].name.split(' · ')[0]}${hex.number ? ` ${hex.number}` : ''}`;

/** Cities & Knights on the table: knights, walls, the city panel, and playing progress cards. */
export function useKnights(view: GameView, send: (action: GameAction) => void, blocked: boolean): KnightsUi {
  const [pick, setPick] = useState<Pick | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [city, setCity] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  // A new phase or seat ends any pick in progress.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on phase and seat changes only.
  useEffect(() => {
    setPick(null);
    setMenu(null);
    setCard(null);
  }, [view.phase, view.selfId, view.turn]);
  const ck = view.ck;
  const closeAll = () => {
    setPick(null);
    setMenu(null);
    setCard(null);
    setCity(false);
  };
  const act = (action: GameAction) => {
    send(action);
    closeAll();
  };
  const buttons: KnightButtons = {
    picking: pick?.kind === 'knight' || pick?.kind === 'wall' ? pick.kind : null,
    cityOpen: city,
    knight: () => setPick(p => (p?.kind === 'knight' ? null : { kind: 'knight' })),
    wall: () => setPick(p => (p?.kind === 'wall' ? null : { kind: 'wall' })),
    city: () => {
      setCity(open => !open);
      setMenu(null);
      setCard(null);
    },
  };
  const empty: KnightsUi = {
    mode: null,
    spots: null,
    tiles: null,
    onKnight: () => {},
    panel: null,
    buttons,
    openCard: () => {},
    open: false,
  };
  // Memoized so the board isn't redrawn by every clock tick while a pick is open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: act and setPick only send and set state.
  const picks = useMemo(() => (ck ? picksFor(view, pick, setPick, act) : { spots: null, tiles: null }), [view, pick]);
  if (!ck) return empty;
  const { spots, tiles } = picks;
  const startCard = (cardId: string) => {
    const held = ck.hand.find(c => c.id === cardId);
    if (!held) return;
    setCard(null);
    setPick({ kind: 'card', cardId });
  };
  let panel: ReactNode = null;
  if (card)
    panel = (
      <CardPanel
        view={view}
        cardId={card}
        blocked={blocked}
        play={act}
        pickOnBoard={() => startCard(card)}
        close={() => setCard(null)}
      />
    );
  else if (menu)
    panel = (
      <KnightMenu
        view={view}
        vertexId={menu}
        blocked={blocked}
        act={act}
        move={() => {
          setMenu(null);
          setPick({ kind: 'move', from: menu });
        }}
        close={() => setMenu(null)}
      />
    );
  else if (city) panel = <CityPanel view={view} blocked={blocked} send={send} close={() => setCity(false)} />;
  const picking = !!spots || !!tiles;
  return {
    mode: picking ? 'knights' : null,
    spots,
    tiles,
    onKnight: v => {
      setMenu(v);
      setCard(null);
      setCity(false);
      setPick(null);
    },
    panel,
    buttons,
    openCard: cardId => {
      setCard(cardId);
      setMenu(null);
      setCity(false);
      setPick(null);
    },
    open: picking || !!panel,
  };
}

/** Where a progress card's target is chosen on the board, or null when it is chosen in its panel. */
export function cardBoardTarget(
  view: GameView,
  kind: ProgressKind,
): { on: 'vertex' | 'edge' | 'hex'; ids: string[]; hint: string } | null {
  const t = view.ck!.legal.targets;
  switch (PROGRESS[kind].target) {
    case 'hex':
      return { on: 'hex', ids: t.merchant, hint: 'Choose a tile for the merchant' };
    case 'two-hexes':
      return { on: 'hex', ids: t.inventor, hint: 'Choose two tiles to swap numbers' };
    case 'city':
      return { on: 'vertex', ids: t.engineer, hint: 'Choose a city for the free wall' };
    case 'settlement':
      return { on: 'vertex', ids: t.medicine, hint: 'Choose a settlement to upgrade' };
    case 'road':
      return { on: 'edge', ids: t.diplomat, hint: 'Choose an open road to remove' };
    case 'knight':
      return { on: 'vertex', ids: t.intrigue, hint: 'Choose a knight to chase away' };
    default:
      return null;
  }
}

/** The board targets for what is being picked: a knight, a wall, a knight's move, a card's target, or the Deserter's knight. */
function picksFor(
  view: GameView,
  pick: Pick | null,
  setPick: (pick: Pick | null) => void,
  act: (action: GameAction) => void,
): { spots: SpotPicking | null; tiles: TilePicking | null } {
  const ck = view.ck!;
  let spots: SpotPicking | null = null;
  let tiles: TilePicking | null = null;
  const legal = ck.legal;
  const deserter = view.phase === 'place-knight' && view.activePlayerId === view.selfId;
  if (deserter)
    spots = {
      vertices: legal.placeKnight,
      edges: [],
      hint: `Place your ${KNIGHT_NAMES[ck.pendingKnight ?? 1].toLowerCase()}`,
      label: v => `Place the knight at ${v}`,
      onPick: v => act({ type: 'place-knight', vertexId: v }),
    };
  else if (pick?.kind === 'knight')
    spots = {
      vertices: legal.build,
      edges: [],
      hint: 'Place your knight beside your road',
      label: v => `Place a knight at ${v}`,
      onPick: v => act({ type: 'build-knight', vertexId: v }),
    };
  else if (pick?.kind === 'wall')
    spots = {
      vertices: legal.walls,
      edges: [],
      hint: 'Choose a city for the wall',
      label: v => `Build a wall at ${v}`,
      onPick: v => act({ type: 'build-wall', vertexId: v }),
    };
  else if (pick?.kind === 'move')
    spots = {
      vertices: legal.moves[pick.from] ?? [],
      edges: [],
      hint: 'Choose where the knight goes',
      label: v => (ck.knights[v] ? `Chase away the knight at ${v}` : `Move the knight to ${v}`),
      onPick: v => act({ type: 'move-knight', from: pick.from, to: v }),
    };
  else if (pick?.kind === 'card') {
    const held = ck.hand.find(c => c.id === pick.cardId);
    const target = held ? cardBoardTarget(view, held.kind) : null;
    const play = (fields: Partial<Extract<GameAction, { type: 'play-progress' }>>) =>
      act({ type: 'play-progress', cardId: pick.cardId, ...fields });
    if (held && target?.on === 'hex') {
      const first = pick.first;
      tiles = {
        hexes: target.ids.filter(id => id !== first),
        picked: first ?? null,
        label: hex => `${target.hint}: ${tileName(hex)}`,
        onPick: hexId => {
          if (held.kind !== 'inventor') return play({ hexId });
          if (!first) return setPick({ ...pick, first: hexId });
          play({ hexId: first, otherHexId: hexId });
        },
      };
    } else if (held && target)
      spots = {
        vertices: target.on === 'vertex' ? target.ids : [],
        edges: target.on === 'edge' ? target.ids : [],
        hint: target.hint,
        label: id => `${target.hint}: ${id}`,
        onPick: id => play(target.on === 'edge' ? { edgeId: id } : { vertexId: id }),
      };
  }
  return { spots, tiles };
}
