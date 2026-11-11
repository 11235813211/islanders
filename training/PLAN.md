# Plan: a strong Advanced bot

Goal: a bot that beats skilled people. A human who isn't a strong player crushed two Advanced bots
on Middle Fog (2026-11-11), so we are far from it. Read `training/README.md` (commands, results
log) and `AGENTS.md` first.

## What we learned (2026-11-10 to 11)

- Every gain except one bug fix was noise (±1–2%). Knob tuning, setup round 2, value network v1,
  the seat value network with TD(λ), a fog knob, and a plan-based planner: none beat the
  shipped bot by more than its error. Results log in the README has the numbers.
- All yardsticks were our own bots, which share the planner's blind spots, so nothing measured
  how much stronger a bot _can_ be. Beating Intermediate is only a regression check.
- Learned values used greedily (one step, no search) exploit their own errors: twice the
  network hoarded. Full TD(λ) self-play without search is not the path in a game with hidden
  cards, huge trade options, and long plans.
- Symptoms like dead-end roads point at the hand-written planner; patching them one at a time
  moves win rates by ±1%. Treat them as clues, not goals.

## Rules from here

- **Measure before compute.** Each step names, in advance, the result that would justify the
  next one, and the result that stops it. No large run without a cheap pilot passing first.
- **Look for big effects.** We want gains of many times, not percent. Report effect ± error
  plainly; don't call ±1% an improvement.
- Yardsticks, strongest first: games against people (consented records, `/api/records`,
  `training/replays.ts`); a slow search bot (step 1); the gauntlet (regression only).
- Play-time CPU stays within the Worker budget (`tests/bots.test.ts`) unless the plan changes.
- Bots read only `GameView`.

## Steps

1. **Headroom probe.** A slow, training-only search bot: at each of its decisions, sample hidden
   hands and the deck from the public card count, play each candidate move out many times with
   the shipped bot (common dice across candidates; `training/rollouts.ts`, `disagree.ts` have the
   pieces), take the best. Test: 200 four-player games, one search bot vs three shipped, seats
   rotated. Decide in advance: **≥ 45% wins** (fair 25%) means large headroom and search is the
   teacher, go to step 3; **under 30%** means rollouts with this playout policy can't find much,
   stop and rethink (better playout policy, or another approach).
   _Pre-registered 2026-11-12, before any full run_ (`search` command, `training/search.ts`).
   Scope: the search seat searches its **build decisions only** (candidates: the shipped bot's own
   move, every city and settlement, the planner's road toward its target and its Longest Road
   road, a development card, stopping). Setup, robber, discards, and trade answers play as
   shipped, so a low result bounds this search, not the game. Hidden facts are resampled from
   public information only (`tests/search.test.ts`). It screens every candidate on 8 rollouts,
   then plays the best against the bot's own move on fresh paired rollouts and switches only if
   the gain is `margin` standard errors above zero (the screen's own estimate is biased upward).
   Runs, each 50 seeds × 4 seats = 200 four-player games (seeds 1,000,000+), all 4-player
   scenarios: **A** screen 8, confirm 32, margin 1.5 (the test); **B** margin 0 (switches
   more readily); **C** screen 16, confirm 64 (does more compute pay?). The shipped bot in the
   same seats wins exactly 25%, so the error is sampling only: ±3.1% (95%: ±6%) at 25%.
   Readings: ≥ 45% go to step 3; < 30% stop; 30–45% means real but modest headroom only if the
   95% interval excludes 25%, and then C vs A decides whether to spend more search or widen its
   scope (robber, setup, more road targets) before step 3.
   _Result 2026-11-12_ (search wins vs the exact 25% of the shipped bot in the same seats; error
   is the paired standard error across the 50 seeds):
   A 28.5% (+3.5% ±2.5%), B 33.5% (+8.5% ±3.2%), C 30.5% (+5.5% ±2.3%). The test (A) is under
   30%, so by the rule above this search stops here; B and C are just in the 30–45% band with
   95% intervals clear of 25%. All three agree on a small real gain (×1.1–1.35), far from the
   ≥ 45% that would make search the teacher. Switching more readily (B, 7.5% of decisions changed)
   beat doubling the rollouts with the strict margin (C, 2.4%); the search's own confirmed gain
   per change (9–20%) is several times what games show, as expected from picking maxima.
   Published Catan search (Szita 2010, Rubin 2017, Dobre & Lascarides 2017–18) needed 10k–50k
   rollouts per decision to reach 40–53% against heuristic bots; this probe used ~100.
2. **People as the yardstick.** Consented recording is live in code (not deployed). A handful of
   the owner's games against each bot version: from ~5% to ~40% wins shows in 10–15 games.
3. **Only if step 1 passes: expert iteration.** Search offline to produce decisions and values;
   train the network to imitate them (seat network and trainer exist: `value.ts`, `mlp.ts`
   `trainSeatNet`); play the network fast; search again with it as the playout policy; repeat.
   Each round gated by search-bot win rate and games against people, thresholds set first.
4. **CPU at play time** (owner's call): the free Workers plan allows ~10 ms CPU per move, so the
   shipped bot can't search. The paid plan allows far more; even 1–2 s of search per move may
   be the biggest lever. Step 1 shows how much it's worth.

## Tools that exist

`gauntlet` (one hero vs every opponent, paired with --baseline), `disagree` (where a challenger's
build decisions differ, rolled out to the end), `routes` (where a seat's roads went), end-of-game
diagnostics in eval (dead routes, fog revealed), `moves-collect` and seat-net TD(λ) fitting
(parked), consented game records and replay (`training/replays.ts`, `replays --file`).

## Status

- 2026-11-11, branch `advanced-bot-plans`: bug fixes (saving for reachable spots, route links),
  counter-offers not repeated to a person within two rounds, consented recording, the tools
  above, plan-based planner off (`planner` knob). Not deployed (recording needs the v4 Durable
  Object migration on deploy).
- 2026-11-12: step 1 run (above): small, real headroom from build-decision search; under the
  45% bar. Next is the owner's call: step 2 (people), or a wider/larger search (robber, setup,
  more road targets, margin 0, more rollouts) before step 3.
