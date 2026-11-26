import { describe, expect, it } from 'vitest';
import { applyAction } from '../shared/engine';
import { designFor, parseDesign } from '../shared/maps';
import { BASE_BOARD_ID, baseGameDesign } from '../shared/maps/edit';
import { addVersion } from '../src/components/editor/versions';
import { makeLobby, seeded, TEST_NOW } from './fixtures';

const chooseBase = (players: number, design?: ReturnType<typeof baseGameDesign>) =>
  applyAction(makeLobby(players), 'p0', { type: 'choose-map', mapId: 'base' }, seeded(), TEST_NOW, { design });

describe('editing the base game', () => {
  it('starts from the three islands, which pass validation (7–8 players included)', () => {
    const base = baseGameDesign('cat');
    expect(base.id).toBe(BASE_BOARD_ID);
    const parsed = parseDesign(base, ['cat']);
    expect(parsed.versions?.map(v => v.players)).toEqual([
      { min: 5, max: 6 },
      { min: 7, max: 8 },
    ]);
    const land = (players: number) => designFor(parsed, players).tiles.filter(t => t.kind !== 'sea').length;
    expect([land(4), land(6), land(8)]).toEqual([19, 30, 37]);
    expect(designFor(parsed, 8).harbors).toHaveLength(13);
  });

  it('plays the edited base game in place of the random island, and the random one without it', () => {
    const edited = chooseBase(8, baseGameDesign('cat'));
    expect(edited.map?.id).toBe('base');
    expect(edited.board.hexes.filter(h => h.terrain !== 'sea')).toHaveLength(37);
    const plain = chooseBase(4);
    expect(plain.map).toBeNull();
    expect(plain.board.hexes).toHaveLength(19);
  });

  it('adds versions two player counts at a time, up to 7–8', () => {
    const one = { ...baseGameDesign('cat'), versions: undefined };
    const two = addVersion(one, one);
    const three = addVersion(two, one);
    expect(three.versions?.map(v => v.players)).toEqual([
      { min: 5, max: 6 },
      { min: 7, max: 8 },
    ]);
  });
});
