import { trainCorners } from '../../../shared/maps/candy-board';
import type { Board, CandyLoad } from '../../../shared/types';
import { CandyRailways, type RailRoad, type RailTrack } from '../../art';

/** The board's trains as tracks to draw; a loaded train carries what is left on it and stops at the next picker. */
export function boardTracks(board: Board, load: CandyLoad | null): RailTrack[] {
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  return (board.trains ?? []).map((train, i) => ({
    legs: [train, ...(train.legs ?? [])].map(leg => ({
      points: leg.vertexIds.map(id => vertices.get(id)!),
      side: leg.side,
    })),
    number: train.number,
    cargo: load?.train === i ? load.cards : [],
    ...(load?.train === i && load.picks[0] ? { stop: trainCorners(train).indexOf(load.picks[0].vertexId) } : {}),
  }));
}

/**
 * Christmas Candy: the trains on the game board. A loaded train comes out of its start tunnel and
 * stops at each building whose owner is picking, then drives on into the end tunnel. The board
 * draws the rails over the roads, then the cars between the buildings behind and in front.
 */
export default function CandyTrains({
  tracks,
  roads = [],
  layer,
}: {
  tracks: RailTrack[];
  roads?: RailRoad[];
  layer: 'rails' | 'cars';
}) {
  if (!tracks.length) return null;
  return <CandyRailways tracks={tracks} parked roads={roads} layer={layer} />;
}
