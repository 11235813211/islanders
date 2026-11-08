// Sea-map art for v10. Each tile is its own file with its colors at the top, so a tile can be
// tweaked without touching the others:
//   ocean.tsx (open sea), land.tsx (editor's unassigned land), gold.tsx, jungle.tsx,
//   volcano.tsx, iceberg.tsx, ship.tsx (ship and pirate), markers.tsx (bonus chip, discovery, shore).
import { hexPoints } from '../../../lib/geometry';
import type { SeaArt, SeaTileKind } from '../../types';
import { GoldDefs, GoldTile } from './gold';
import { IcebergTile } from './iceberg';
import { JungleDefs, JungleTile } from './jungle';
import { LandTile } from './land';
import { BonusChip, DiscoveryIcon, IslandBase } from './markers';
import { OceanDefs, Water } from './ocean';
import { Pirate, Ship } from './ship';
import { VolcanoDefs, VolcanoTile } from './volcano';

const terrain: SeaArt['terrain'] = {
  sea: { name: 'Sea', color: '#1c9fc5' },
  gold: { name: 'Gold field · any resource', color: '#d4a64d' },
  jungle: { name: 'Jungle · discoveries', color: '#1b6139' },
  volcano: { name: 'Volcano · any resource, may erupt', color: '#4a3631' },
  iceberg: { name: 'Iceberg · blocks ships', color: '#bfe6f2' },
  land: { name: 'Land (random)', color: '#c5c899' },
};

function Defs({ uid }: { uid: string }) {
  return (
    <>
      <OceanDefs uid={uid} />
      <GoldDefs uid={uid} />
      <JungleDefs uid={uid} />
      <VolcanoDefs uid={uid} />
      <clipPath id={`${uid}-sea-tile`}>
        <polygon points={hexPoints(57.2)} />
      </clipPath>
    </>
  );
}

/** Land tiles sit on a sand rim like the base tiles; water tiles fill the whole hex. */
function SeaTile({ uid, terrain: kind, variant }: { uid: string; terrain: SeaTileKind; variant?: number }) {
  if (kind === 'sea') return <Water uid={uid} variant={variant} />;
  if (kind === 'iceberg') return <IcebergTile uid={uid} variant={variant} />;
  const art = {
    gold: <GoldTile uid={uid} />,
    jungle: <JungleTile uid={uid} />,
    volcano: <VolcanoTile uid={uid} />,
    land: <LandTile />,
  }[kind];
  return (
    <>
      <polygon points={hexPoints(59)} fill="#e8d9b3" stroke="#cfbe96" strokeWidth="1.5" />
      <g clipPath={`url(#${uid}-sea-tile)`} className={`terrain-art terrain-${kind}`}>
        {art}
        <polygon points={hexPoints(56.5)} fill="none" stroke="#fff5d8" strokeOpacity=".18" strokeWidth="1.2" />
      </g>
    </>
  );
}

export const sea: SeaArt = { terrain, Defs, SeaTile, IslandBase, Ship, Pirate, BonusChip, DiscoveryIcon };
