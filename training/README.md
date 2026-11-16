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
- `search --seeds 50 [--screen 8 --confirm 32 --margin 1.5 --players 4]` the headroom probe
  (PLAN step 1, `search.ts`): one seat searches its build decisions with rollouts of the shipped
  bot on hidden facts resampled from its view; every seed once per seat. Slow: ~4.5 CPU-minutes
  per game at the defaults.
- `profile --games 10` single-thread timing; `scenarios` prints the map/size mix.
- `replay --seed N --seat S` replays one game with the hero in seat S (as `eval --rotate` played it);
  a failing training game's error names its seed and map.
- `--cartographers` (any command with a scenario filter): only maps that play Cartographers.
- `boards` refreshes `boards/library.json` from the live site; with `ISLANDERS_AUTH=user:token`
  it includes the admin-only "AI Training" boards, without it those are kept from the old snapshot.

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
  `records-study [--dir training/data/dumps]` prints a seat-by-seat table (points, survey ships,
  charts, lodestone, …). A record replays only on the engine it was played on: when the rules have
  changed since, dump it from a git worktree at that commit (copy `study.ts` in). The 11 finished
  records of 2026-11-12..16 (unfinished ones deleted) replay on 0526457 (0–2), 0ac5720 (3–4),
  d924f4f (5), 6cd02ca (6–7), e9fc693 (8), 7755fe5 (9), a47da1c (10). Bot trade timing changed
  after a47da1c (2026-11-16), so newer engines don't replay any of them.
  In code, `replayGame(record, onMove)` in `training/replays.ts` gives the state before and after every step.
- Delete unfinished games from `records.json` before studying (`winnerSeat` null); they add noise.
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
Advanced bot before it valued lodestone), and hybrids for
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
