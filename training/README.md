# Training the Advanced bot

Start with [how Advanced decides](ADVANCED.md), including its confirmed gaps and active
versus inactive components. [EVIDENCE.md](EVIDENCE.md) reviews what past results establish;
[PLAN.md](PLAN.md) is what we're doing next; [ANALYSIS.md](ANALYSIS.md) holds the analysis behind
it. Write up every analysis of training, bot behavior, or saved games as a file in
[analysis/](analysis/), indexed in ANALYSIS.md (format at its top), log each batch of games in [RUNS.md](RUNS.md), and each result below.

Everything here runs on your machine (Node 24, `nvm use`); nothing ships to the Worker except
`shared/bots/advanced/weights.json`. Commands:

    node training/run.mjs <command> --flag value ...

`run.mjs` bundles the TypeScript with esbuild into `.training-build/` and runs it. Games run on
worker threads, one per core minus one (`THREADS=n` to change). About 20 games/s on 14 cores.

## What gets trained

The bot is `shared/bots/advanced/`:

| Part              | File                         | Trained how                                                            |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Starting spots    | `setup.ts`                   | Draft lookahead (classical) scored by the setup network (`setup-fit`)  |
| Build phase       | `plans.ts`, `plan-turn.ts`   | Active (since r1): goals ranked by return per round of waiting; knobs  |
| Races for spots   | `rivals.ts`                  | Hand-written rival model, checked with `race-check`                    |
| Strategies        | `strategy.ts`, `selector.ts` | Goal leans; selector networks from the strategy probe (`selector-fit`) |
| Old build phase   | `turn.ts`, `economy.ts`      | Fixed-order planner (`planner` 0), no longer shipped                   |
| Value experiment  | `choose.ts`, `value.ts`      | Inactive; candidate results scored by a network (`value-fit`)          |
| Robber and pirate | `robber.ts`                  | Knobs (`tune`)                                                         |
| Trades            | `trade.ts`, `economy.ts`     | Knobs (`tune`); hand value from goals                                  |

Knobs are the numbers in `params.ts` `KNOBS` (default, min, max). A **checkpoint**
(`training/checkpoints/<name>.json`) is a set of knobs plus the setup and value networks, with its
parent and notes on how it was made and scored.

Network inputs summarize dice odds per resource, variety, harbors, and which good spots each
player can reach first. They omit tile coordinates; this does not rule out overfitting to the
training map distribution. Why the alternative planner and value network are inactive, and how the plan reuses them:
[PLAN.md](PLAN.md#earlier-experiments-and-their-code) and [ANALYSIS.md](ANALYSIS.md).

## Commands

Measure (on shared initial seeds; `--rotate` plays each seed once per seat, so a bot against
itself scores ×1.00 when every game finishes). Printed `±` values are standard errors,
not 95% intervals. Use the final paired difference from `compare` for inference; single-arm
`eval` errors and the gauntlet's weighted error have limits described in [STATISTICS.md](STATISTICS.md).
- `eval --hero t1 --field intermediate --games 600 --rotate [--by-map] [--maps a,b] [--players 4] [--knobs '{"k":1}']`
  Win share vs fair share ("edge"), per-seat action counts hero vs field (how it plays
  differently), per-map table, and the seeds of games that never finished.
- `compare --a t2 --b t1 --games 600` the same games for both, paired difference ± standard
  error (across seeds) and by table size. Use this to decide whether a change helped.
- `select --candidates t1-g5,t1-g10,t1 --baseline s1 --games 600 --seed 400000` pick among
  saved candidates on fresh seeds. All share one baseline, so prefer it to repeated `compare` runs.
  A candidate can be `knobs:roadRace=0.5;forecastPlan=1` (the shipped bot with those knobs); `--report`
  prints each side's full counts.
- `replay --seed 300868 --hero t1` one game inline, with the final state (for stuck games).
- `search --seeds 50 [--screen 8 --confirm 32 --margin 1.5 --players 4]` the headroom probe
  (historical probe, assessed in [EVIDENCE.md](EVIDENCE.md), `search.ts`): one seat searches its
  build decisions with rollouts of the shipped bot on hidden facts resampled from its view;
  every seed once per seat. Slow: ~4.5 CPU-minutes
  per game at the defaults.
- `strategy-probe --seeds 50 [--players 3 --rollouts 24 --every 3 --margin 1 --rounds 0 --scorer w1
  --out file.json]` the strategy probe (PLAN Phase 1, `strategy-search.ts`): one seat picks a
  strategy (`shared/bots/advanced/strategy.ts`) at setup and every 3rd own turn by rollouts in which
  it keeps that strategy; prints its wins vs the same games played plain, and what it chose by map
  and stage. `--out` saves every choice with each strategy's score and the position's features
  (selector training data). `--rounds 6 --scorer w1` stops rollouts after 6 rounds and scores them
  with that checkpoint's value network (faster; check it agrees with full rollouts before trusting it).
  Slow: several CPU-minutes per game.
- `bench-positions [--games 100 --seed 7100000 --players 3 --per-game 4]` and `scorer-bench
  --positions training/data/bench-positions.json [--rollouts 48 --cutoffs 2,4,6,10 --scorers w1,w1td
  --out res.json]` the scorer benchmark (PLAN Phase 3, `scorer-bench.ts`, `bench-report.ts`): saved
  r1 self-play choice points; every strategy played to the end per sample and snapshotted at each
  cutoff, so full rollouts and every stopped scorer (and a fitted points softmax) are judged on the
  same trajectories. Reports, per method, the gain its pick earns judged by full rollouts on the
  other half of the samples (full rollouts' own is the ceiling), pick agreement, correlation of
  advantages, and per-trajectory tracking. `--results res.json` reprints a saved run. A new scorer is
  a checkpoint with a value network, named in `--scorers`. ~1.5 CPU-s per position per rollout.
- `bench-analysis [--results training/data/bench-1.json --full ...probe-3.json --stopped ...probe-4.json]`
  what the saved benchmark and probes say with no new games: signal and noise, equal-CPU scorers,
  ways to use the same rollouts, probe predictions, and a selector check (`bench-analysis.ts`).
- `override-study [--games 150 --per-game 3 --rollouts 16 --variants 'name:knob=1;knob=2,...' --out f | --results f]` plays out each
  decision where a variant disagrees with the shipped bot, by kind of change. `turn-end-audit` does the same for uses of cards
  instead of ending the turn. `road-diagnosis`, `forecast-check` and `move-cost` compare the road model and forecast with real
  games, and measure CPU per decision. `select --reuse-baseline file` keeps a baseline's games for later batches.
- `records-awards [--dir training/data/dumps --only 24,26]` Longest Road and Largest Army in dumped
  saved games: turns each seat held each award, times taken, turns close behind, and every change of
  holder. Dumps need per-turn rows (made since 2026-11-17 by `replays --dump` or `dump-records.ts`,
  which replays old records in a worktree at their commit; see its header). Games 22–23 replay on
  4bcded4, 24–28 on a25a052. `eval` and `compare` also print `award:` counts per seat (taken, lost,
  held at the end, road length, knights, won holding each).
- `race-check [--games 100 --players 4]` how often the rival model (`rivals.ts`) predicts the next
  settlement (top 1 / top 3, vs the nearest open corner) in bot games; `--positions a.json,...`
  (from `records-positions`) checks a person's settlements in saved games instead.
- `selector-fit --from r1 --data probe.json --name sel1 [--hidden 0]` trains the strategy selector
  (`selector.ts`, PLAN Phase 2) from `strategy-probe --out` files into a checkpoint.
- `profile --games 10` single-thread timing; `scenarios` prints the map/size mix.
- `TRAINING_BUILD=.training-build-2 node training/run.mjs ...` builds into another folder, so a second
  command doesn't rebuild under one that is still running.
- `replay --seed N --seat S` replays one game with the hero in seat S (as `eval --rotate` played it);
  a failing training game's error names its seed and map.
- `--cartographers` (any command with a scenario filter): only maps that play Cartographers.
- `npm run boards` (= `boards`) refreshes `boards/library.json` from the live site; with
  `ISLANDERS_AUTH=user:token` it includes the admin-only "AI Training" boards, without it those are
  kept from the old snapshot. Training and evaluation play **only** the boards in that snapshot
  (built-ins in code only when there is no snapshot); refresh before registering an experiment.

Saved games (people opt in with "Save my games to improve the bots"; recorded only if every human
at the table agreed; format in `shared/replay.ts`, storage in `server/recording.ts`, newest 500 kept):
- `node training/run.mjs records-fetch` asks for the playtest username and token (the token hidden
  as you type; or set ISLANDERS_AUTH=user:token) and saves them all to `training/data/records.json`
  (gitignored). Run it in your own terminal so the token stays out of logs and chats.
- Export by hand with an account listed in `PLAYTEST_USERS`: `GET /api/records` lists them, and
  `GET /api/records/<id>` returns one (send `Authorization: Bearer <username>:<token>`; the token is in the
  browser's `islanders-account` localStorage entry). Save one or an array of them to a file.
- `replays --file records.json [--dump training/data/dumps]` re-runs each through the engine and
  says whether it ends as recorded; `--dump` saves each game's final state and logged events, and
  `records-study [--dir training/data/dumps]` prints a seat-by-seat table (points,
  charts, lodestone, …). A record replays only on the engine it was played on: when the rules have
  changed since, dump it from a git worktree at that commit (copy `study.ts` in). The 11 finished
  records of 2026-11-12..16 (unfinished ones deleted) replay on 0526457 (0–2), 0ac5720 (3–4),
  d924f4f (5), 6cd02ca (6–7), e9fc693 (8), 7755fe5 (9), a47da1c (10). Bot trade timing changed
  after a47da1c (2026-11-16), so newer engines don't replay any of them.
  In code, `replayGame(record, onMove)` in `training/replays.ts` gives the state before and after every step.
- For a completed-game study, filter records with `winnerSeat` null and report the exclusion
  count; preserve the source records. Candidate win-rate comparisons must retain unfinished
  games in their denominators and report completion sensitivity.
- Person vs bot, move by move (`record-disagree.ts`), in two halves:
  1. `records-positions --file records.json --only 3,4 --out pos.json` saves each of the person's
     moves with the position before it. Run it on the engine the games were played on: a git
     worktree at that commit (`git worktree add --detach <dir> <commit>`, symlink `node_modules`,
     copy the current `training/*.ts` and `run.mjs` in). Commits per game are listed above.
  2. `records-disagree --positions a.json,b.json [--rollouts 64 --top 40 --out res.json --bot shipped
     --knobs '{...}']` on the current code: upgrades each position with the room migrations, asks
     the bot what it would play, and where it differs plays both moves out to the end with the bot
     in every seat on the same dice. Prints the largest gaps each way (person − bot win share, ±
     standard error) and the average by pair of move types. Trade offers and answers are skipped.
     About a minute per 3-player game at 64 rollouts on 14 cores. Read it with care: the rollouts
     play the person's seat as the bot, so a move only scores well if the bot can follow it up, and
     one move rarely moves a whole game by more than the ±6% noise. Late moves of a game already won
     show exactly 0.

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

Seats by name: `ref:advanced` (or another level) as a git ref plays it, with `--ref origin/main`
(compares against the pushed bot even when the code differs); checkpoints, `shipped`, `default`, `beginner`, `intermediate`, styles
(`style:trader|hoarder|cards|builder|lodeblind`, the shipped bot pushed one way; `lodeblind` is the
Advanced bot before it valued lodestone), `strategy:expand|cities|cards|explore|chart` (the shipped bot
playing one strategy all game), and hybrids for
diagnosis (`intermediate+t1:setup`; parts: setup, robber, build, trade, gold, discard).

Scenarios (`scenarios.ts`, `scenarios --games 20000` prints the mix): the standard island at 2–6
players (30% of games), the live library's "AI Training" boards (25%, Trainers 1–6 as of
2026-11-10), and every other live library map (the rest), each at every size it supports.
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
Entries preserve the conclusions recorded at the time. For the current assessment, including
uncertainty, changed protocols, and limits on causal claims, read [EVIDENCE.md](EVIDENCE.md).
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
- Gauntlet baseline (2026-11-11, seeds 900000, 300 seeds all / 200 base/4, rotated), shipped s2:
  Intermediate ×1.25, Beginner ×2.87, shipped ×1.00, s1 ×1.09, t1 ×1.03, trader ×1.24,
  hoarder ×1.15, cards ×1.01, builder ×1.66, mixed ×1.39; weighted ×1.28 (base/4 ×1.30).
  `style:cards` is the hardest opponent besides the shipped bot itself.
- Seat value network w1 (20k games of shipped play, 504k positions, one viewing seat per game;
  valid loss 0.974 vs linear 0.998 vs uniform 1.259). valueRole 0 (planner decides whether):
  −1.5% ±0.9% vs shipped over the gauntlet. valueRole 1 (net decides whether): ×0.20, hoards
  again (twice the discards, a third of the roads). TD(λ 0.7) refit w1td. Whole-game labels
  can't tell holding from building. Move comparisons (`moves-collect`) were built but never run
  at scale (stopped: see PLAN.md).
- Bug fix (2026-11-11): the planner built roads toward the next target while a reachable spot
  waited for cards (`legal.settlements` is empty when unaffordable). Intermediate ×1.25 → ×1.71
  (33.5% → 45.8%), Beginner ×2.87 → ×3.22, seeds 900000. The only large gain in this log, and
  against weak bots. Path search now follows the room's `routeLinks` setting (not measured alone).
- Fog: a fog-weight knob did nothing useful (0: +1.6% ±1.7%; 3: −8.7% ±1.7%, Middle Fog 3p).
- Plan-based planner (`planner` knob, plans.ts): after three fixes found by `disagree`, +0.7%
  ±1.3% and −0.2% ±1.4% vs shipped (300 seeds); −10.0% ±1.6% on Middle Fog 3p (explores fog,
  0.93 tiles/game, but overbuilds ships). Not shipped. The `disagree` pilot (863 decisions,
  16 rollouts each) found its weak spots fast; that tool is worth keeping.
- Headroom probe (PLAN step 1, 2026-11-12, 50 seeds × 4 seats, 4 players, seeds 1000000+): one seat
  searching its build decisions with shipped-bot rollouts vs three shipped: screen 8 / confirm 32 /
  margin 1.5: 28.5% (+3.5% ±2.5%); margin 0: 33.5% (+8.5% ±3.2%); screen 16 / confirm 64:
  30.5% (+5.5% ±2.3%). 4–11 CPU-minutes per game. Small real headroom, not large.
- Branch vs pushed main (`--ref origin/main`, 2026-11-12, rotated): shipped vs main's Advanced,
  all scenarios ×1.44 (39.1% vs 27.2% fair, 1103 games, seeds 1100000); base/4 ×1.30 (32.6%
  ±1.7%, 800 games). Control: main vs itself ×1.00; main vs Intermediate ×1.25 (as logged).
- Seat order bug (found 2026-11-14): since random turn order (2026-11-12), `points` and end
  diagnostics were stored by turn order but read by seat, and setup/value rows were labeled by turn
  order against a winner stored by seat. Win counts were always right; anything collected or tuned
  after 2026-11-12 had wrong points/labels (no logged run was). Fixed in `sim.ts`, `jobs.ts`,
  `networks.ts`, `rollouts.ts`.
- Cartographers planner (2026-11-14; all 8 Cartographers maps, live library of that date, rotated):
  the shipped Advanced bot fit out 0.05 survey ships per seat per game. Now: lodestone in setup and
  spot value, a survey-ship goal (sails out for it), lodestone kept off tiles while saving.
  Vs `ref:advanced` (HEAD before): ×1.09 (28.6% ±1.6% vs 26.3% fair, 761 games); vs
  `style:lodeblind` ×1.13–1.17. Survey ships 0.02 → 0.27, lodestone produced 3.8 → 10.3 per game.
  Looks weaker at 5–6 players (Magnetic North 6p 13% vs 17% fair; small samples). Raising
  `surveyValue` to 4–5 changed nothing measurable.
- Endgame check (`advanced/endgame.ts`: buy the win this turn when some set of builds and trades
  does it; treat an opponent who could win next turn as the threat for robber and trades): ×1.01
  ±0.04 overall vs `ref:advanced` (1836 games). Bots rarely miss wins against bots; it guards
  against people.
- Per-seat action report (2026-11-14): field seats were averaged over all field seats, so big
  tables (fewer turns each) counted more for the field than for the hero, and mixed-size runs
  showed the hero "ending turns" more (ref:advanced vs itself: 19.89 vs 18.31). Each game's seats
  are now averaged first; the same bots then match exactly. Action counts logged above this entry
  from mixed table sizes carry that skew.
- Person vs bot on saved games (`records-disagree`, 2026-11-16, 11 finished games of one strong
  player vs Advanced bots; the person won 6; 944 of the person's moves, the bot would have played 354 of
  them otherwise; 64 paired rollouts each, shipped bot in every seat). Mean person − bot win share
  per decision: build +0.7% ±0.4%, gold +1.7% ±0.8%, special build +4.4% ±1.3% (14), robber −4.8%
  ±0.9%, setup settlement −7.5% ±1.7% (18), charts and splits 0.0% ±1.0% (41). By this measure the
  person's single moves are not better than the bot's, and their charting isn't either: rollouts
  play the person's seat as the bot, so a plan the bot wouldn't follow up scores nothing. What it
  did find: (1) in the special build phase (5–6 players) the bot only built cities and settlements,
  the person also built roads, ships, survey ships and cards; (2) a gold pick off turn, from a
  split tile, at 11 of 13 points (+69%, game 6 turn 84): the person's brick + 2 wheat set up the
  next turn's win, the bot's 2 brick + wheat didn't; neither won at once. Fixed (1); for gold, the
  bot now takes a pick that wins on its own turn (below), which does not cover this off-turn case.
  Single results at ±6–9% over 354 tests include several 2σ flukes; trust only groups or gaps over ~25%.
- Tile judgment knobs (2026-11-16, `TileTuning` in `shared/bots/charting.ts`; Advanced only, the
  other levels keep `SIMPLE_TILES`): rivals' cards count fully against ours (`chartRivalShare` 1,
  was 0.6), open corners rivals reach first and their future cities count too
  (`chartFutureRivals` 1), and a split goes to a resource the bot earns none of, trading for the
  card first (`splitTrade`; before, it only split into what it held, so on a sheep-less map it
  never split into sheep). Vs `ref:advanced`, Cartographers maps, seeds 1200000, 1143 games each,
  ±1.3%: all on ×1.03; old rival weighting with only splitTrade ×1.03; no future term ×1.08;
  rivalShare 1.5 ×1.07; lodestone tiles weighted ×2 ×1.11; splitTrade off ×1.06 (the later runs
  also had the special-build and gold fixes). All within noise of each other. Lodestone tiles ×2
  head to head against the same bot without it: ×1.01 (26.6% ±0.8% vs 26.3%, 3416 games), though
  it charts more (2.80 vs 2.19) and makes more lodestone (7.1 vs 6.4): left at 1. Against bots,
  how tiles are judged barely matters; whether it matters against people is untested.
- Special build (5–6 players): Advanced now builds what its turn would (roads, ships, survey
  ships, cards) after any city or settlement. Gold: a pick that wins this turn (`winningGold` in
  `endgame.ts`) beats hand value. Regression vs `ref:advanced`: base ×1.01 (25.3% ±0.9%, 2399
  games; 2–4 players identical games, 5p 21.0% vs 20%, 6p 16.8% vs 16.7%); The Channel ×1.03
  (22.8% ±1.0%, 1803 games). Vs Intermediate (2000 seeds, rotated): ×1.72, old bot ×1.71; both
  leave 1.0% of games unfinished.
- Bot trade timing (not a strength change): a bot answers another bot's offer 1.5–3 s after it is
  made (`BOT_ANSWER_MS` in `engine/time.ts`); people's offers are still answered at once.
- Whole-game study of the saved games (2026-11-16, 12 finished games; scratch scripts, not yet a
  command): at turn 1 the person's income (dots per 36 rolls, charts included) is within a few dots
  of the best bot's in every game. The gap opens between turns 15 and 45: in the person's
  Cartographers wins the person's income doubles or triples while the best bot's stalls (game 21,
  room TIGER28: person 33 → 76 from turn 15 to 45, best bot 36 → 36). In that game the person took
  a lodestone tile with the first setup pick, made 15 lodestone and spent it all on 12 charts and a
  split; white made none, blue 3. Two other patterns, smaller: in 5 of the person's 37 later
  settlements a bot was as close to the corner and didn't take or block it (TIGER28: white's turn-1
  road went elsewhere when the one road from its own road end would have reached v52 and cut red
  off), and 4 were built on a turn the person traded with a bot (TIGER28 turn 14: white accepted
  2 ore for wheat and ore for brick, which completed red's settlement).
- Training maps (2026-11-16): `allMaps()` mixed every built-in in code with the live library, so
  training and every eval played 7 built-ins deleted from the site (Outer Isles, Archipelago, The
  Strait, Wide Sea, Small Isles, Compass Sea, and a 5–6 player "magnetic-north"; the owner's Magnetic
  North is `new-base-board-12`, 2–4 players). Now only the snapshot (`npm run boards`). Earlier results
  in this log, Cartographers ones especially, include those maps.
- Income fix C1/C2 (2026-11-16, [ADVANCED.md](ADVANCED.md)): Advanced's income, spot, city, and robber
  estimates count charted numbers, split tiles (half each), and relay stations as the engine pays
  them; lodestone counts in the first expansion ranking. Vs `ref:advanced` (HEAD 4bcded4) with a
  `ref:advanced` field, live boards: Cartographers +0.5% ±1.0% (300 seeds 3300000, 1067 games each;
  charts 3.19 vs 3.03, survey ships 0.20 vs 0.17); 5–6 player Cartographers +1.4% ±0.7% (300 seeds
  3500000, 1649 games; survey ships 0.29 vs 0.22); base 4p exactly 0 (identical games). Correct, safe,
  no demonstrated gain. Single-thread time unchanged (283 vs 267 ms/game). Runs: [RUNS.md](RUNS.md).
- Roadrace (2026-11-16, `new-base-board-11`, the only live map whose route finish is required to
  win): 88% of bot games never ended. Bots spent their last settlement (or every ship) away from the
  finish area, after which no seat could win. Now every level keeps its last settlement for the
  finish (`keepRoutePiece` in `analysis.ts`, applied in `actWith`), and Advanced makes the finish its
  first target and stops chasing Longest Road until it's built there. Vs `ref:advanced` (seeds
  3700000, 100 seeds, 251 games): 68.5% vs 3.2%, +67% ±3.6%. All-Advanced tables still leave 10%
  unfinished, all under `routeLinks: settlement` with every ship spent; Intermediate has no
  route-first targeting yet (mixed tables 32% unfinished). Base and The Channel: identical games.
- Strategy presets and the rival model (2026-11-17; PLAN Phase 1, [ANALYSIS.md](ANALYSIS.md)). Fixed
  whole-game strategies as one seat vs shipped: expand −6.3, cities −1.8, cards −6.7, explore −0.1,
  chart −1.0 pp (±0.8–1.3, 300 seeds): "always prefer X" is the wrong unit. Rival model
  (`rivals.ts`) predicts bots' next settlement 85–88% top 1, 94–96% top 3 (nearest corner: 78–83%).
  Using it for races: +1.1 ±0.9 pp in the old planner.
- **Shipped: r1** (2026-11-17): the plan-based planner (`planner` 1) with rival-model races,
  `cityOption` 0.4, `frontierOption` 0.4, fog exploring off, and a survey-ship goal. vs s2: +3.8 ±0.9 and
  +2.4 ±0.9 pp on two fresh 600-seed sets; base/4 +2.5 ±1.5; The Channel +1.5 ±1.4; Middle Fog +3.9 ±1.6;
  Cartographers +2.6 ±1.4. vs Intermediate ×1.91 (was ×1.65). Details in [RUNS.md](RUNS.md).
- Scorer benchmark (2026-11-17, PLAN Phase 3 step 2, [analysis](analysis/2026-11-17-scorer-benchmark.md)): 400 r1 self-play
  positions, 48 rollouts per strategy. Full rollouts at the probe's 24 gain +0.9 ±0.4 pp per choice
  and agree with themselves 38% (true advantage spread ~3.5 pp vs ~8.5 pp noise). w1 stopped at 4–10
  rounds matches them (+0.9 to +1.0) at 48–78% of the cost, but picks `cards` 31–34% vs 21%. Points
  alone: +0.2. New scorers are judged by pair correlation at 4–6 rounds (w1: 0.21, 0.33), Brier, and
  pick shares.
- Longest Road / Largest Army (2026-11-17, [analysis](analysis/2026-11-17-awards-vs-people.md)): in all four saved 2-player
  Jumbotan games the person took Longest Road and kept it (s2 never retook it); Largest Army ended
  with the bot in 3 of 4. Bot fields don't reproduce it (r1 holds the road as often as any bot
  opponent). Cause in code: road goal only 1–3 roads back, flat 1.4 points, no defense. Not fixed yet.
- Offline benchmark analysis (2026-11-17, [analysis](analysis/2026-11-17-bench-offline.md)): stopped w1 ties full
  rollouts at equal CPU (differences within ±0.25 pp per choice); linear selectors don't beat
  constants; per-choice gains overcount across a game. No new games.
- Experiment efficiency audit (2026-11-18, [analysis](analysis/2026-11-18-experiment-efficiency.md)):
  current pilot sizes are reasonable, but repeated baselines and calibration games waste work;
  use the existing `select` path and target the original two-player problem. No new games.
- Narrowed candidate summary (2026-11-18, [analysis](analysis/2026-11-18-narrowed-candidates.md)):
  no clear win improvement; light setup forecasting is a weak lead, while the tested road
  variant holds the award less in two-player Jumbotan. Summary of an existing batch; no new games.
- Forecast, Longest Road and placement (2026-11-18, [analysis](analysis/2026-11-18-forecast-roads-placement.md)): placement forecast about
  +0.9 ±0.3 pp over four fresh seed sets but too slow to ship; spare roads hold the award more with no proven win gain; the forecast
  doesn't yet improve build choices. All off by default.
- Combined bot shipped (2026-11-18, [analysis](analysis/2026-11-18-shipping-combined-bot.md)): placement forecast, spare-card Longest Road and
  over-limit trades, +1.26 ±0.60 pp on 1,200 fresh seeds against the previous bot; all nine protected games above −2 pp; ×1.92 against Intermediate.
- Survey ships removed and finished charts added (2026-11-18). Survey results above describe the old
  rules. All bot levels now chart the tile they alone stand beside that is closest to full, a simple
  placeholder that is not in the planner's goals. `eval --games 2000`: Advanced 56.4% ±1.1% against a
  fair 29.7% (×1.90), with 0.07 chart points per Advanced seat per game. See [RUNS.md](RUNS.md).
