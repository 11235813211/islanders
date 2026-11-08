import { AlertTriangle, ArrowLeft, Check, Map as MapIcon, Shuffle, Users, X } from 'lucide-react';
import { type CSSProperties, useEffect, useId, useMemo, useState } from 'react';
import { type BoardDesign, buildBoard } from '../../../shared/maps';
import { ArtDefs, SEA } from '../../art';
import { useBoardLibrary } from '../../hooks/useBoardLibrary';
import { boardFrame } from '../../lib/boardCamera';
import BoardScene from '../BoardScene';
import MapThumbnail from './MapThumbnail';
import PanZoomSvg from './PanZoomSvg';
import './maps.css';

const range = (p: BoardDesign['players']) => (p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`);
/** True when a room of `count` players is outside the map's intended range. */
export const playersMismatch = (design: { players: BoardDesign['players'] }, count: number) =>
  count < design.players.min || count > design.players.max;

/** Plain-language rules for the special tiles and markers a map uses. */
export function mapRules(design: BoardDesign): string[] {
  const kinds = new Set(design.tiles.map(t => t.kind));
  const pool = (kind: keyof BoardDesign['pool']) => kinds.has(kind) || (kinds.has('land') && !!design.pool[kind]);
  const rules: string[] = [];
  if (kinds.has('sea')) rules.push('Ships cost lumber and wool. Move one ship from the open end of a line each turn.');
  if (pool('gold')) rules.push('Gold fields pay any resource you choose.');
  if (pool('volcano'))
    rules.push(
      'Volcanoes pay like gold. When one is rolled, a die names a corner: a city there drops to a settlement, a settlement is lost.',
    );
  if (pool('jungle')) rules.push('Jungles give discoveries. Each pays one resource of a development card.');
  if (pool('iceberg')) rules.push('Ships cannot sail beside icebergs.');
  if (design.tiles.some(t => t.bonus))
    rules.push('The first settlement each player builds on a marked island earns its bonus points.');
  if (design.tiles.some(t => t.noSetup))
    rules.push('Islands with the crossed-out flag cannot hold starting settlements.');
  return rules;
}

/** A large, pannable draw of the map. "New draw" re-rolls its random tiles and numbers. */
export function MapPreview({ design }: { design: BoardDesign }) {
  const uid = useId().replace(/:/g, '');
  const [draw, setDraw] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `draw` asks for a fresh random layout.
  const built = useMemo(() => buildBoard(design), [design, draw]);
  const frame = boardFrame(built.board.hexes);
  return (
    <div className="map-preview">
      <PanZoomSvg
        frame={frame}
        label={`${design.name} map`}
        defs={
          <>
            <ArtDefs uid={uid} />
            <SEA.Defs uid={uid} />
          </>
        }
      >
        <BoardScene
          uid={uid}
          board={built.board}
          frame={frame}
          robber={built.robber}
          pirate={built.pirate}
          showClosed
        />
      </PanZoomSvg>
      {design.tiles.some(t => t.kind === 'land' || (t.kind !== 'sea' && t.number === undefined)) && (
        <button type="button" className="button secondary map-redraw" onClick={() => setDraw(n => n + 1)}>
          <Shuffle size={17} />
          New draw
        </button>
      )}
    </div>
  );
}

function MapDetail({
  design,
  players,
  canChoose,
  current,
  choose,
  back,
}: {
  design: BoardDesign;
  players: number;
  canChoose: boolean;
  current: boolean;
  choose: () => void;
  back: () => void;
}) {
  const land = design.tiles.filter(t => t.kind !== 'sea' && t.kind !== 'iceberg').length;
  return (
    <div className="map-detail">
      <MapPreview design={design} />
      <aside className="map-info">
        <button type="button" className="text-button" onClick={back}>
          <ArrowLeft size={17} />
          All maps
        </button>
        <h3>{design.name}</h3>
        {design.description && <p>{design.description}</p>}
        <dl>
          <dt>Players</dt>
          <dd>{range(design.players)}</dd>
          <dt>Points to win</dt>
          <dd>{design.victoryPoints}</dd>
          <dt>Land tiles</dt>
          <dd>{land}</dd>
          <dt>Harbors</dt>
          <dd>{design.harbors.length}</dd>
        </dl>
        {playersMismatch(design, players) && (
          <p className="map-warning" role="note">
            <AlertTriangle size={17} />
            Made for {range(design.players)} players. This room has {players}.
          </p>
        )}
        <ul className="map-rules">
          {mapRules(design).map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        {canChoose && (
          <button type="button" className="button primary full" disabled={current} onClick={choose}>
            <Check size={18} />
            {current ? 'This room’s map' : 'Use this map'}
          </button>
        )}
      </aside>
    </div>
  );
}

/**
 * Full-screen map browser: maps by category, filtered to the room's player count, each opening
 * a large view. Everyone can browse; only the host can pick (`canChoose`).
 */
export default function MapPicker({
  players,
  currentId,
  canChoose,
  choose,
  close,
}: {
  players: number;
  currentId: string | null;
  canChoose: boolean;
  choose: (design: BoardDesign) => void;
  close: () => void;
}) {
  const { library, error, reload } = useBoardLibrary();
  // Filter by the room's player count, or another count the host plans for (null shows every map).
  const [count, setCount] = useState<number | null>(Math.min(4, Math.max(2, players)));
  const [open, setOpen] = useState<BoardDesign | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (open) setOpen(null);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  const visible = (library?.boards ?? []).filter(b => count === null || !playersMismatch(b, count));
  const hidden = (library?.boards.length ?? 0) - visible.length;
  return (
    <div className="map-picker" role="dialog" aria-modal="true" aria-label="Maps">
      <header className="map-picker-header">
        <h2>
          <MapIcon size={22} />
          {canChoose ? 'Choose a map' : 'Maps'}
        </h2>
        <div className="map-filter" role="radiogroup" aria-label="Players">
          <Users size={17} />
          {[null, 2, 3, 4].map(n => (
            <button
              key={n ?? 'all'}
              type="button"
              role="radio"
              aria-checked={count === n}
              aria-label={n === null ? 'All maps' : `Maps for ${n} players`}
              onClick={() => setCount(n)}
            >
              {n ?? 'All'}
            </button>
          ))}
        </div>
        <button type="button" className="icon-button" aria-label="Close maps" onClick={close}>
          <X />
        </button>
      </header>
      {open ? (
        <MapDetail
          design={open}
          players={players}
          canChoose={canChoose}
          current={open.id === currentId}
          choose={() => choose(open)}
          back={() => setOpen(null)}
        />
      ) : (
        <div className="map-picker-body">
          {!library && !error && <p className="muted">Loading maps…</p>}
          {error && (
            <p className="inline-alert">
              {error}{' '}
              <button type="button" className="text-button" onClick={() => void reload()}>
                Try again
              </button>
            </p>
          )}
          {library?.categories.map(category => {
            const boards = visible.filter(b => b.categoryId === category.id);
            if (!boards.length) return null;
            return (
              <section
                key={category.id}
                className="map-category"
                style={{ '--category': category.color } as CSSProperties}
              >
                <h3>
                  <span className="category-dot" />
                  {category.name}
                </h3>
                <div className="map-grid">
                  {boards.map(board => (
                    <button
                      type="button"
                      key={board.id}
                      className={`map-card${board.id === currentId ? ' current' : ''}`}
                      onClick={() => setOpen(board)}
                      aria-label={`${board.name}, ${range(board.players)} players`}
                    >
                      <MapThumbnail tiles={board.tiles} />
                      <span className="map-card-name">{board.name}</span>
                      <span className="map-card-meta">
                        <span>{range(board.players)} players</span>
                        <span>{board.victoryPoints} points</span>
                        {playersMismatch(board, players) && (
                          <span className="map-card-warning" title={`Made for ${range(board.players)} players`}>
                            <AlertTriangle size={14} />
                          </span>
                        )}
                        {board.id === currentId && <Check size={15} aria-label="Current map" />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {library && hidden > 0 && (
            <button type="button" className="text-button map-show-all" onClick={() => setCount(null)}>
              Show {hidden} more {hidden === 1 ? 'map' : 'maps'} made for other player counts
            </button>
          )}
          {library && !visible.length && !hidden && <p className="muted">No maps yet.</p>}
        </div>
      )}
    </div>
  );
}
