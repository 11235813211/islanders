import { CloudFog, Shuffle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { type BoardDesign, buildBoard } from '../../../shared/maps';
import { ArtDefs, SEA } from '../../art';
import { boardFrame } from '../../lib/boardCamera';
import BoardScene from '../BoardScene';
import PanZoomSvg from './PanZoomSvg';

/**
 * A sample game board drawn from a design, for the editor's Preview. "New draw" draws again;
 * "Show fog" shows what each fog tile hides, as at the end of a game.
 */
export default function MapPreview({ design }: { design: BoardDesign }) {
  const uid = useId().replace(/:/g, '');
  const [draw, setDraw] = useState(0);
  const [showFog, setShowFog] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `draw` asks for a fresh random layout.
  const built = useMemo(() => buildBoard(design), [design, draw]);
  const frame = boardFrame(built.board.hexes);
  const hasFog = Object.keys(built.fog).length > 0;
  return (
    <div className="map-preview">
      <PanZoomSvg
        frame={frame}
        label={`${design.name} sample`}
        defs={
          <>
            <ArtDefs uid={uid} />
            <SEA.Defs uid={uid} />
          </>
        }
      >
        <BoardScene
          uid={uid}
          board={built.board}
          frame={frame}
          robber={built.robber}
          pirate={built.pirate}
          showClosed
          peeks={showFog ? built.fog : {}}
        />
      </PanZoomSvg>
      <div className="map-preview-actions">
        <button type="button" className="button secondary" onClick={() => setDraw(n => n + 1)}>
          <Shuffle size={17} />
          New draw
        </button>
        {hasFog && (
          <button
            type="button"
            className="button secondary"
            aria-pressed={showFog}
            onClick={() => setShowFog(on => !on)}
          >
            <CloudFog size={17} />
            Show fog
          </button>
        )}
      </div>
    </div>
  );
}
