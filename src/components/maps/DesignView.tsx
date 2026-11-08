import { useId } from 'react';
import { HEX_RADIUS, hexCenter } from '../../../shared/board';
import type { BoardDesign } from '../../../shared/maps';
import { ArtDefs, SEA } from '../../art';
import EditorLayer from '../editor/EditorLayer';
import PanZoomSvg from './PanZoomSvg';

/** A design shown as designed, random parts as "?", in a pannable, zoomable view. */
export default function DesignView({ design }: { design: BoardDesign }) {
  const uid = useId().replace(/:/g, '');
  const points = design.tiles.map(t => hexCenter(t.q, t.r));
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const pad = HEX_RADIUS * 1.4;
  const frame = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
  return (
    <div className="map-preview">
      <PanZoomSvg
        frame={frame}
        label={`${design.name} map`}
        defs={
          <>
            <ArtDefs uid={uid} />
            <SEA.Defs uid={uid} />
          </>
        }
      >
        <rect {...frame} fill="#0b5568" />
        <EditorLayer uid={uid} design={design} readOnly />
      </PanZoomSvg>
    </div>
  );
}
