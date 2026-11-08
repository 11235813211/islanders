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
import { setLinks } from '../../../shared/maps/fill';
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
              onClick={() => edit(d => paint(d, [{ q, r }], kind))}
            >
              <TileIcon kind={kind} size={30} />
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </Field>
      {takesNumber(tile.kind) && (
        <Field label="Number">
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
        </Field>
      )}
      {land && (
        <Field label="Same resource as">
          <LinkPicker design={design} value={tile.link} change={link => edit(d => setLinks(d, [tile], [], link))} />
          <p className="inspector-hint">Linked tiles are random land; the link picks their resource.</p>
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
              onClick={() => edit(d => updateHarbor(d, harbor, { kind }))}
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
