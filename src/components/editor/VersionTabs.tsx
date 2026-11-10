import { Plus, X } from 'lucide-react';
import type { BoardDesign } from '../../../shared/maps';
import { playerRange } from '../maps/mapInfo';

/**
 * Tabs for a board's versions by player count: the main layout, each version, and + to copy the
 * one shown as a new version. Each tab edits its own tiles, harbors, starts, players, and points.
 */
export default function VersionTabs({
  design,
  version,
  setVersion,
  add,
  remove,
}: {
  design: BoardDesign;
  version: number | null;
  setVersion: (version: number | null) => void;
  add: () => void;
  remove: (version: number) => void;
}) {
  const versions = design.versions ?? [];
  return (
    <div className="version-tabs" role="tablist" aria-label="Versions by player count">
      <button
        type="button"
        role="tab"
        aria-selected={version === null}
        data-tip="The main layout"
        onClick={() => setVersion(null)}
      >
        {playerRange(design.players)}
      </button>
      {versions.map((v, i) => (
        <span key={i} className="version-tab">
          <button
            type="button"
            role="tab"
            aria-selected={version === i}
            data-tip={`The layout for ${playerRange(v.players)} players`}
            onClick={() => setVersion(i)}
          >
            {playerRange(v.players)}
          </button>
          <button
            type="button"
            className="version-remove"
            aria-label={`Delete the ${playerRange(v.players)} player version`}
            onClick={() => {
              if (window.confirm(`Delete the ${playerRange(v.players)} player version?`)) remove(i);
            }}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {versions.length < 4 && (
        <button
          type="button"
          className="version-add"
          aria-label="Add a version for other player counts"
          data-tip="Copy this layout as a version for other player counts"
          onClick={add}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}
