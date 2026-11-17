import { Image, Plus, X } from 'lucide-react';
import { type BoardDesign, thumbnailLayout } from '../../../shared/maps';
import { playerRange } from '../maps/mapInfo';

/** One tab: the main layout (null) or a version, by its player range. */
interface Tab {
  version: number | null;
  players: { min: number; max: number };
}

/** The main layout and each version, fewest players first. */
const tabsOf = (design: BoardDesign): Tab[] =>
  [
    { version: null, players: design.players },
    ...(design.versions ?? []).map((v, i) => ({ version: i, players: v.players })),
  ].sort((a, b) => a.players.min - b.players.min);

/**
 * Tabs for a board's versions by player count, fewest players first: each edits its own tiles,
 * harbors, starts, players, and points; + copies the one shown as a new version. With several,
 * the picture button makes the shown layout the board's picture in the map browser.
 */
export default function VersionTabs({
  design,
  version,
  setVersion,
  add,
  remove,
  setThumbnail,
}: {
  design: BoardDesign;
  version: number | null;
  setVersion: (version: number | null) => void;
  add: () => void;
  remove: (version: number) => void;
  /** Make the layout for this many players (its fewest) the board's picture. */
  setThumbnail: (players: number) => void;
}) {
  const tabs = tabsOf(design);
  const shown = tabs.find(t => t.version === version) ?? tabs[0]!;
  const picture = thumbnailLayout(design).players.min;
  return (
    <div className="version-tabs" role="tablist" aria-label="Versions by player count">
      {tabs.map(tab => (
        <span key={tab.version ?? 'main'} className="version-tab">
          <button
            type="button"
            role="tab"
            aria-selected={version === tab.version}
            data-tip={tab.version === null ? 'The main layout' : `The layout for ${playerRange(tab.players)} players`}
            onClick={() => setVersion(tab.version)}
          >
            {playerRange(tab.players)}
            {tabs.length > 1 && tab.players.min === picture && <Image size={12} aria-label="(card picture)" />}
          </button>
          {tab.version !== null && (
            <button
              type="button"
              className="version-remove"
              aria-label={`Delete the ${playerRange(tab.players)} player version`}
              onClick={() => {
                if (window.confirm(`Delete the ${playerRange(tab.players)} player version?`)) remove(tab.version!);
              }}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      {tabs.length < 5 && (
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
      {tabs.length > 1 && (
        <button
          type="button"
          className="version-add"
          aria-pressed={shown.players.min === picture}
          aria-label={`Use the ${playerRange(shown.players)} player layout as the card picture`}
          data-tip="Show this layout on the board's card"
          onClick={() => setThumbnail(shown.players.min)}
        >
          <Image size={14} />
        </button>
      )}
    </div>
  );
}
