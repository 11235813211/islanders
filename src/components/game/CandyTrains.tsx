import { useMemo } from 'react';
import type { Board, CandyLoad } from '../../../shared/types';
import { CandyRailways, type RailRoad, type RailTrack } from '../../art';

/** The board's trains as tracks to draw; a loaded train carries what is left on it and stops at the next picker. */
function boardTracks(board: Board, load: CandyLoad | null): RailTrack[] {
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  return (board.trains ?? []).map((train, i) => ({
    points: train.vertexIds.map(id => vertices.get(id)!),
    side: train.side,
    number: train.number,
    cargo: load?.train === i ? load.cards : [],
    ...(load?.train === i && load.picks[0] ? { stop: train.vertexIds.indexOf(load.picks[0].vertexId) } : {}),
  }));
}

/**
 * Christmas Candy: the trains on the game board. A loaded train drives along its track and stops
 * at each building whose owner is picking, like a depot, then backs into its start station.
 */
export default function CandyTrains({
  board,
  load,
  roads,
}: {
  board: Board;
  load: CandyLoad | null;
  roads: RailRoad[];
}) {
  const tracks = useMemo(() => boardTracks(board, load), [board, load]);
  if (!tracks.length) return null;
  return <CandyRailways tracks={tracks} parked roads={roads} />;
}
