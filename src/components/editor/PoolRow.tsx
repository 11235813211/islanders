import { useState } from 'react';
import { type FillKind, FOG_POOL, type FogKind, POOL_PRESETS } from '../../../shared/maps';
import { ICEBERG_MAX_PERCENT } from '../../../shared/maps/validate';
import { TileIcon } from './BrushPicker';
import { KIND_LABELS } from './tools';

/** Round to tenths, the finest share a design stores (validate.ts). */
const tenths = (n: number) => Math.round(n * 10) / 10;

/**
 * A number field that lets you clear it and type: the text is kept as typed, saved whenever it
 * reads as a number, and put back to the saved value when you leave it.
 */
function NumberField({
  value,
  max,
  step,
  label,
  set,
}: {
  value: number;
  max: number;
  step: number;
  label: string;
  set: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={step}
      aria-label={label}
      value={draft ?? value}
      onChange={e => {
        setDraft(e.target.value);
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n)) set(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** A share to turn a terrain back on with: its share in the All preset (or the fog stack). */
const defaultShare = (kind: FillKind | FogKind) =>
  (POOL_PRESETS.all as Record<string, number>)[kind] ?? FOG_POOL[kind as FogKind] ?? 1;

/** One terrain's row: on/off, then its share (or, for icebergs, the percent of sea). */
export default function PoolRow({
  kind,
  value,
  set,
  whole = false,
}: {
  kind: FillKind | FogKind;
  value: number;
  set: (n: number) => void;
  /** Whole numbers (exact counts) instead of shares in tenths. */
  whole?: boolean;
}) {
  const iceberg = kind === 'iceberg';
  const integer = iceberg || whole;
  const top = iceberg ? ICEBERG_MAX_PERCENT : 20;
  return (
    <div
      className={`pool-row${value ? '' : ' off'}`}
      title={iceberg ? 'Percent of sea tiles that become icebergs' : 'Share of these tiles'}
    >
      <input
        type="checkbox"
        aria-label={`Use ${KIND_LABELS[kind]}`}
        checked={value > 0}
        onChange={e => set(e.target.checked ? defaultShare(kind) : 0)}
      />
      <TileIcon kind={kind} size={22} />
      <span>{KIND_LABELS[kind]}</span>
      <NumberField
        max={top}
        step={integer ? 1 : 0.5}
        label={iceberg ? 'Iceberg percent of sea' : `${KIND_LABELS[kind]} ${whole ? 'count' : 'share'}`}
        value={value}
        set={n => {
          const clamped = Math.max(0, Math.min(top, n));
          set(integer ? Math.round(clamped) : tenths(clamped));
        }}
      />
      {iceberg && <small>% sea</small>}
    </div>
  );
}
