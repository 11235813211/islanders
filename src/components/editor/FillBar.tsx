import { Anchor, ChevronDown, Dices, Eraser, Hash, MapPinned, Mountain, Shuffle, Trash2 } from 'lucide-react';
import { type CSSProperties, type ReactNode, useCallback, useRef, useState } from 'react';
import type { BoardDesign } from '../../../shared/maps';
import {
  clearHarbors,
  clearNumbers,
  fillHarbors,
  fillLand,
  fillNumbers,
  placeHarbors,
  unfillHarbors,
  unfillLand,
} from '../../../shared/maps/fill';
import { RESOURCES, type Resource } from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { useDismiss } from '../../hooks/useDismiss';
import { RESOURCE_LABELS } from '../ResourceHand';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;
/** A fill that draws again on each press (see BoardEditor's `refill`). */
export type Refill = (key: string, fill: (design: BoardDesign, random: () => number) => BoardDesign) => void;

/** One color per group, so fill and clear buttons read at a glance. */
const GROUP_COLORS = { land: '#3b8442', numbers: '#b07c12', harbors: '#1f7fa6', kinds: '#8a5bb8' };

function Group({
  name,
  tip,
  color,
  icon,
  children,
}: {
  name: string;
  tip: string;
  color: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fill-group" role="group" aria-label={name} style={{ '--group': color } as CSSProperties}>
      <span className="fill-group-icon" data-tip={tip} aria-hidden="true">
        {icon}
      </span>
      {children}
    </div>
  );
}

/** An icon button: `fill` draws (solid), `clear` undoes the fill (outlined). `tip` shows on hover. */
function FillButton({
  label,
  tip,
  icon,
  kind,
  onClick,
  pressed,
}: {
  label: string;
  tip: string;
  icon: ReactNode;
  kind: 'fill' | 'clear' | 'toggle';
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`fill-button ${kind}`}
      aria-label={label}
      data-tip={tip}
      aria-pressed={kind === 'toggle' ? !!pressed : undefined}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

const HARBOR_KINDS: (Resource | 'any')[] = ['any', ...RESOURCES];
const kindLabel = (kind: Resource | 'any') => (kind === 'any' ? '3:1 any' : `2:1 ${RESOURCE_LABELS[kind]}`);

/** Which kinds random harbors can become. All are on by default; the design stores the ones turned off. */
function HarborKindsMenu({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root);
  const allowed = HARBOR_KINDS.filter(k => !design.harborExclude.includes(k));
  const toggle = (kind: Resource | 'any') =>
    edit(d => ({
      ...d,
      harborExclude: d.harborExclude.includes(kind)
        ? d.harborExclude.filter(k => k !== kind)
        : [...d.harborExclude, kind],
    }));
  return (
    <div className="harbor-kinds" ref={root}>
      <button
        type="button"
        className="fill-button menu"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Random harbors can give: ${allowed.length === HARBOR_KINDS.length ? 'all kinds' : allowed.map(kindLabel).join(', ') || 'nothing (3:1)'}`}
        data-tip="Choose which kinds random harbors can become"
        onClick={() => setOpen(o => !o)}
      >
        <span className="harbor-kinds-count">
          {allowed.length}/{HARBOR_KINDS.length}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="harbor-kinds-menu" role="group" aria-label="Random harbors can give">
          <span className="inspector-label">Random harbors can give</span>
          {HARBOR_KINDS.map(kind => (
            <label key={kind} className="check-row">
              <input type="checkbox" checked={allowed.includes(kind)} onChange={() => toggle(kind)} />
              {kind === 'any' ? <span className="any-harbor">3:1</span> : <ResourceIcon resource={kind} size={20} />}
              {kindLabel(kind)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The editor's fills, grouped and color-coded: land, numbers, harbor spots, harbor kinds. Each
 * fill draws again when pressed again; each clear makes that part random (or empty) again.
 */
export default function FillBar({ design, edit, refill }: { design: BoardDesign; edit: Edit; refill: Refill }) {
  return (
    <div className="fill-bar" role="toolbar" aria-label="Fill">
      <Group
        name="Land"
        tip="Land: set or clear the terrain of random land tiles"
        color={GROUP_COLORS.land}
        icon={<Mountain size={17} />}
      >
        <FillButton
          kind="fill"
          label="Fill land"
          tip="Give every random land tile a terrain from the mix. Press again for a new draw."
          icon={<Dices size={17} />}
          onClick={() => refill('land', fillLand)}
        />
        <FillButton
          kind="clear"
          label="Unfill land"
          tip="Make every land tile random again, drawn from the mix each game"
          icon={<Eraser size={17} />}
          onClick={() => edit(unfillLand)}
        />
      </Group>
      <Group
        name="Numbers"
        tip="Numbers: the tokens on producing tiles"
        color={GROUP_COLORS.numbers}
        icon={<Hash size={17} />}
      >
        <FillButton
          kind="fill"
          label="Fill numbers"
          tip="Give every tile without a number a balanced one. Press again for a new draw."
          icon={<Dices size={17} />}
          onClick={() => refill('numbers', fillNumbers)}
        />
        <FillButton
          kind="clear"
          label="Clear numbers"
          tip="Make every number random again, drawn each game"
          icon={<Eraser size={17} />}
          onClick={() => edit(clearNumbers)}
        />
        <FillButton
          kind="toggle"
          label="Swap equal-odds numbers each game (2↔12, 3↔11, 4↔10, 5↔9, 6↔8)"
          tip="Each game, swap set numbers with their equal-odds partner (2↔12, 3↔11, 4↔10, 5↔9, 6↔8)"
          icon={<Shuffle size={17} />}
          pressed={design.swapNumbers}
          onClick={() => edit(d => ({ ...d, swapNumbers: !d.swapNumbers }))}
        />
      </Group>
      <Group
        name="Harbors"
        tip="Harbors: where they sit on the coast"
        color={GROUP_COLORS.harbors}
        icon={<Anchor size={17} />}
      >
        <FillButton
          kind="fill"
          label="Place harbors"
          tip="Add harbors spread around the coasts. Press again for a new spread."
          icon={<MapPinned size={17} />}
          onClick={() => refill('place-harbors', placeHarbors)}
        />
        <FillButton
          kind="clear"
          label="Remove all harbors"
          tip="Remove every harbor. A board with none gets harbors at random spots each game."
          icon={<Trash2 size={17} />}
          onClick={() => edit(clearHarbors)}
        />
      </Group>
      <Group
        name="Harbor kinds"
        tip="Harbor kinds: what each harbor trades"
        color={GROUP_COLORS.kinds}
        icon={<span className="any-harbor small">2:1</span>}
      >
        <FillButton
          kind="fill"
          label="Fill harbor kinds"
          tip="Give every random harbor a kind. Press again for a new draw."
          icon={<Dices size={17} />}
          onClick={() => refill('fill-harbors', fillHarbors)}
        />
        <FillButton
          kind="clear"
          label="Make harbor kinds random"
          tip="Make every harbor's kind random again, drawn each game"
          icon={<Eraser size={17} />}
          onClick={() => edit(unfillHarbors)}
        />
        <HarborKindsMenu design={design} edit={edit} />
      </Group>
    </div>
  );
}
