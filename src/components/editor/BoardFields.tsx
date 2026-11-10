import { ChevronDown } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import {
  type BoardCategory,
  type BoardDesign,
  boardExpansions,
  EXPANSIONS,
  type Expansion,
  type FillKind,
} from '../../../shared/maps';
import { RICH_LEVELS } from '../../../shared/maps/balance';
import { POOL_KINDS } from '../../../shared/maps/validate';
import { VICTORY_POINT_RANGE } from '../../../shared/settings';

/** Numbers on islands closed to setup: how much richer than the normal mix. */
const RICH_LABELS = ['Normal numbers', 'Better', 'Rich', 'Richer', 'Mostly 6 & 8'];

import { useDismiss } from '../../hooks/useDismiss';
import { TileIcon } from './BrushPicker';
import { KIND_LABELS } from './tools';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** Which expansions the board needs, as a dropdown of checkboxes. */
function ExpansionsMenu({ design, set }: { design: BoardDesign; set: (patch: Partial<BoardDesign>) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root);
  const needs = boardExpansions(design);
  const toggle = (e: Expansion) => set({ expansions: needs.includes(e) ? needs.filter(n => n !== e) : [...needs, e] });
  const summary = needs.length ? needs.map(e => EXPANSIONS[e]).join(', ') : 'None';
  return (
    <div className="expansions-menu" ref={root}>
      <button
        type="button"
        className="expansions-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Required expansions: ${summary}`}
        data-tip="Expansions this board needs, shown on its card in the map picker"
        onClick={() => setOpen(o => !o)}
      >
        <span>Needs</span>
        <strong>{summary}</strong>
        <ChevronDown size={14} />
      </button>
      {open && (
        <fieldset className="expansions-list" aria-label="Required expansions">
          <span className="inspector-label">Required expansions</span>
          {(Object.keys(EXPANSIONS) as Expansion[]).map(e => (
            <label key={e} className="check-row">
              <input type="checkbox" checked={needs.includes(e)} onChange={() => toggle(e)} />
              {EXPANSIONS[e]}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

const BIAS_LABELS = ['Poorer', 'Poor', 'Normal', 'Rich', 'Richer'];
const BIAS_TERRAINS = POOL_KINDS.filter(k => k !== 'iceberg' && k !== 'desert');

/** How good random numbers are on each terrain, as a dropdown of one select per terrain. */
function NumberBiasMenu({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root);
  const bias = design.numberBias ?? {};
  const changed = BIAS_TERRAINS.filter(k => bias[k]);
  const summary = changed.length
    ? changed.map(k => `${KIND_LABELS[k]} ${BIAS_LABELS[(bias[k] ?? 0) + 2]!.toLowerCase()}`).join(', ')
    : 'Even';
  const set = (kind: FillKind, level: number) =>
    edit(d => {
      const next = { ...(d.numberBias ?? {}), [kind]: level || undefined };
      const { numberBias: _old, ...rest } = d;
      return Object.values(next).some(Boolean) ? { ...rest, numberBias: next } : rest;
    });
  return (
    <div className="expansions-menu" ref={root}>
      <button
        type="button"
        className="expansions-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Numbers by terrain: ${summary}`}
        data-tip="Make random numbers better or worse on a terrain, board-wide"
        onClick={() => setOpen(o => !o)}
      >
        <span>Numbers</span>
        <strong>{summary}</strong>
        <ChevronDown size={14} />
      </button>
      {open && (
        <fieldset className="expansions-list bias-list" aria-label="Numbers by terrain">
          <span className="inspector-label">Random numbers by terrain</span>
          {BIAS_TERRAINS.map(kind => (
            <label key={kind} className="bias-row">
              <TileIcon kind={kind} size={20} />
              <span>{KIND_LABELS[kind]}</span>
              <select
                aria-label={`${KIND_LABELS[kind]} numbers`}
                value={bias[kind] ?? 0}
                onChange={e => set(kind, Number(e.target.value))}
              >
                {BIAS_LABELS.map((label, i) => (
                  <option key={label} value={i - 2}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** The board's name, category, players, points to win, and needed expansions, in one row above the canvas. */
export default function BoardFields({
  design,
  categories,
  edit,
}: {
  design: BoardDesign;
  categories: BoardCategory[];
  edit: Edit;
}) {
  const set = (patch: Partial<BoardDesign>, group?: string) => edit(d => ({ ...d, ...patch }), group);
  return (
    <div className="board-fields">
      <input
        className="board-name"
        aria-label="Board name"
        value={design.name}
        maxLength={40}
        onChange={e => set({ name: e.target.value }, 'name')}
      />
      <label>
        <span>Category</span>
        <select value={design.categoryId} onChange={e => set({ categoryId: e.target.value })}>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="board-field" role="group" aria-label="Players">
        <span>Players</span>
        {(['min', 'max'] as const).map(end => (
          <select
            key={end}
            aria-label={end === 'min' ? 'Fewest players' : 'Most players'}
            value={design.players[end]}
            onChange={e => {
              const n = Number(e.target.value);
              const players = { ...design.players, [end]: n };
              if (players.min > players.max) players[end === 'min' ? 'max' : 'min'] = n;
              set({ players });
            }}
          >
            {[2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        ))}
      </div>
      <label>
        <span>Points</span>
        <input
          type="number"
          aria-label="Points to win"
          min={VICTORY_POINT_RANGE.min}
          max={VICTORY_POINT_RANGE.max}
          value={design.victoryPoints}
          onChange={e => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= VICTORY_POINT_RANGE.min && n <= VICTORY_POINT_RANGE.max)
              set({ victoryPoints: n });
          }}
        />
      </label>
      <label data-tip="How much better random numbers are on islands closed to setup settlements">
        <span>Closed islands</span>
        <select
          aria-label="Numbers on closed islands"
          value={design.richIslands ?? 0}
          disabled={!design.tiles.some(t => t.noSetup)}
          onChange={e => {
            const level = Number(e.target.value);
            edit(d => {
              const { richIslands: _r, ...rest } = d;
              return level ? { ...rest, richIslands: level } : rest;
            });
          }}
        >
          {RICH_LABELS.slice(0, RICH_LEVELS + 1).map((label, level) => (
            <option key={label} value={level}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <NumberBiasMenu design={design} edit={edit} />
      <ExpansionsMenu design={design} set={set} />
    </div>
  );
}
