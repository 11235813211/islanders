Use TypeScript for this project. Preserve the illustrated hex artwork.

Do not open links in the user's browser unless they explicitly ask. Headless browser tests are allowed.

Prioritize working gameplay, readable controls, and cross-device (especially phone) testing over marketing copy or rules documentation. Use Node 24 (`nvm use`). Keep UI copy plain and short: no taglines or cute phrasing.

Live site: https://play.islandersgame.workers.dev (Cloudflare Worker `play`, free plan; keep CPU per request small).

Which published rules are in, which are room variations, and their tests: `docs/rules.md`. Update it with rule changes.

## Where things live

- `shared/` runs on client and server.
  - `engine/`: the authoritative rules. `index.ts` is the public API (`applyAction`, `getView`, `advanceTime`, …); import from `shared/engine`, not its files. `apply.ts` dispatches actions to handlers in `lobby.ts`, `turn.ts`, `trade.ts`, `development.ts`, `social.ts`; `time.ts` runs deadlines and bots; `hands.ts` is the public card count bots see; `view.ts` is the only projection sent to clients; `migrations.ts` upgrades stored rooms.
  - 5–6 players: `isLargeGame` in `engine/core.ts` picks the 30-tile island (`board.ts`), 24-card bank, 34-card deck, and the special build phase (`'special-build'`, see `end-turn` in `engine/turn.ts`).
  - `engine/sea.ts` (ships, gold choices, rolling volcano dice), `engine/fog.ts` (revealing fog) and `engine/production.ts` (rolls, gold, jungle, volcano eruptions) hold the sea-map rules; `seafaring.ts` is the shared land/sea geometry (which edges take roads or ships, islands).
  - `maps/`: designed boards. `types.ts` (BoardDesign), `generate.ts` (design → Board with balanced random fills), `balance.ts`, `builtin.ts` (the maps that ship, drawn as token grids), `edit.ts` (board-editor edits, pure), `fill.ts` (the editor's fills, unfills, and links; linked pieces are always random), `validate.ts`, `library.ts`.
  - `actions.ts`: the one table of every action's fields, used by both server and engine.
  - `types.ts` (all state/view/action types), `settings.ts` (defaults and limits), `colors.ts` (seat palette), `guest-names.ts` (editable list), `rules.ts` (scoring helpers), `board.ts`.
  - `bots/`: `beginner.ts`, `strategic.ts` (Intermediate, hand-written), `advanced/` (trained: setup lookahead + network, planner knobs, all numbers in `params.ts` and `weights.json`), `analysis.ts` (position helpers). Bots read only `GameView`, never hidden state.
- `server/`: `worker.ts` routes HTTP, `room.ts` is one Durable Object per room, `accounts.ts` one per account, `boards.ts` the one board library (`/api/boards`; editing is limited to `PLAYTEST_USERS`), `recording.ts` saves consented game records (`shared/replay.ts` is the format and replay; `/api/records`, `PLAYTEST_USERS` only), `protocol.ts` parses input, `env.ts` shared helpers. `index.ts` only re-exports.
- `training/`: self-play training for the Advanced bot (tuning, the setup network, evaluation). Read `training/README.md` first; its results log says what has been tried.
- `src/`: `App.tsx` (screens), `components/RoomLobby.tsx` (lobby and its settings schema), `components/GameTable.tsx` with pieces in `components/game/`, `components/Board.tsx` (targets and clicks) over `components/BoardScene.tsx` (the map art, shared with previews and the editor), `components/maps/` (map picker), `components/editor/` (board editor), `components/help/` (the (i) how-to dialog; its text follows the game in view), `art/` (all drawings, versioned: see `src/art/README.md`), `hooks/`, `lib/`.
- `src/components/game/phone.css` holds phone-only layout overrides.

## Adding things

- New action: `GameAction` in `shared/types.ts` → one line in `SPEC` in `shared/actions.ts` → a handler in the matching `shared/engine/*.ts` → if it can happen off-turn, add it to `OFF_TURN` in `engine/apply.ts`.
- New room setting: `GameSettings` field → default in `shared/default-settings.ts` (the one file for tuning new-room defaults) and the test baseline in `tests/setup.ts` → check in `shared/settings.ts` → one entry in `CATEGORIES` in `RoomLobby.tsx`.
- New stored field: add it to the type, set it in `createGame`, and append a numbered step to `MIGRATIONS` in `engine/migrations.ts` (never edit an old step).
- New art: `npm run art:new`, then edit the new `src/art/vN`.
- New built-in map: one `map(...)` entry in `shared/maps/builtin.ts` (token grid). New terrain: `SEA_TERRAINS` in `shared/types.ts`, its rule in `shared/engine/production.ts`, a tile file in `src/art/vN/sea/`.

## Tests (all tests and test tools live in `tests/`)

- Never write throwaway test scripts elsewhere. Add or extend a file in `tests/` so the next person (or agent) can rerun it instead of rebuilding it. Shared setup goes in `tests/fixtures.ts`, `tests/ui-harness.ts`, `tests/server-helpers.ts`, or `tests/bot-harness.ts`.
- `npm test`: rules, bots, and protocol unit tests (seconds). Run first after any `shared/` or `server/protocol.ts` change.
- `npx playwright test tests/<file>.spec.ts`: browser and real-server tests (starts wrangler and Vite). Run the relevant file, not the whole suite, while iterating.
- Tests that play whole games in real time are tagged `@slow` (`{ tag: '@slow' }`); `npm run test:e2e` skips them and CI runs them as a separate job (`npm run test:e2e:slow`).
- `npx playwright test --project=iphone`: phone checks (`tests/phone.spec.ts`).
- Screenshots for review: `npx playwright test tests/visual.spec.ts` writes `test-results/visual-*.png` and `phone-*.png`. It and `art-compare.spec.ts` only take screenshots, so CI skips them (`playwright.config.ts`); CI splits the rest across two runners.
- Server tests that need a seat to keep playing can call `PlayerConnection.autoPlay()` (`tests/server-helpers.ts`) instead of waiting out turn clocks. Sea tiles and pieces: `tests/sea-art.spec.ts` writes `test-results/sea-art.png`.
- Bot strength: `node training/run.mjs eval --games 2000` (Advanced vs Intermediate on every map, size, and setting; about 2 minutes). Run it after changing bot logic; Advanced should beat Intermediate, which should beat Beginner. `tests/bots.test.ts` also checks Advanced's CPU per move.
- CI budget: the whole Verify workflow should finish in about 3:30 (all three jobs run at once; the full browser suite takes about 2.5 minutes locally on 2 workers). Keep only tests that guard real behavior; a new test that plays a game in real time or takes over ~10s needs a reason, otherwise cover it with a unit test in `tests/*.test.ts`. Check per-test times with `npx playwright test --reporter=json`.
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
- Boards are shared between states and views, never changed in place: call `ownBoard(next)` (engine/core.ts) before editing one.

## UI layout (controls must never spill or clip)

The usual failures are buttons falling out of their row, text running out of a button, rows that rewrap differently at each width, and controls of mixed heights. Plan the layout before styling:
- Lay out in fixed rows, not one long `flex-wrap` line. Give each row a job (e.g. the editor bar: name and save / board fields / tools) so widths change only how a row wraps internally.
- Know the width you design for: the editor's settings panel is 372px (about 340px of content; on phones `min(372px, 88vw)`). Count it out: icon + label + control + gaps must fit, with the label as the part that shrinks.
- Every flex or grid child that holds text gets `min-width: 0`; grid columns use `minmax(0, 1fr)`, not `1fr`. Text that may be long gets `overflow: hidden; white-space: nowrap; text-overflow: ellipsis` on purpose; fixed-width controls (steppers, selects) get a width their longest label fits.
- Rows of buttons use `flex-wrap: wrap` with a `gap`, never a fixed total width or `overflow-x: auto` to hide the problem.
- One height per control kind in a row (the editor bar: 32px fields, 36px buttons) with `box-sizing: border-box`; labels sit beside their control with `white-space: nowrap`.
- Prefer a small number of clear controls: a − value + stepper over a select of many levels, chips with `aria-pressed`/`aria-checked` (and a check icon when "already applied" matters) over checkboxes for modes.
- Tooltips (`data-tip`) near the right edge of a panel overflow the viewport: use `tip-end`, or leave them off there.
- New panel styles go in a file beside the component (e.g. `editor/numbers.css`), not appended to a long shared stylesheet.
- Verify, don't guess: call `expectNoSpill(locator)` (`tests/ui-harness.ts`) on every panel or bar you change, at 1600, 1280, 1024, 820 and 390px wide (see the top bar test in `tests/editor.spec.ts`), and look at the screenshots it writes before saying the UI is done.

## Working efficiently

- Read `AGENTS.md`, then open only the files the task touches; use `grep` to find symbols rather than reading whole directories.
- Use the "Adding things" recipes above instead of re-deriving the architecture.
- Prefer targeted test runs while iterating and one full `npm run check` at the end.
