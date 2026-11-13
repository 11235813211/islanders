import { type Page, test } from '@playwright/test';
import { richGame } from './fixtures';
import { mountGame } from './ui-harness';

/**
 * A measuring tool, not a check (CI skips it, see playwright.config.ts): drags and pinches the
 * board with touch pointers on a phone-sized page and prints how long the board takes to start
 * moving, the frame gaps while it moves, and how long it takes to settle after the fingers lift.
 *
 *   npx playwright test tests/gesture-perf.spec.ts   (Chrome, CPU slowed 4×)
 *
 * Measure the production build for real numbers: `npx vite build && npx vite preview --port 4173`,
 * then add PLAYTEST_URL=http://127.0.0.1:4173. PERF_CSS='…' adds a stylesheet to try a CSS idea.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

type Step = { x: number; y: number }[];

/** Plays a touch gesture as pointer events inside the page, one move per frame, and measures it. */
function play(page: Page, steps: Step[]) {
  return page.evaluate(async steps => {
    const frames: number[] = [];
    const moved: number[] = [];
    const svg = document.querySelector('.board-svg')!;
    const observer = new MutationObserver(() => moved.push(performance.now()));
    observer.observe(svg, { attributes: true, attributeFilter: ['style', 'viewBox'] });
    let recording = true;
    const tick = (t: number) => {
      frames.push(t);
      if (recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const fire = (type: string, id: number, p: { x: number; y: number }, target: Element) => {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 1,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    const targets = steps[0]!.map(p => document.elementFromPoint(p.x, p.y)!);
    for (const [i, p] of steps[0]!.entries()) fire('pointerdown', i + 1, p, targets[i]!);
    const start = performance.now();
    for (const step of steps.slice(1)) {
      await new Promise(requestAnimationFrame);
      for (const [i, p] of step.entries()) fire('pointermove', i + 1, p, targets[i]!);
    }
    const ended = performance.now();
    for (const [i, p] of steps.at(-1)!.entries()) fire('pointerup', i + 1, p, targets[i]!);
    await new Promise(r => setTimeout(r, 300));
    recording = false;
    observer.disconnect();
    const during = frames.filter(t => t >= start && t <= ended);
    const gaps = during
      .slice(1)
      .map((t, i) => t - during[i]!)
      .sort((a, b) => a - b);
    const pick = (q: number) => Math.round(gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] ?? 0);
    const firstMove = moved.find(t => t >= start);
    return {
      startMs: firstMove ? Math.round(firstMove - start) : -1,
      p50: pick(0.5),
      p95: pick(0.95),
      worst: Math.round(gaps.at(-1) ?? 0),
      settleMs: Math.round((frames.find(t => t > ended + 1) ?? ended) - ended),
    };
  }, steps);
}

test('board drag and pinch timings on a phone', async ({ page }) => {
  // Against a production build, stand in for a signed-in playtest account so the solo room
  // button shows; the room itself is the harness's fake.
  if (process.env.PLAYTEST_URL) {
    const session = { username: 'perf', displayName: 'Perf', token: 'a'.repeat(64), expiresAt: Date.now() + 3600_000 };
    await page.addInitScript(value => localStorage.setItem('islanders-account', value), JSON.stringify(session));
    await page.route('**/api/accounts/me', route =>
      route.fulfill({ json: { username: 'perf', rooms: [], playtest: true, hasRecoveryCode: true } }),
    );
  }
  await mountGame(page, richGame());
  if (process.env.PERF_CSS) await page.addStyleTag({ content: process.env.PERF_CSS });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const board = (await page.locator('.board-viewport').boundingBox())!;
  const x = board.x + board.width / 2;
  const y = board.y + board.height / 2;
  const n = 40;
  for (const round of [1, 2]) {
    const drag = Array.from({ length: n + 1 }, (_, i) => [{ x: x - i * 3, y: y + i * 2 }]);
    console.log(`drag ${round}: ${JSON.stringify(await play(page, drag))}`);
    const pinch = Array.from({ length: n + 1 }, (_, i) => [
      { x: x - 40 - i * 2, y },
      { x: x + 40 + i * 2, y: y + 10 },
    ]);
    console.log(`pinch ${round}: ${JSON.stringify(await play(page, pinch))}`);
  }
});
