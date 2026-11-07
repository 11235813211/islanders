import { describe, expect, it } from 'vitest';
import { parseOptionalName, validateAction } from '../server/protocol';
import { ORDERED_NUMBERS, spiralHexes } from '../shared/board';
import { addPlayer, applyAction, createGame, GameError, normalizeGame } from '../shared/engine';
import { GUEST_NAMES } from '../shared/guest-names';
import { guestName, validSettings } from '../shared/settings';
import { grant, makeLobby, TEST_NOW as now, seeded, settled } from './fixtures';

describe('lobby setup', () => {
  it('uses the standard number order on a new board', () => {
    const game = createGame('HARBOR42', seeded());
    expect(game.settings.numberLayout).toBe('ordered');
    expect(
      spiralHexes(game.board)
        .filter(h => h.terrain !== 'desert')
        .map(h => h.number),
    ).toEqual(ORDERED_NUMBERS);
  });

  it('gives new seats distinct colors in the default order', () => {
    expect(makeLobby(4).players.map(p => p.color)).toEqual(['red', 'blue', 'white', 'orange']);
  });

  it('lets any player switch to a free color before the game starts', () => {
    let game = makeLobby(3);
    game = applyAction(game, 'p1', { type: 'choose-color', color: 'purple' }, seeded(), now);
    expect(game.players.find(p => p.id === 'p1')!.color).toBe('purple');
    expect(() => applyAction(game, 'p2', { type: 'choose-color', color: 'purple' }, seeded(), now)).toThrow(GameError);
    expect(() => applyAction(game, 'p2', { type: 'choose-color', color: 'teal' as never }, seeded(), now)).toThrow(
      GameError,
    );
    // A newcomer skips colors already chosen.
    game = addPlayer(game, { id: 'p3', name: 'Late' });
    expect(new Set(game.players.map(p => p.color)).size).toBe(4);
    expect(() => applyAction(settled(), 'p0', { type: 'choose-color', color: 'black' }, seeded(), now)).toThrow(
      GameError,
    );
  });

  it('migrates rooms saved with numeric colors', () => {
    const legacy = makeLobby(3);
    delete (legacy as Partial<typeof legacy>).schemaVersion;
    legacy.players.forEach((p, i) => {
      (p as unknown as { color: number }).color = i;
    });
    expect(normalizeGame(legacy, now).players.map(p => p.color)).toEqual(['orange', 'blue', 'white']);
  });

  it('ends the game at the configured points target', () => {
    const lobby = makeLobby(2);
    expect(validSettings({ ...lobby.settings, victoryPoints: 2 })).toBe(false);
    expect(validSettings({ ...lobby.settings, victoryPoints: 21 })).toBe(false);
    expect(
      applyAction(lobby, 'p0', { type: 'configure', settings: { ...lobby.settings, victoryPoints: 3 } }, seeded(), now)
        .settings.victoryPoints,
    ).toBe(3);
    // After setup each player has 2 points; upgrading a settlement makes 3.
    const upgrade = (target: number) => {
      const game = settled(2);
      game.settings.victoryPoints = target;
      game.phase = 'build';
      grant(game, 'p0', { wheat: 2, ore: 3 });
      const site = Object.entries(game.buildings).find(([, b]) => b.playerId === 'p0')![0];
      return applyAction(game, 'p0', { type: 'build-city', vertexId: site }, seeded(), now);
    };
    expect(upgrade(4).phase).toBe('build');
    const won = upgrade(3);
    expect(won.phase).toBe('finished');
    expect(won.winnerId).toBe('p0');
    expect(won.log.at(-1)?.text).toContain('reached 3 points');
  });
});

describe('guest names', () => {
  it('picks an unused name from the editable list, then numbers repeats', () => {
    const first = guestName([], () => 0);
    expect(GUEST_NAMES).toContain(first);
    const all = GUEST_NAMES.reduce<string[]>(taken => [...taken, guestName(taken, seeded())], []);
    expect(new Set(all).size).toBe(GUEST_NAMES.length);
    expect(guestName(all, () => 0)).toBe(`${GUEST_NAMES[0]} 2`);
  });

  it('treats a blank name as a request for a guest name', () => {
    expect(parseOptionalName({ name: '   ' })).toBeNull();
    expect(parseOptionalName({})).toBeNull();
    expect(parseOptionalName({ name: ' Ana ' })).toBe('Ana');
    expect(() => parseOptionalName({ name: 'x'.repeat(25) })).toThrow();
  });

  it('accepts color choices only from the palette', () => {
    expect(validateAction({ type: 'choose-color', color: 'green' })).toEqual({ type: 'choose-color', color: 'green' });
    expect(() => validateAction({ type: 'choose-color', color: 'yellow' })).toThrow();
  });
});
