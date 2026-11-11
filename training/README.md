# Training the Advanced bot

Work in progress and what comes next: `training/PLAN.md`.

Everything here runs on your machine (Node 24, `nvm use`); nothing ships to the Worker except
`shared/bots/advanced/weights.json`. Commands:

    node training/run.mjs <command> --flag value ...

`run.mjs` bundles the TypeScript with esbuild into `.training-build/` and runs it. Games run on
worker threads, one per core minus one (`THREADS=n` to change). About 20 games/s on 14 cores.

## What gets trained

The bot is `shared/bots/advanced/`:

| Part              | File                     | Trained how                                                            |
| ----------------- | ------------------------ | ---------------------------------------------------------------------- |
| Starting spots    | `setup.ts`               | Draft lookahead (classical) scored by the setup network (`setup-fit`)  |
| Build phase       | `choose.ts`, `value.ts`  | Each candidate move's result scored by the value network (`value-fit`) |
| Build (no net)    | `turn.ts`, `economy.ts`  | Fixed-order planner with knobs (`tune`), the fallback                  |
| Robber and pirate | `robber.ts`              | Knobs (`tune`)                                                         |
| Trades            | `trade.ts`, `economy.ts` | Knobs (`tune`); hand value from goals                                  |

Knobs are the numbers in `params.ts` `KNOBS` (default, min, max). A **checkpoint**
(`training/checkpoints/<name>.json`) is a set of knobs plus the setup and value networks, with its
parent and notes on how it was made and scored.

Network inputs are board-agnostic (dice odds per resource, variety, harbors, how good a spot each
player can reach first), never tile positions, so the network can't memorize particular maps.

## Commands

Measure (always on shared seeds; `--rotate` plays each seed once per seat, so a bot against
itself scores exactly ×1.00):
- `eval --hero t1 --field intermediate --games 600 --rotate [--by-map] [--maps a,b] [--players 4] [--knobs '{"k":1}']`
  Win share vs fair share ("edge"), per-seat action counts hero vs field (how it plays
  differently), per-map table, and the seeds of games that never finished.
- `compare --a t2 --b t1 --games 600` the same games for both, paired difference ± standard
  error (across seeds) and by table size. Use this to decide whether a change helped.
- `select --candidates t1-g5,t1-g10,t1 --baseline s1 --games 600 --seed 400000` pick among
  saved candidates on fresh seeds.
- `replay --seed 300868 --hero t1` one game inline, with the final state (for stuck games).
- `profile --games 10` single-thread timing; `scenarios` prints the map/size mix.

Train:
- `setup-collect --from t1 --games 40000 --out r2 --seed 1000000 [--explore 0.35]` and
  `setup-fit --from t1 --data r1,r2 --name s2 [--hidden 16] [--fresh]`
- `value-collect --from s1 --games 25000 --out v1 --seed 2000000 [--explore 0.1]` and
  `value-fit --from t1 --data v1 --name v1 [--hidden 32] [--fresh]`
  Collect files live in `training/data/` (gitignored, float64 rows + a .json naming the
  features; a file whose features no longer match is refused). `--hidden 0` is logistic
  regression, the bar a network must clear. Without `--fresh`, fitting continues from the
  parent's network when the shape matches, so training builds on itself.
- `tune --from s1 --name t2 [--generations 15 --pairs 8 --games 150 --knobs a,b]` evolution
  strategies on knobs; saves `t2` and `t2-gN` for every generation (pick with `select`).
  Default field: Intermediate ×2, the parent, `style:trader`, `style:hoarder`.
- `promote --name t1` writes weights.json (then `npm run format`, `npm test`).
- `checkpoints` lists checkpoints with their last note.

Seats by name: checkpoints, `shipped`, `default`, `beginner`, `intermediate`, styles
(`style:trader|hoarder|cards|builder`, the shipped bot pushed one way), and hybrids for
diagnosis (`intermediate+t1:setup`; parts: setup, robber, build, trade, gold, discard).

Scenarios (`scenarios.ts`, `scenarios --games 20000` prints the mix): the standard island at 2–6
players (30% of games), the live library's "AI Training" boards (25%, Trainers 1–6 as of
2026-11-10), and every other designed map (the rest), each at every size it supports.
`boards/library.json` is a snapshot of `/api/boards`; refresh it by saving that URL there. With
room settings varied: friendly robber, volcano rules, discoveries, road/ship links, discard limit,
Seafarers on the standard island, number layout, 2 fewer points to win.

## Limits tuning must not cross

- Trade offers: at a table with any person, at most one offer per turn (`trade.ts`
  `PEOPLE_TABLE_OFFERS`), and people only get fair offers for a goal's last card, at most every
  third round. All-bot tables allow `offersPerTurn` (max 3). Earlier bots offered far too often;
  `tests/advanced-bot.test.ts` checks this.
- CPU: a move must stay cheap (Workers free plan). `tests/bots.test.ts` checks the median and
  the worst move; setup at six players is the slowest decision.

## Results log

Newest last. Edge = hero win share / fair share, 1 hero vs Intermediate field, all scenarios.
- Intermediate (old Advanced) control vs itself: ×0.93 on seeds 100000+ (seat rotation is not
  perfectly even across table sizes, so compare against this, not 1.00).
- First hand-written Advanced: ×0.87. Parts swapped into Intermediate: build ×0.76 (too passive:
  fewer roads and settlements, greedy 2-for-1 offers always refused), others ≈ control.
  Turning player offers off: ×0.45, so trading is worth a lot against these bots.
- After fair offers first and spending like Intermediate: build ×0.90, full ×0.98.
- Added Longest Road chasing, counter-offers, second-goal hand value, people-table offer cap:
  full ×1.08 (2000 games, seeds 100000+).
- Setup data r1: 40k games, 155k positions (`setup-collect --from shipped --games 40000 --out r1
  --seed 1000000`, explore 0.35). Validation loss: constant 0.6600, logistic regression 0.6233,
  16 tanh units 0.6196. In games: linear `lin1` ×1.16, network `s1` ×1.21. The hidden layer
  pays for itself; it is 34×16 + 16 weights, negligible CPU.
- Library refreshed 2026-11-10 with Trainers 3–6 (Trainer 5 has no ore). AI Training boards now
  get 25% of games. Results above were on the older mix (Trainers 1–2 only, base 35%).
- Removed the "+2 points" variation: Trainer 2 at four players and 15 points was unwinnable.
- Rotated control (Intermediate vs itself, every seat): ×1.00, so the old ×0.93 was seat/seed
  imbalance in un-rotated runs. Report rotated numbers only.
- Knob tuning t1 (15 generations × 2400 games from s1): t1 − s1 = +0.8% ± 1.3% wins (paired,
  600 seeds): not distinguishable from zero. Per-map: the edge is on sea, volcano, and trainer
  maps (setup); on the standard island Advanced ≈ Intermediate (2p 52.6%, 4p 26.2%).
- Value network round 1 (v1: 25k games of t1 play, 2.3M positions; valid loss linear 0.5957,
  32 units 0.5884, constant 0.6680). Choosing every build move by it: ×0.35 (hoards: half the
  roads, a third of the cards; it learned that winners hold cards). Planner decides whether to
  build, network decides what: v1 −0.9% ± 1.0%, linear −0.8% ± 1.0% vs t1. Not shipped. Next
  try, if any: round 2 with exploration (valueExplore) in the narrow role; expect small gains.
- Setup round 2 (r2: 40k games of t1 play on the new mix, 150k positions). s2 (continued from
  s1 on r1+r2) +0.3% ± 0.8%, s2f (fresh) −0.3% ± 0.8% vs t1: setup has stopped improving with
  these features. **Shipped: s2** (t1's knobs, setup net that has seen Trainers 3–6).
- Shipped bot on fresh seeds, rotated: all scenarios ×1.30 (34.7% vs 26.6% fair, 3009 games);
  2 players 56.9% ±1.8%; standard island at 4 players 30.6% vs 25%; against Beginners ×2.97.
  Moves: median 0.15 ms, worst 6.7 ms (6-player setup).
- Where the next gains probably are: mid-game play on the standard island (Advanced is close to
  Intermediate there). The value network needs more than one round and better credit for a
  single move than a whole game's result; a cheaper first step is new setup features (the setup
  net plateaued) or a deeper look at the per-seat action counts on base/4.
- Training speed (2026-11-10): plain-data copies instead of structuredClone, longest road from the
  player's own routes, cached road searches per view: the same games 2× faster (profile: 411 →
  205 ms/game single-thread). Results are unchanged move for move.
- Card count: the engine keeps a public count of every hand (`engine/hands.ts`; exact except
  steals) and sends it to bot seats only (`view.likelyHands`). Advanced uses it for steals,
  monopoly, and to offer only to players likely holding the cards. Same seeds as the shipped
  result above (700000, 800 rotated): 36.3% ±0.9% vs 34.7% (×1.36 vs ×1.30).
