import type { Page } from '@playwright/test';
import { PLAYER_COLORS } from '../shared/colors';
import { applyAction, getView } from '../shared/engine';
import type { ClientMessage, GameState, PlayerColor, ServerMessage } from '../shared/types';
import { seeded } from './fixtures';
/** Deterministic UI scenarios use the real rules engine, without production debug routes. */
export async function mountGame(page: Page, initial: GameState) {
  let game = structuredClone(initial),
    selfId = game.players[0].id;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/rooms', route =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ roomId: game.roomId, playerId: selfId, token: 'a'.repeat(64) }),
    }),
  );
  await page.routeWebSocket(/\/api\/rooms\/.+\/socket$/, socket => {
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
    socket.onMessage(raw => {
      if (raw === 'ping') {
        socket.send('pong');
        return;
      }
      const message = JSON.parse(String(raw)) as ClientMessage;
      try {
        if (message.type === 'view-as') selfId = message.playerId;
        if (message.type === 'action') game = applyAction(game, selfId, message.action, seeded(), Date.now());
        send({
          type: 'state',
          state: getView(game, selfId),
          online: game.players.map(p => p.id),
          ...(message.type === 'action' ? { acknowledgedId: message.id } : {}),
        });
      } catch (error) {
        send({
          type: 'error',
          message: (error as Error).message,
          ...(message.type === 'action' ? { id: message.id } : {}),
        });
      }
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create solo test room' }).click();
  await page.locator('.board-svg').waitFor();
  // Let hand cards finish arriving (an empty hand, as in setup, has nothing to wait for).
  await page
    .locator('.cards-physical')
    .evaluateAll(async elements =>
      Promise.all(elements.flatMap(element => element.getAnimations().map(animation => animation.finished))),
    );
  return { state: () => game, errors };
}
/** A seat color's CSS value as the browser reports it, e.g. accent('blue') → 'rgb(31, 79, 214)'. */
export function seatRgb(color: PlayerColor, tone: 'fill' | 'accent' = 'accent'): string {
  const hex = PLAYER_COLORS[color][tone].slice(1);
  return `rgb(${[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
}
