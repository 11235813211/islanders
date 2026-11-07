Use TypeScript for this project. Preserve the illustrated hex artwork.

Do not open links in the user's browser unless they explicitly ask. Headless browser tests are allowed.

Prioritize working gameplay, readable controls, and cross-device (especially phone) testing over marketing copy or rules documentation. Use Node 24 (`nvm use`). Keep UI copy plain and short: no taglines or cute phrasing.

Live site: https://play.islandersgame.workers.dev (Cloudflare Worker `play`, free plan; keep CPU per request small).

## Where things live

- `shared/` runs on client and server.
  - `engine/`: the authoritative rules. `index.ts` is the public API (`applyAction`, `getView`, `advanceTime`, …); import from `shared/engine`, not its files. `apply.ts` dispatches actions to handlers in `lobby.ts`, `turn.ts`, `trade.ts`, `development.ts`, `social.ts`; `time.ts` runs deadlines and bots; `view.ts` is the only projection sent to clients; `migrations.ts` upgrades stored rooms.
  - `actions.ts`: the one table of every action's fields, used by both server and engine.
  - `types.ts` (all state/view/action types), `settings.ts` (defaults and limits), `colors.ts` (seat palette), `guest-names.ts` (editable list), `rules.ts` (scoring helpers), `board.ts`.
  - `bots/`: `beginner.ts`, `strategic.ts` (Intermediate and Advanced profiles), `analysis.ts` (position helpers). Bots read only `GameView`, never hidden state.
- `server/`: `worker.ts` routes HTTP, `room.ts` is one Durable Object per room, `accounts.ts` one per account, `protocol.ts` parses input, `env.ts` shared helpers. `index.ts` only re-exports.
- `src/`: `App.tsx` (screens), `components/RoomLobby.tsx` (lobby and its settings schema), `components/GameTable.tsx` with pieces in `components/game/`, `components/Board.tsx` (targets and clicks), `art/` (all drawings, versioned: see `src/art/README.md`), `hooks/`, `lib/`.
- `src/components/game/phone.css` holds phone-only layout overrides.

## Adding things

- New action: `GameAction` in `shared/types.ts` → one line in `SPEC` in `shared/actions.ts` → a handler in the matching `shared/engine/*.ts` → if it can happen off-turn, add it to `OFF_TURN` in `engine/apply.ts`.
- New room setting: `GameSettings` field → default and check in `shared/settings.ts` → one entry in `CATEGORIES` in `RoomLobby.tsx`.
- New stored field: add it to the type, set it in `createGame`, and append a numbered step to `MIGRATIONS` in `engine/migrations.ts` (never edit an old step).
- New art: `npm run art:new`, then edit the new `src/art/vN`.

## Tests (all tests and test tools live in `tests/`)

- Never write throwaway test scripts elsewhere. Add or extend a file in `tests/` so the next person (or agent) can rerun it instead of rebuilding it. Shared setup goes in `tests/fixtures.ts`, `tests/ui-harness.ts`, `tests/server-helpers.ts`, or `tests/bot-harness.ts`.
- `npm test`: rules, bots, and protocol unit tests (seconds). Run first after any `shared/` or `server/protocol.ts` change.
- `npx playwright test tests/<file>.spec.ts`: browser and real-server tests (starts wrangler and Vite). Run the relevant file, not the whole suite, while iterating.
- `npx playwright test --project=iphone`: phone checks (`tests/phone.spec.ts`).
- Screenshots for review: `npx playwright test tests/visual.spec.ts` writes `test-results/visual-*.png` and `phone-*.png`.
- Bot strength: `GAMES=240 npx vitest run tests/bots.test.ts -t report` (about a minute). Run it after changing bot logic; Advanced should beat Intermediate, which should beat Beginner.
- `npm run check` (lint, unit tests, build) must pass before you say you're done. Report failures honestly.

## Code rules (keep the codebase cheap to read and change)

- Run `npm run format` before finishing; Biome formats and lints (`biome.json`). No minified or one-line-per-file code.
- Keep files focused and under ~400 lines; split by responsibility when they grow (as `engine/` and `components/game/` are).
- One source of truth: don't duplicate rules, validation, constants, or colors. Find the existing home and import it.
- Comment _why_, not _what_: a one-line doc comment on each exported function or component saying what it's for.
- Prefer small named functions over nested ternaries and long inline JSX expressions.
- Delete dead code and failed experiments instead of leaving switches or commented-out blocks.
- Keep `getView` the only path from state to client; never send hidden cards, deck order, or tokens.
- Bots must stay cheap (no deep search) so turns fit the free Workers CPU budget.

## Working efficiently

- Read `AGENTS.md`, then open only the files the task touches; use `grep` to find symbols rather than reading whole directories.
- Use the "Adding things" recipes above instead of re-deriving the architecture.
- Prefer targeted test runs while iterating and one full `npm run check` at the end.
