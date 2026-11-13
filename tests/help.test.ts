import { describe, expect, it } from 'vitest';
import { getActivePlayerId, getView } from '../shared/engine';
import { BUILTIN_BOARDS } from '../shared/maps';
import { gameHelp, lobbyHelp } from '../src/components/help/helpContent';
import { makeLobby, seaSettled, settled } from './fixtures';

type Sections = ReturnType<typeof gameHelp>;
/** The How to tab only: the other tabs are rules that every game shows. */
const howTo = (sections: Sections) => sections.filter(s => (s.tab ?? 'ui') === 'ui');
const titles = (sections: Sections) => howTo(sections).map(s => s.title);
const text = (sections: Sections) =>
  howTo(sections)
    .flatMap(s => s.lines)
    .join(' ');

describe('help', () => {
  it('fits the base game: no ship, sea, or special build sections', () => {
    const game = settled(3);
    const view = getView(game, getActivePlayerId(game)!);
    const help = gameHelp(view, true);
    expect(titles(help)).toEqual(['Right now', 'Building', 'Trading', 'Development cards', 'The table']);
    expect(help[0]!.lines[0]).toMatch(/Roll dice/);
    expect(text(help)).not.toMatch(/ship|pirate/i);
  });

  it('says tap on touch screens and click with a mouse', () => {
    const view = getView(settled(3), 'p0');
    expect(text(gameHelp(view, true))).toMatch(/Tap /);
    expect(text(gameHelp(view, false))).toMatch(/Click /);
    expect(text(gameHelp(view, false))).not.toMatch(/Tap /);
  });

  it('tells a waiting player whose turn it is', () => {
    const game = settled(3);
    const waiting = game.players.find(p => p.id !== getActivePlayerId(game))!.id;
    expect(gameHelp(getView(game, waiting), true)[0]!.lines[0]).toMatch(/^Waiting for /);
  });

  it('adds ships and the pirate on sea maps', () => {
    const design = BUILTIN_BOARDS.find(b => b.categoryId === 'seafaring')!;
    const view = getView(seaSettled(design, 3), 'p0');
    expect(view.seafaring).toBe(true);
    expect(text(gameHelp(view, true))).toMatch(/Move/);
  });

  it('has a tab for the base game and each expansion, with the Cartographers edge cases', () => {
    const help = gameHelp(getView(settled(3), 'p0'), true);
    expect(new Set(help.map(s => s.tab ?? 'ui'))).toEqual(
      new Set(['ui', 'base', 'seafarers', 'tropics', 'cartographers']),
    );
    const cartographers = help
      .filter(s => s.tab === 'cartographers')
      .flatMap(s => s.lines)
      .join(' ');
    expect(cartographers).toMatch(/harbor’s edge/);
    expect(cartographers).toMatch(/1 lodestone to see what one fog tile hides/);
    expect(cartographers).toMatch(/Gold fields and volcanoes can’t be charted/);
  });

  it('explains the special build phase only with 5 or 6 players', () => {
    expect(titles(gameHelp(getView(settled(5), 'p0'), true))).toContain('Special build (5–6 players)');
    expect(titles(gameHelp(getView(settled(4), 'p0'), true))).not.toContain('Special build (5–6 players)');
  });

  it('tells the host to start the game and guests to wait', () => {
    const lobby = makeLobby(2);
    expect(text(lobbyHelp(getView(lobby, 'p0')))).toMatch(/Start game/);
    expect(text(lobbyHelp(getView(lobby, 'p1')))).toMatch(/The host picks/);
  });
});
