import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { DesignKind } from '../../../shared/maps';
import { ArtDefs, SEA, TERRAIN, Tile } from '../../art';
import { KIND_LABELS, KIND_ORDER } from './tools';

/** A terrain's real tile art as a small hexagon icon. */
export function TileIcon({ kind, size = 26 }: { kind: DesignKind; size?: number }) {
  const uid = `icon${useId().replace(/:/g, '')}`;
  return (
    <svg className="tile-icon" width={size} height={size} viewBox="-62 -62 124 124" aria-hidden="true">
      <defs>
        <ArtDefs uid={uid} />
        <SEA.Defs uid={uid} />
      </defs>
      <Tile uid={uid} terrain={kind} />
    </svg>
  );
}

/** The terrain Ctrl/⌘-drag (and the Paint tool) paints, picked from hexagon icons. */
export default function BrushPicker({ brush, setBrush }: { brush: DesignKind; setBrush: (kind: DesignKind) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div className="brush-picker" ref={root}>
      <button
        type="button"
        className="brush-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Brush: ${KIND_LABELS[brush]}`}
        title={`Brush: ${TERRAIN[brush].name}. Ctrl/⌘-drag paints it.`}
        onClick={() => setOpen(o => !o)}
      >
        <TileIcon kind={brush} size={28} />
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="brush-menu" role="menu" aria-label="Brush terrain">
          {KIND_ORDER.map(kind => (
            <button
              key={kind}
              type="button"
              role="menuitemradio"
              aria-checked={brush === kind}
              title={TERRAIN[kind].name}
              onClick={() => {
                setBrush(kind);
                setOpen(false);
              }}
            >
              <TileIcon kind={kind} size={40} />
              <span>{KIND_LABELS[kind]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
