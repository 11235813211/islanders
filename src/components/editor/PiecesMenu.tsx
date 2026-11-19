import { ChevronDown, RotateCcw } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import {
  type BoardDesign,
  boardExpansions,
  PIECE_LIMITS,
  type PieceSupply,
  SUPPLY_LIMITS,
  type SupplyKind,
} from '../../../shared/maps';
import { useDismiss } from '../../hooks/useDismiss';
import type { PlaceKind } from '../Board';
import PieceIcon from '../PieceIcon';
import CountStepper from './CountStepper';
import './pieces-menu.css';

/** Each kind of piece a player starts with, its icon, and the expansion it needs (if any). */
const KINDS: { kind: SupplyKind; label: string; icon: PlaceKind; needs?: 'seafarers' | 'cartographers' }[] = [
  { kind: 'settlements', label: 'Settlements', icon: 'settlement' },
  { kind: 'cities', label: 'Cities', icon: 'city' },
  { kind: 'roads', label: 'Roads', icon: 'road' },
  { kind: 'ships', label: 'Ships', icon: 'ship', needs: 'seafarers' },
  { kind: 'relays', label: 'Relays', icon: 'relay', needs: 'cartographers' },
];

/** The pieces this board's expansions use. */
const kindsFor = (design: BoardDesign) => {
  const needs = boardExpansions(design);
  return KINDS.filter(k => !k.needs || needs.includes(k.needs));
};

/** Set one count, dropping it when it is the usual one (and the field when nothing differs). */
function withCount(design: BoardDesign, kind: SupplyKind, n: number): BoardDesign {
  const { supply: _old, ...rest } = design;
  const supply: PieceSupply = { ...design.supply, [kind]: n };
  if (n === PIECE_LIMITS[kind]) delete supply[kind];
  return Object.keys(supply).length ? { ...rest, supply } : rest;
}

/**
 * The pieces each player starts with, as a dropdown in the editor's fields row: a stepper per
 * piece the board's expansions use (ships only with Seafarers, relays only with
 * Cartographers), and Reset back to the usual counts.
 */
export default function PiecesMenu({
  design,
  edit,
}: {
  design: BoardDesign;
  edit: (change: (design: BoardDesign) => BoardDesign) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root);
  const kinds = kindsFor(design);
  const changed = kinds.filter(k => design.supply?.[k.kind] !== undefined);
  const summary = changed.length ? `${changed.length} changed` : 'Usual';
  return (
    <div className="expansions-menu pieces-menu" ref={root}>
      <button
        type="button"
        className="expansions-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Starting pieces: ${summary}`}
        data-tip="How many of each piece every player has"
        onClick={() => setOpen(o => !o)}
      >
        <span>Pieces</span>
        <strong>{summary}</strong>
        <ChevronDown size={14} />
      </button>
      {open && (
        <fieldset className="expansions-list pieces-list" aria-label="Starting pieces">
          <span className="inspector-label">Each player has</span>
          {kinds.map(k => {
            const range = SUPPLY_LIMITS[k.kind];
            return (
              <div key={k.kind} className="pieces-row">
                <PieceIcon kind={k.icon} size={22} />
                <span>{k.label}</span>
                <CountStepper
                  label={k.label.toLowerCase()}
                  value={design.supply?.[k.kind] ?? PIECE_LIMITS[k.kind]}
                  min={range.min}
                  max={range.max}
                  set={n => edit(d => withCount(d, k.kind, n))}
                />
              </div>
            );
          })}
          <button
            type="button"
            className="text-button"
            disabled={!design.supply}
            onClick={() =>
              edit(d => {
                const { supply: _s, ...rest } = d;
                return rest;
              })
            }
          >
            <RotateCcw size={15} />
            Usual pieces
          </button>
        </fieldset>
      )}
    </div>
  );
}
