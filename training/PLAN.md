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
- Next: step 1.
