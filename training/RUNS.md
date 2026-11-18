# Training runs

One entry per batch of bot games: why it runs, what it will tell us, and when it should finish.
Newest first. Finished runs keep their one-line result; the full write-up goes in the
[README results log](README.md#results-log). Times are CST.

## Running

_Nothing running._

## Finished

### Scorer benchmark 1 (PLAN Phase 3 step 2)

- **Why:** before training a new value network, measure how well a stopped rollout scored by a
  network (or by points) picks the same strategy as full rollouts, on positions where the answer
  is known. It is the target any new scorer must hit.
- **What:** 400 positions from r1 self-play (100 games, seeds 7100000, 3 players, every 3rd own turn
  plus setup, 4 per game: `training/data/bench-positions.json`); 48 rollouts per strategy played to
  the end, snapshotted at 2, 4, 6, 10 rounds and scored by w1, w1td, w1lin and points.
  `scorer-bench --positions training/data/bench-positions.json --rollouts 48 --scorers w1,w1td,w1lin --out training/data/bench-1.json`.
- **ETA:** started 13:20, pilot pace ~1.6 CPU-s per rollout set → about 40 min (14:00).
- **Result (13:20–13:48, 27.6 min, 50 CPU-s per position):** per-choice gain of the pick, judged by full
  rollouts on the other half: full +0.9 ±0.4, w1@4 +0.9, w1@6 +1.0 ±0.5, w1@10 +1.0, points@4–6 +0.2 pp.
  Full rollouts agree with themselves 38%; true advantage spread ~3.5 pp vs ~8.5 pp noise at 24
  rollouts. w1 picks cards 31–34% (full 21%). Pair correlation w1 0.10/0.21/0.33/0.52 at 2/4/6/10
  rounds. Write-up in ANALYSIS.md.

### Award counts (Longest Road / Largest Army diagnosis)

- **Why:** owner reports people keep both awards from the bot, especially at 2 players and on
  Jumbotan. Measure how bots hold awards before changing how they're valued (ANALYSIS.md).
- **Result (2026-11-17 13:30–14:00, r1 hero, `eval --rotate`, THREADS=4, alongside the scorer benchmark):**
  - All maps, 2 players, 300 seeds 7500000 (road at end hero/field; army at end; win):
    vs r1 0.45/0.45, 0.42/0.42; vs Intermediate 0.59/0.30, 0.51/0.37, 75.0%; vs style:builder
    0.41/0.49, 0.43/0.41, 49.2%; vs style:cards 0.65/0.17, 0.45/0.39, 61.3%. Self-play winner held
    the road in 72% of games, the army in 56%.
  - Jumbotan (`new-base-board-16`), 150 seeds 7600000, road at end hero/field:
    vs r1 2p 0.50, 3p 0.33, 4p 0.25 (even); vs strategy:expand 2p 0.49/0.51, 3p 0.33/0.34, 4p 0.22/0.26
    (r1 wins 55.3%, 42.0%, 31.3%); vs Intermediate 2p 0.70/0.30, 3p 0.66/0.17, 4p 0.63/0.12. Road lengths
    7.0–8.6. No bot field takes the road from r1 the way the person did (4 of 4 games, kept every time).

### Goal valuation v2 (goalModel 1) vs r1: no gain

- **Result (2026-11-17 afternoon, 400 seeds 7400000, field r1):** need-based income and measured enabling
  (goals.ts): enableValue 0 +0.05 ±1.11, 3 −0.98 ±1.06, 6 −0.78 ±1.08 pp; with enabling over the best
  three next goals: 3 −1.15 ±1.11, 6 −0.43 ±1.08 pp. With enabling it plays almost like r1 (settlements
  2.9 vs 3.1, cities 2.2 vs 2.1, cards 4.4 vs 4.3). One seat's CPU per game roughly doubles (profile: 569
  vs 257 ms). Not shipped.

### Tuning the plan-based planner's knobs (from r1): no gain

- **Result (2026-11-17 06:08–06:50):** 12 generations × 2,400 games (field r1, r1, trader, hoarder). Moves:
  pointPerCard 0.22→0.27, roundsPerPoint 2.2→2.6, cityOption 0.4→0.17, longestRoadReach 3.0→3.5,
  partnerGain up. `select` vs r1 (600 fresh seeds 7300000, field r1): t3 +0.9 ±0.8, t3-g8 +0.2 ±0.8,
  t3-g4 −0.6 ±0.8 pp. Not shipped: like every earlier tune, inside the noise.

### Stopped-rollout probe (cheaper teacher check): fails

- **Result (2026-11-17 05:41–06:07):** rollouts stopped after 6 rounds and scored by w1: −1.1 ±3.3 pp vs r1
  (same 60 seeds as v3's +6.7). 2.5× cheaper (101 vs 251 s per game) but the gain is gone; it picks
  cards 36% and current only 24%. w1 can't judge positions six rounds out well enough.

### Strategy probe v3 (dice leak fixed)

- **Result (2026-11-17 04:32–05:40):** +6.7 ±3.2 pp vs r1 (40.0% vs 33.3%, 60 seeds 7100000 × 3 seats, 3 players,
  24 rollouts, every 3rd own turn). Choices: current 31%, cards 30%, cities 22%, expand 11%, explore 4%,
  chart 1%; at setup current 66%. 251 s per game. Choices in `strategy-probe-3.json`.
- Selector `sel2` fit on its 1,747 choices: again no network beat the average (label sd 8–10 pp,
  mean advantages −3.4 to +1.8 pp).

### Strategy probe v2 (dice leak: result invalid)

- **Result (2026-11-17 03:11–04:31):** +13.3 ±2.9 pp vs r1 (46.7% vs 33.3%, 60 seeds × 3 seats, 3 players).
  **Not valid:** rooms default to balanced dice, whose upcoming order is in `state.diceDeck`, and
  `determinize` (search.ts) didn't reshuffle it, so rollouts knew the next rolls until the deck's
  reshuffle (up to 24 rolls). Same flaw in the pilot (+8.5) and in the 2026-11-12 build-move probe.
  Fixed 2026-11-17 04:30 (tests/search.test.ts covers it). Choices saved in strategy-probe-2.json.
- Selector fit on its 1,744 choices (`sel1`): no network beat predicting the average; the label
  spread (sd 10–11 pp) is no larger than paired rollout noise. Too noisy to learn from.

### Goal-lean strategies, fixed for the whole game, vs r1

- **Result (2026-11-17 02:55–03:05, 300 seeds 6000000):** expand −3.2 ±1.2, cities +0.9 ±1.3, cards
  +1.5 ±1.3, explore −1.4 ±1.2, chart −2.3 ±0.7 pp. They follow through: cities 2.6 cities vs 2.1, expand
  3.4 settlements vs 3.1, cards 6.4 development cards vs 4.0. Much less harmful than the presets.

### Strategy probe pilot (PLAN Phase 1)

- **Result (2026-11-17, 00:55–02:51, against s2):** the strategy seat won 33.5% ±3.3% (fair 25%); the
  same seats with s2: 25.0%. Paired +8.5 ±3.0 pp (50 seeds, 200 games, 4 players, all maps). 1,608
  choices: current 43%, cities 18%, cards 16%, expand 13%, explore 8%, chart 2%; at setup current 69%.
  411 s per game (about 7 CPU-min). Choices in `training/data/strategy-probe-1.json`.

### Plan-based planner with races and goal options → shipped as `r1`

- **Why:** test the plan-based planner (`planner` 1) with the rival model's odds and what a
  settlement makes possible next; ship it if it passes the shipping lane.
- **Results (2026-11-17, 01:15–02:15), all vs `s2` in the same seats, shipped field:**
  - Selection (400 seeds 6100000): planner alone −0.2 ±1.1; + races +0.7 ±1.2; + `cityOption` 0.4
    +2.0 ±1.2; + `frontierOption` 0.4 +3.4 ±1.2; both +3.5 ±1.1; frontier 0.8 +2.5, both at 0.4/0.8 +3.0.
  - Fresh seeds: +3.8 ±0.9 (600 seeds 6300000, fog exploring on); +2.4 ±0.9 (600 seeds 6500000,
    fog exploring off). Every table size positive on the first set.
  - Protected: base island 4p +2.5 ±1.5 (200 seeds); The Channel +1.5 ±1.4 (150); Middle Fog −1.1 ±1.6
    with fog exploring (ships 3.1 vs 1.2, dead routes 2.9 vs 2.0), +3.9 ±1.6 with it off; Cartographers
    maps (after adding a survey goal) +2.6 ±1.4 (300 seeds), survey ships 0.22 vs 0.16.
  - Advanced vs Intermediate (`eval --games 2000`): 56.6% vs 29.7% fair (×1.91), was 49.7% (×1.65).
  - `npm test` passes (bot CPU per move included).

### Race model in the old planner

- **Result (2026-11-17, 01:00–01:07):** `raceModel` 1 vs 0, `planner` 0: +1.1 ±0.9 pp (400 seeds 6100000).

### Fixed-strategy pass (PLAN Phase 1)

- **Result (2026-11-17):** each strategy as one seat vs shipped bots, 300 seeds, 1,114 games, paired vs
  shipped in the same seats: expand −6.3 ±1.3, cities −1.8 ±1.3, cards −6.7 ±1.2, explore −0.1 ±1.3,
  chart −1.0 ±0.8 pp. No strategy wins everywhere (expected). expand builds 6.9 roads vs 5.0 but only
  3.3 settlements vs 2.9 (dead routes 3.0 vs 2.0): roads to spots it then loses. cities ends with no more
  cities (2.4 vs 2.3) because it settles less. Write-up in ANALYSIS.md.

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
