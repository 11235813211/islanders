# Backend knobs

Where to change things that aren't in the game's UI. After any change, run `npm run check`. Pushing to `main` deploys the live site once the Verify check passes.

## Admins (playtest users)

`wrangler.jsonc` → `vars` → `PLAYTEST_USERS`

```jsonc
"PLAYTEST_USERS": "BentoBox,SomeoneElse"
```

These are account usernames, separated by commas. Capitalization doesn't matter. Admins can:
- create solo test rooms
- edit and save boards in the board editor (`/api/boards`)
- view and delete saved game records (`/api/records`)
- play boards marked admin-only

In local dev (`npm run dev`), everyone is an admin.

## Default game settings

`shared/default-settings.ts` holds the settings every new room starts with: points to win, turn timer, dice mode, robber, and so on. Each line lists the values it accepts. The host can still change these in the lobby. A bad value fails `npm run check`.

To change which choices the lobby offers, edit these in `shared/settings.ts`:

| What                | Constant              |
| ------------------- | --------------------- |
| Auto-roll delays    | `AUTO_ROLL_SECONDS`   |
| Trade offer lengths | `TRADE_SECONDS`       |
| Victory point range | `VICTORY_POINT_RANGE` |

## Timers and room lifetime

| What                                   | Where                                              | Now   |
| -------------------------------------- | -------------------------------------------------- | ----- |
| Room closes after nobody is connected  | `EMPTY_ROOM_MS` in `shared/settings.ts`            | 5 min |
| Bot game is saved for finishing later  | `SAVED_BOT_GAME_HOURS` in `shared/settings.ts`     | 24 h  |
| Time to pick gold or volcano resources | `GOLD_SECONDS` in `shared/engine/core.ts`          | 25 s  |
| Time to place the robber or pirate     | `ROBBER_SECONDS` in `shared/engine/core.ts`        | 15 s  |
| Special build phase, per player        | `SPECIAL_BUILD_SECONDS` in `shared/engine/core.ts` | 20 s  |
| Max players per room                   | `MAX_PLAYERS` in `shared/engine/core.ts`           | 6     |
| Piece limits (roads, settlements, …)   | `PIECE_LIMITS` in `shared/engine/core.ts`          |       |

## Names

- Guest names (players who join without typing one): `shared/guest-names.ts`, one name per entry, 1–24 characters.
- Ideas for map names: `docs/board-names.md`.
- Usernames must be 3–24 characters: lowercase letters, numbers, `_` (`USERNAME_PATTERN` in `server/protocol.ts`).

## Rate limits (abuse protection)

`wrangler.jsonc` → `ratelimits`. These are the allowed requests per minute:

| Limit                   | Allowed per minute    |
| ----------------------- | --------------------- |
| `ROOM_CREATION_LIMITER` | 12 room creations     |
| `CONNECTION_LIMITER`    | 120 connections       |
| `AUTH_LIMITER`          | 20 logins or sign-ups |

## Game records

Games are recorded only when players agree. The settings are in `server/recording.ts`:

| What                | Constant           | Now  |
| ------------------- | ------------------ | ---- |
| Newest records kept | `KEEP_RECORDS`     | 500  |
| Longest game kept   | `MAX_STEPS`        | 8000 |
| Largest game kept   | `MAX_RECORD_BYTES` | 1 MB |

## Maps and rules

- Built-in maps: one `map(...)` entry each in `shared/maps/builtin.ts`. Admins can also build maps in the in-game board editor.
- Which rules are in the game and which are room options: `docs/rules.md`.

## Bots

- The Advanced bot's numbers are in `shared/bots/advanced/params.ts` and `weights.json`. Read `training/README.md` before changing them.
- Check bot strength: `node training/run.mjs eval --games 2000`. It takes about 2 minutes.

## Deploying and hosting

- Live site: https://play.islandersgame.workers.dev (Cloudflare Worker `play`, free plan).
- Deploys happen automatically: push to `main` → the **Verify game** workflow passes → **Deploy Islanders** runs (`.github/workflows/deploy.yml`). You can also start it by hand from GitHub Actions.
- The deploy needs two GitHub repo secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Deploy from your machine: `npm run deploy` (runs the checks first).
- Logs and errors: Cloudflare dashboard → Workers → `play` → Observability.
- `ALLOWED_ORIGINS` in `wrangler.jsonc` is only needed if the site's pages are hosted somewhere other than the Worker.
- Share your local build through a temporary public link: `npm run share`. It needs `cloudflared` (`brew install cloudflared`).

## Running locally

- `nvm use` (Node 24), then `npm install` and `npm run dev`.
- Before calling something done: `npm run format` and `npm run check`.
