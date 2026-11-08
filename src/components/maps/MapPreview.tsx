import { Shuffle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { type BoardDesign, buildBoard } from '../../../shared/maps';
import { ArtDefs, SEA } from '../../art';
import { boardFrame } from '../../lib/boardCamera';
import BoardScene from '../BoardScene';
import PanZoomSvg from './PanZoomSvg';

/** A sample game board drawn from a design, for the editor's Preview. "New draw" draws again. */
export default function MapPreview({ design }: { design: BoardDesign }) {
  const uid = useId().replace(/:/g, '');
  const [draw, setDraw] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `draw` asks for a fresh random layout.
  const built = useMemo(() => buildBoard(design), [design, draw]);
  const frame = boardFrame(built.board.hexes);
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
        />
      </PanZoomSvg>
      <button type="button" className="button secondary map-redraw" onClick={() => setDraw(n => n + 1)}>
        <Shuffle size={17} />
        New draw
      </button>
    </div>
  );
}
