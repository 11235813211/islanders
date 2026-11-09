import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { type BoardDesign, type DesignHarbor, type DesignKind, type DesignTile, tileKey } from '../../../shared/maps';
import {
  islandOf,
  paint,
  setIslandBonus,
  setIslandClosed,
  takesNumber,
  updateHarbor,
  updateTile,
} from '../../../shared/maps/edit';
import { setGroupKind, setLinks } from '../../../shared/maps/fill';
import { RESOURCES, type Resource } from '../../../shared/types';
import { TERRAIN } from '../../art';
import { RESOURCE_LABELS } from '../ResourceHand';
import { TileIcon } from './BrushPicker';
import type { EditorSelection } from './EditorCanvas';
import LinkPicker from './LinkPicker';
import { KIND_LABELS, KIND_ORDER } from './tools';

const NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

export function KindSwatch({ kind }: { kind: DesignKind }) {
  return <span className="kind-swatch" style={{ background: TERRAIN[kind].color }} aria-hidden="true" />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inspector-field">
      <span className="inspector-label">{label}</span>
      {children}
    </div>
  );
}

const isResource = (kind: string): kind is Resource => RESOURCES.includes(kind as Resource);

/** A terrain for a tile. On a linked tile a resource (or random) sets the whole group; anything else unlinks it. */
function pickTerrain(d: BoardDesign, tile: DesignTile, kind: DesignKind): BoardDesign {
  if (tile.link && (kind === 'land' || isResource(kind)))
    return setGroupKind(d, tile.link, kind === 'land' ? null : kind);
  return paint(d, [tile], kind);
}

/** A kind for a harbor. On a linked harbor a 2:1 resource (or random) sets the whole group; 3:1 unlinks it. */
function pickHarborKind(d: BoardDesign, harbor: DesignHarbor, kind: DesignHarbor['kind']): BoardDesign {
  if (harbor.link && (kind === 'random' || isResource(kind)))
    return setGroupKind(d, harbor.link, kind === 'random' ? null : kind);
  return updateHarbor(d, harbor, { kind, link: undefined });
}

const DOTS = [1, 2, 3, 4, 5];
const DOT_NUMBERS = ['2, 12', '3, 11', '4, 10', '5, 9', '6, 8'];

/** Which dot counts (1–5) this tile's random number may have. All on means no limit. */
function DotLimit({ tile, edit }: { tile: DesignTile; edit: Edit }) {
  const allowed = tile.pips ?? DOTS;
  const toggle = (dots: number) => {
    const next = allowed.includes(dots) ? allowed.filter(d => d !== dots) : [...allowed, dots].sort();
    if (!next.length) return;
    edit(d => updateTile(d, tile.q, tile.r, { pips: next.length === DOTS.length ? undefined : next }));
  };
  return (
    <fieldset className="dot-limit" aria-label="Random number may have">
      <span className="chip-label">{tile.number === undefined ? 'Random may be' : 'If random'}</span>
      {DOTS.map(dots => (
        <button
          key={dots}
          type="button"
          aria-pressed={allowed.includes(dots)}
          aria-label={`${dots} dot${dots === 1 ? '' : 's'} (${DOT_NUMBERS[dots - 1]})`}
          data-tip={`${DOT_NUMBERS[dots - 1]}`}
          className={dots === 5 ? 'hot' : ''}
          onClick={() => toggle(dots)}
        >
          {'•'.repeat(dots)}
        </button>
      ))}
    </fieldset>
  );
}

function TilePanel({
  design,
  tile,
  edit,
  close,
}: {
  design: BoardDesign;
  tile: DesignTile;
  edit: Edit;
  close: () => void;
}) {
  const { q, r } = tile;
  const land = tile.kind !== 'sea' && tile.kind !== 'iceberg';
  const island = land ? islandOf(design, q, r) : [];
  const robberHere = design.robber?.q === q && design.robber.r === r;
  const pirateHere = design.pirate?.q === q && design.pirate.r === r;
  return (
    <section className="inspector-section" aria-label="Selected tile">
      <h3>
        <TileIcon kind={tile.kind} size={30} /> {KIND_LABELS[tile.kind]}
      </h3>
      <Field label="Terrain">
        <div className="kind-grid">
          {KIND_ORDER.map(kind => (
            <button
              key={kind}
              type="button"
              aria-pressed={tile.kind === kind}
              title={TERRAIN[kind].name}
              onClick={() => edit(d => pickTerrain(d, tile, kind))}
            >
              <TileIcon kind={kind} size={30} />
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </Field>
      {takesNumber(tile.kind) && (
        <Field label={tile.kind === 'iceberg' ? 'Drift number' : 'Number'}>
          <div className="number-grid" role="radiogroup" aria-label="Number">
            <button
              type="button"
              role="radio"
              aria-checked={tile.number === undefined}
              onClick={() => edit(d => updateTile(d, q, r, { number: undefined }))}
            >
              ?
            </button>
            {NUMBERS.map(n => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={tile.number === n}
                className={n === 6 || n === 8 ? 'hot' : ''}
                onClick={() => edit(d => updateTile(d, q, r, { number: n }))}
              >
                {n}
              </button>
            ))}
          </div>
          {tile.kind !== 'iceberg' && <DotLimit tile={tile} edit={edit} />}
        </Field>
      )}
      {land && (
        <Field label="Same resource as">
          <LinkPicker design={design} value={tile.link} change={link => edit(d => setLinks(d, [tile], [], link))} />
          <p className="inspector-hint">
            Linked tiles and harbors share one resource: set it here, or leave them random to draw it each game.
          </p>
        </Field>
      )}
      {land && (
        <Field label={`Island (${island.length} tile${island.length === 1 ? '' : 's'})`}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={!!tile.noSetup}
              onChange={e => edit(d => setIslandClosed(d, q, r, e.target.checked))}
            />
            No starting settlements
          </label>
          <div className="chip-row" role="radiogroup" aria-label="Bonus for settling">
            <span className="chip-label">Bonus</span>
            {[0, 1, 2, 3].map(n => {
              const current = island.find(t => t.bonus)?.bonus ?? 0;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={current === n}
                  onClick={() => edit(d => setIslandBonus(d, q, r, n))}
                >
                  {n ? `+${n}` : 'None'}
                </button>
              );
            })}
          </div>
        </Field>
      )}
      {(land || tile.kind === 'sea') && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={land ? robberHere : pirateHere}
            onChange={e =>
              edit(d =>
                land
                  ? { ...d, robber: e.target.checked ? { q, r } : null }
                  : { ...d, pirate: e.target.checked ? { q, r } : null },
              )
            }
          />
          {land ? 'Robber starts here' : 'Pirate starts here'}
        </label>
      )}
      <button
        type="button"
        className="button secondary danger"
        onClick={() => {
          edit(d => paint(d, [{ q, r }], 'erase'));
          close();
        }}
      >
        <Trash2 size={16} />
        Delete tile
      </button>
    </section>
  );
}

const HARBOR_KINDS: DesignHarbor['kind'][] = ['random', 'any', ...RESOURCES];
const harborLabel = (kind: DesignHarbor['kind']) =>
  kind === 'random' ? 'Random' : kind === 'any' ? '3:1 any' : `2:1 ${RESOURCE_LABELS[kind as Resource]}`;

function HarborPanel({
  design,
  harbor,
  edit,
  close,
}: {
  design: BoardDesign;
  harbor: DesignHarbor;
  edit: Edit;
  close: () => void;
}) {
  return (
    <section className="inspector-section" aria-label="Selected harbor">
      <h3>Harbor</h3>
      <Field label="Trade">
        <div className="chip-row wrap" role="radiogroup" aria-label="Harbor kind">
          {HARBOR_KINDS.map(kind => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={harbor.kind === kind}
              onClick={() => edit(d => pickHarborKind(d, harbor, kind))}
            >
              {harborLabel(kind)}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Same resource as">
        <LinkPicker design={design} value={harbor.link} change={link => edit(d => setLinks(d, [], [harbor], link))} />
      </Field>
      <button
        type="button"
        className="button secondary danger"
        onClick={() => {
          edit(d => ({
            ...d,
            harbors: d.harbors.filter(h => tileKey(h.q, h.r) !== tileKey(harbor.q, harbor.r) || h.side !== harbor.side),
          }));
          close();
        }}
      >
        <Trash2 size={16} />
        Delete harbor
      </button>
    </section>
  );
}

/** The panel for whatever is selected on the canvas, or a hint when nothing is. */
export default function Inspector({
  design,
  selection,
  select,
  edit,
}: {
  design: BoardDesign;
  selection: EditorSelection;
  select: (selection: EditorSelection) => void;
  edit: Edit;
}) {
  const tile =
    selection?.kind === 'tile' ? design.tiles.find(t => t.q === selection.q && t.r === selection.r) : undefined;
  const harbor =
    selection?.kind === 'harbor'
      ? design.harbors.find(h => h.q === selection.q && h.r === selection.r && h.side === selection.side)
      : undefined;
  if (tile) return <TilePanel design={design} tile={tile} edit={edit} close={() => select(null)} />;
  if (harbor) return <HarborPanel design={design} harbor={harbor} edit={edit} close={() => select(null)} />;
  return (
    <section className="inspector-section inspector-empty">
      <p>Click a tile or harbor to change it.</p>
    </section>
  );
}
