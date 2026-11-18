import { Eye } from 'lucide-react';
import { useState } from 'react';
import { PIECE_STYLES, type PieceStyle, type PlayerColor } from '../../../shared/types';
import PieceIcon from '../PieceIcon';
import { GameDialog } from '../TradePanel';
import type { SettingPreviewProps } from './settings';
import './art-styles.css';

/** Each art style's name, for the lobby's select and its preview. */
export const ART_STYLE_NAMES: Record<PieceStyle, string> = {
  classic: 'Classic',
  chalet: 'Mountain chalet',
  korean: 'Korean',
};

const SAMPLE_COLORS: PlayerColor[] = ['red', 'blue'];

/** One style's settlement and city in each sample color. */
function ArtStyleCard({ style, current }: { style: PieceStyle; current: boolean }) {
  return (
    <article className="art-style" aria-label={ART_STYLE_NAMES[style]}>
      <header>
        <strong>{ART_STYLE_NAMES[style]}</strong>
        {current && <span className="subtle-badge">This room</span>}
      </header>
      <div className="art-style-pieces">
        {SAMPLE_COLORS.flatMap(color =>
          (['settlement', 'city'] as const).map(kind => (
            <PieceIcon key={`${color}-${kind}`} kind={kind} color={color} style={style} size={56} />
          )),
        )}
      </div>
    </article>
  );
}

/** A View button anyone in the room can use to see every art style. */
export default function ArtStylesButton({ view }: SettingPreviewProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button secondary art-style-view" onClick={() => setOpen(true)}>
        <Eye size={16} />
        View
      </button>
      {open && (
        <GameDialog title="Art styles" close={() => setOpen(false)}>
          <div className="art-style-list">
            {PIECE_STYLES.map(style => (
              <ArtStyleCard key={style} style={style} current={view.settings.pieceStyle === style} />
            ))}
          </div>
        </GameDialog>
      )}
    </>
  );
}
