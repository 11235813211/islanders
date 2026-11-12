import type { ReactNode } from 'react';
import { hexCenter, hexCorner } from '../../../shared/board';
import { type BoardDesign, type DesignHarbor, type DesignTile, SIDE_DIRECTIONS, tileKey } from '../../../shared/maps';
import { neighborKeys } from '../../../shared/maps/balance';
import { closedTiles, isLand, noStartPoints, takesNumber } from '../../../shared/maps/edit';
import { Harbor, NumberToken, Robber, SEA, Tile } from '../../art';
import { hexPoints } from '../../lib/geometry';
import { tileVariant } from '../BoardScene';
import IslandRims from '../IslandRims';
import { oddsLabel } from '../maps/numberOdds';
import type { EditorSelection } from './EditorCanvas';

/** A stable color per link letter, so linked tiles and harbors are easy to match by eye. */
export function linkColor(letter: string): string {
  return LINK_COLORS[(letter.charCodeAt(0) - 65) % LINK_COLORS.length]!;
}

/** Link colors A–H. Early letters avoid the resource hues (brick red, wood green, wheat gold, ore gray). */
const LINK_COLORS = ['#00a8c6', '#d4128a', '#7a45ff', '#1740c9', '#7bb800', '#1b2530', '#ff77c8', '#3fcfb8'];

const LINK_HINT = 'Resource coupled to other hexes or harbors.';

/** A colored edge around a linked hex or harbor; hover explains it is not a resource. */
function LinkRim({ piece, children }: { piece: { link?: string; notLink?: string }; children: ReactNode }) {
  const letter = piece.link ?? piece.notLink;
  if (!letter) return null;
  return (
    <g className="link-rim">
      <title>{LINK_HINT}</title>
      {children}
      <desc>{`Link ${letter}`}</desc>
    </g>
  );
}

/** A link letter in its color; "Not A" shows as ≠A on a striped badge. */
function LinkBadge({ piece, x, y }: { piece: { link?: string; notLink?: string }; x: number; y: number }) {
  const letter = piece.link ?? piece.notLink;
  if (!letter) return null;
  const not = !piece.link;
  const width = not ? 24 : 16;
  return (
    <g className={`editor-link${not ? ' not' : ''}`} transform={`translate(${x} ${y})`}>
      <rect
        x={-width / 2}
        y="-8"
        width={width}
        height="16"
        rx="4"
        fill={not ? '#fff' : linkColor(letter)}
        stroke={not ? linkColor(letter) : '#fff'}
        strokeWidth={not ? 2 : 1.4}
      />
      <text textAnchor="middle" y="4.5" fontSize="12" fontWeight="800" fill={not ? linkColor(letter) : '#fff'}>
        {not ? `≠${letter}` : letter}
      </text>
    </g>
  );
}

/** Corners where no starting settlement may go: a red no-entry mark. */
function NoStartMarks({ design }: { design: BoardDesign }) {
  return (
    <>
      {noStartPoints(design).map(p => (
        <g key={p.key} className="editor-nostart" transform={`translate(${p.x} ${p.y})`} aria-hidden="true">
          <circle r="9" fill="#fff" stroke="#c8321f" strokeWidth="2.6" />
          <path d="M-5.5-5.5 5.5 5.5" stroke="#c8321f" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      ))}
    </>
  );
}

/** Where a harbor's sign and piers go. */
function harborGeometry(harbor: DesignHarbor) {
  const center = hexCenter(harbor.q, harbor.r);
  const a = hexCorner(center.x, center.y, harbor.side);
  const b = hexCorner(center.x, center.y, (harbor.side + 1) % 6);
  const [dq, dr] = SIDE_DIRECTIONS[harbor.side]!;
  const across = hexCenter(harbor.q + dq, harbor.r + dr);
  const length = Math.hypot(across.x - center.x, across.y - center.y);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    corners: [a, b],
    at: { x: mid.x + ((across.x - center.x) / length) * 38, y: mid.y + ((across.y - center.y) / length) * 38 },
  };
}

/** A harbor whose kind is drawn when the game is set up. */
function RandomHarbor({ at, corners }: ReturnType<typeof harborGeometry>) {
  return (
    <>
      {corners.map((v, i) => (
        <line key={i} x1={v.x} y1={v.y} x2={at.x} y2={at.y} stroke="#ffd278" strokeWidth="3" strokeDasharray="3 3" />
      ))}
      <g transform={`translate(${at.x} ${at.y})`}>
        <path d="M-15-24H14L18 9H-18Z" fill="#fff9dc" stroke="#bd9d60" strokeWidth="1.5" strokeDasharray="4 2" />
        <text textAnchor="middle" y="-3" fill="#304c56" fontSize="18" fontWeight="800">
          ?
        </text>
      </g>
    </>
  );
}

/** A tile's number token: set (click to raise, Shift-click or right-click to lower) or "?" for random. */
function NumberSlot({
  uid,
  tile,
  readOnly,
  stepNumber,
}: {
  uid: string;
  tile: DesignTile;
  readOnly: boolean;
  stepNumber: (q: number, r: number, delta: 1 | -1) => void;
}) {
  const odds = oddsLabel(tile.pips);
  return (
    // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a <button>.
    <g
      className={readOnly ? undefined : 'editor-token'}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : -1}
      aria-label={`Number ${tile.number ?? 'random'}. Click to raise, Shift-click to lower.`}
      onClick={event => stepNumber(tile.q, tile.r, event.shiftKey ? -1 : 1)}
      onContextMenu={event => {
        event.preventDefault();
        stepNumber(tile.q, tile.r, -1);
      }}
      onKeyDown={() => {}}
    >
      {tile.number ? (
        <NumberToken uid={uid} number={tile.number} />
      ) : (
        <g transform="translate(0 8)">
          <circle r="18" fill="#fff9e7" fillOpacity=".8" stroke="#8f7c55" strokeWidth="1.4" strokeDasharray="3 3" />
          <text textAnchor="middle" y={odds ? 4.5 : 6.5} fontSize={odds ? 12 : 18} fontWeight="800" fill="#6b6650">
            {odds ?? '?'}
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * A design as drawn before any game: real tile art, "?" for anything left random, harbors,
 * starting pieces, and a rim around islands open to starting settlements. In the editor, number
 * tokens and harbors are clickable and link letters and empty neighbor cells show; `readOnly`
 * (map previews) leaves those out.
 */
export default function EditorLayer({
  uid,
  design,
  selection = null,
  select = () => {},
  pickHarbor,
  stepNumber = () => {},
  readOnly = false,
}: {
  uid: string;
  design: BoardDesign;
  selection?: EditorSelection;
  select?: (selection: EditorSelection) => void;
  /** Replaces selecting when a harbor is clicked (the Link tool). */
  pickHarbor?: (harbor: DesignHarbor) => void;
  stepNumber?: (q: number, r: number, delta: 1 | -1) => void;
  readOnly?: boolean;
}) {
  const occupied = new Set(design.tiles.map(t => tileKey(t.q, t.r)));
  const ghosts = new Map<string, { q: number; r: number }>();
  for (const tile of readOnly ? [] : design.tiles)
    for (const key of neighborKeys(tile))
      if (!occupied.has(key)) {
        const [q, r] = key.split(',').map(Number) as [number, number];
        ghosts.set(key, { q, r });
      }
  const water = design.tiles.filter(t => !isLand(t.kind));
  const land = design.tiles.filter(t => isLand(t.kind));
  const place = (t: { q: number; r: number }) => {
    const c = hexCenter(t.q, t.r);
    return `translate(${c.x} ${c.y})`;
  };
  const selectedTile = selection?.kind === 'tile' ? selection : null;
  const closed = closedTiles(design);
  return (
    <>
      {[...ghosts.values()].map(cell => (
        <polygon
          key={tileKey(cell.q, cell.r)}
          className="editor-ghost"
          points={hexPoints(57)}
          transform={place(cell)}
        />
      ))}
      {water.map(tile => (
        <g key={tileKey(tile.q, tile.r)} transform={place(tile)}>
          <Tile uid={uid} terrain={tile.kind} variant={tileVariant(tile)} />
          {/* An iceberg's number says when it drifts. */}
          {tile.kind === 'iceberg' && <NumberSlot uid={uid} tile={tile} readOnly={readOnly} stepNumber={stepNumber} />}
        </g>
      ))}
      <SEA.IslandBase uid={uid} hexes={land.map(t => hexCenter(t.q, t.r))} />
      {land.map(tile => (
        <g key={tileKey(tile.q, tile.r)} transform={place(tile)}>
          <Tile uid={uid} terrain={tile.kind} />
          <LinkRim piece={tile}>
            <polygon
              points={hexPoints(52)}
              fill="none"
              stroke={linkColor((tile.link ?? tile.notLink)!)}
              strokeWidth="6"
              strokeDasharray={tile.link ? undefined : '10 5'}
              strokeLinejoin="round"
              pointerEvents="stroke"
            />
          </LinkRim>
          {tile.bonus && <SEA.BonusChip points={tile.bonus} />}
          {!readOnly && <LinkBadge piece={tile} x={-25} y={27} />}
          {design.robber?.q === tile.q && design.robber.r === tile.r && <Robber />}
          {takesNumber(tile.kind) && <NumberSlot uid={uid} tile={tile} readOnly={readOnly} stepNumber={stepNumber} />}
        </g>
      ))}
      {design.tiles.some(t => t.kind === 'sea') && (
        <IslandRims
          tiles={design.tiles.map(t => {
            const land = isLand(t.kind);
            return { q: t.q, r: t.r, land, open: land && !closed.has(tileKey(t.q, t.r)) };
          })}
        />
      )}
      {design.pirate && (
        <g transform={place(design.pirate)}>
          <SEA.Pirate />
        </g>
      )}
      {design.harbors.map(harbor => {
        const geometry = harborGeometry(harbor);
        const picked =
          selection?.kind === 'harbor' &&
          selection.q === harbor.q &&
          selection.r === harbor.r &&
          selection.side === harbor.side;
        return (
          // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a <button>.
          <g
            key={`${harbor.q},${harbor.r},${harbor.side}`}
            className={readOnly ? undefined : `editor-harbor${picked ? ' picked' : ''}`}
            role={readOnly ? undefined : 'button'}
            tabIndex={readOnly ? undefined : -1}
            aria-label={`${harbor.kind} harbor`}
            onClick={() =>
              pickHarbor ? pickHarbor(harbor) : select({ kind: 'harbor', q: harbor.q, r: harbor.r, side: harbor.side })
            }
            onKeyDown={() => {}}
          >
            {harbor.kind === 'random' ? (
              <RandomHarbor {...geometry} />
            ) : (
              <Harbor resource={harbor.kind} at={geometry.at} corners={geometry.corners} />
            )}
            <LinkRim piece={harbor}>
              <circle
                cx={geometry.at.x}
                cy={geometry.at.y - 8}
                r="24"
                fill="none"
                stroke={linkColor((harbor.link ?? harbor.notLink)!)}
                strokeWidth="5"
                strokeDasharray={harbor.link ? undefined : '8 4'}
                pointerEvents="stroke"
              />
            </LinkRim>
            {!readOnly && <LinkBadge piece={harbor} x={geometry.at.x + 17} y={geometry.at.y - 22} />}
          </g>
        );
      })}
      <NoStartMarks design={design} />
      {selectedTile && <polygon className="editor-selected" points={hexPoints(55)} transform={place(selectedTile)} />}
    </>
  );
}
