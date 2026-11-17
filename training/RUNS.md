# Training runs

One entry per batch of bot games: why it runs, what it will tell us, and when it should finish.
Newest first. Finished runs keep their one-line result; the full write-up goes in the
[README results log](README.md#results-log). Times are CST.

## Running

_Nothing running._

## Finished

### Roadrace route fix vs the old bot

- **Why:** bots almost never finished Roadrace (`new-base-board-11`, finish area required to win).
- **Result (2026-11-16 17:56–17:59):** fixed Advanced won 68.5% vs the old bot's 3.2% in the same seats
  (+67 pp ±3.6, 100 seeds, 251 games each; 2p +77, 3p +58). Its games left unfinished: 29.5% vs 92%,
  mostly the old-bot opponents still stalling. All-Advanced tables: 10% unfinished (was 88%); the rest
  are the `routeLinks: settlement` variation with every ship spent.

### The Channel check (`new-board-4`)

- **Result (2026-11-16 17:53–17:55):** exactly 0.00% over 150 seeds, 673 games each: identical games.

### Standard bot-strength check after the income fix

- **Result (2026-11-16, 17:45–17:47):** Advanced vs Intermediate 49.7% vs 30.1% fair (×1.65), 2,000 games,
  live boards only (not comparable to the old ×1.72, which included deleted built-ins). 1.9% unfinished,
  all on Roadrace (`new-base-board-11`): bots never finish there (88% unfinished, same on HEAD).

### C1/C2 safety check at 5–6 players (Cartographers)

- **Why:** the pilot leaned negative at 5–6 players on tiny samples; make sure the income fix doesn't
  hurt big Cartographers tables.
- **Result (2026-11-16, 17:35–17:40):** +1.4 pp ±0.7 (19.5% vs 18.2%, 300 seeds, 1,649 games each;
  5p +1.7, 6p +1.0). 95% range about −0.1 to +2.8 pp: passes the −2 pp floor. More survey ships
  (0.29 vs 0.22) and charts (1.79 vs 1.56).

### C1/C2 check off Cartographers (base island, 4 players)

- **Result (2026-11-16 17:35):** exactly 0.00% over 100 seeds, 400 games each: identical games, as
  expected (charts, splits, relays, and surveys exist only in Cartographers).

### C1/C2 pilot on Cartographers maps

- **Why:** check whether counting charted numbers, splits, relays, and lodestone in the Advanced
  bot's income estimate (C1/C2 in [ADVANCED.md](ADVANCED.md)) changes how often it wins.
- **Result (2026-11-16, 17:29–17:34):** +0.5 pp ±1.0 (28.7% vs 28.1%, 300 seeds, 1,067 games each,
  live Cartographers boards, seeds 3300000). No measurable win change. It charts a little more
  (3.19 vs 3.03 per game) and builds slightly more survey ships (0.20 vs 0.17). The fixed side's games
  were timed at 2,430 vs 677 ms, but single-threaded on the same 12 games it is 283 vs 267 ms:
  a timing quirk of the first side in `compare`, not a CPU cost.

### Gate zero: baseline check

- **Why:** before testing a change, make sure the comparison tool measures exactly zero when
  nothing has changed.
- **Result (2026-11-16):** 0.00% ±0.00% over 100 seeds, 382 games each side. The frozen baseline is
  isolated.
- Ran on the old map mix (built-ins included).

### First C1/C2 pilot (stopped)

- Stopped at 2026-11-16 17:25: training was mixing in built-in maps no longer on the live site
  (including a 5–6 player "magnetic-north"). Restarted above on live boards only.
