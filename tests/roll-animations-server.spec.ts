import { expect, test } from '@playwright/test';
import { join, PlayerConnection } from './server-helpers';

/** What the page saw of one animated element (dice or a drifting iceberg). */
interface Seen {
  kind: 'dice' | 'iceberg';
  /** How far it got (ms) and how long it runs. */
  reached: number;
  duration: number;
  /** It went back to an earlier point (restarted) while still on screen. */
  restarted: boolean;
  /** Still on the page when sampling stopped. */
  attached: boolean;
  /** Dice only: the closest the dice came to the middle of the board (px). */
  closest: number;
}

/**
 * A real room (real server, real alarms) on Fire and Ice with three bots, watched in the browser:
 * every roll's dice and every drifting iceberg must play to the end, never cut off or restarted,
 * and the dice must tumble through the middle of the board every time (not just the first roll).
 */
test('in a real room, every roll tumbles through the middle and every iceberg drift plays out in full', {
  tag: '@slow',
}, async ({ page, request }) => {
  test.setTimeout(120_000);
  const session = await join(request, 'Watcher');
  const host = new PlayerConnection(session.roomId);
  try {
    await host.authenticate(session);
    await host.action({ type: 'configure', settings: { autoRollSeconds: 5, trackDice: true, turnSeconds: 15 } });
    await host.action({ type: 'choose-map', mapId: 'fire-and-ice' });
    for (let i = 0; i < 3; i++) await host.action({ type: 'add-bot', level: 'advanced' });

    await page.addInitScript(value => {
      const saved = JSON.parse(value) as { roomId: string };
      localStorage.setItem(`islanders:${saved.roomId}`, value);
    }, JSON.stringify(session));
    await page.goto(`/#room=${session.roomId}`);
    await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
    await page.evaluate(() => {
      // Timing comes from each animation's fixed start on the document timeline and the exact
      // moment its element leaves (a DOM observer), so a busy page skipping frames can't skew it.
      const now = () => Number(document.timeline.currentTime ?? 0);
      const seen = new Map<Element, Seen & { at: number; start: number; done: boolean; removedAt: number | null }>();
      (window as unknown as { seen: typeof seen }).seen = seen;
      document.addEventListener(
        'animationend',
        event => {
          const entry = seen.get(event.target as Element);
          if (entry) entry.done = true;
        },
        true,
      );
      new MutationObserver(() => {
        for (const [element, entry] of seen)
          if (!element.isConnected && entry.removedAt === null) entry.removedAt = now();
      }).observe(document.body, { childList: true, subtree: true });
      const sample = () => {
        for (const [selector, kind] of [
          ['.board-dice.rolling', 'dice'],
          ['.iceberg-drift', 'iceberg'],
        ] as const)
          for (const element of document.querySelectorAll(selector)) {
            const animation = element.getAnimations()[0];
            if (!animation || animation.startTime === null) continue;
            const time = Number(animation.currentTime ?? 0);
            const duration = Number(animation.effect?.getComputedTiming().endTime ?? 0);
            const entry = seen.get(element) ?? {
              kind,
              reached: 0,
              duration,
              restarted: false,
              attached: true,
              closest: Number.POSITIVE_INFINITY,
              at: 0,
              start: Number(animation.startTime),
              done: false,
              removedAt: null,
            };
            if (kind === 'dice') {
              const box = element.getBoundingClientRect();
              const board = element.closest('.board-frame')!.getBoundingClientRect();
              const off = Math.hypot(
                box.left + box.width / 2 - (board.left + board.width / 2),
                box.top + box.height / 2 - (board.top + board.height / 2),
              );
              entry.closest = Math.min(entry.closest, off);
            }
            if (time + 50 < entry.at) entry.restarted = true;
            entry.at = time;
            seen.set(element, entry);
          }
        for (const [element, entry] of seen) {
          entry.attached = element.isConnected;
          // How far it really got: all of it, or up to the moment it was taken off the page.
          entry.reached = entry.done
            ? entry.duration
            : Math.min(entry.duration, (entry.removedAt ?? now()) - entry.start);
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    // The watcher's seat plays itself at once, so the test only waits on the bots and real alarms.
    host.autoPlay();
    await host.action({ type: 'start' });
    await expect.poll(() => host.state.turn, { timeout: 90_000, intervals: [500] }).toBeGreaterThanOrEqual(7);
    await page.waitForTimeout(4500);
    const seen = await page.evaluate(() =>
      [...(window as unknown as { seen: Map<Element, Seen> }).seen.values()].map(
        ({ kind, reached, duration, restarted, attached, closest }) => ({
          kind,
          reached,
          duration,
          restarted,
          attached,
          closest: Math.round(closest),
        }),
      ),
    );
    console.log(JSON.stringify(seen));
    const cut = seen.filter(s => s.restarted || (!s.attached && s.reached < s.duration - 100));
    // Every finished roll tumbled through the middle of the board.
    const astray = seen.filter(s => s.kind === 'dice' && !s.attached && s.closest > 40);
    const rolls = host.state.log.filter(entry => entry.event?.kind === 'roll').length;
    console.log(`rolls in log: ${rolls}`);
    expect(seen.filter(s => s.kind === 'dice').length).toBeGreaterThanOrEqual(rolls - 1);
    expect(cut).toEqual([]);
    expect(astray).toEqual([]);
  } finally {
    host.dispose();
  }
});
