# 2026-11-17 (evening): What the saved benchmark says about the plan

**Question (owner).** Did the last experiment behave as the idea predicted, why or why not, and
is PLAN.md's next step still right? No new games: everything below reuses saved rollouts.

**Sources.** `training/data/bench-1.json` (400 positions from 100 r1 self-play games, 3 players,
48 rollouts per strategy, each with w1 scores at 2, 4, 6 and 10 rounds);
`strategy-probe-3.json` (v3, full rollouts) and `strategy-probe-4.json` (v4, stopped w1@6). Code:
[bench-analysis.ts](../bench-analysis.ts), [bench-probes.ts](../bench-probes.ts),
[bench-core.ts](../bench-core.ts). Method: a rule picks from some rollouts of a position and is
judged by final results on that position's other rollouts, over 30 random splits. `±` is one
standard error, clustered by game. "Gain" is pp of win chance per choice over `current`.

## What the idea predicted, and what happened

The idea: the stopped probe lost its gain (−1.1 ±3.3 vs +6.7 ±3.2 pp) because w1 is a poor judge,
so a better network would make a cheap teacher. The data does not support that as the main cause.

| Check (measured)                               | Result                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| w1 at 4, 6, 10 rounds vs full, same CPU        | Differences −0.03 to +0.13, each ±0.15 to ±0.24 |
| Signal sd per strategy, by position            | cities 2.5, expand 3.9, cards 4.2 pp            |
| Noise sd of that advantage at 24 rollouts      | 8.2 to 8.7 pp                                   |
| Same-sample outcome correlation with `current` | 0.38 to 0.44, so pairing removes under half     |
| Gain by full rollouts per strategy             | 3: 0.10, 6: 0.24, 12: 0.50, 24: 0.86, 36: 1.05  |

CPU here is turns played. The stopped probe's measured CPU ratio was 0.40 against 0.61 by turns,
so stopped rollouts may be somewhat cheaper than this table assumes.

**Why (reasoning).** A stopped score removes the late game's randomness but adds the network's
error, and the two roughly cancel. A sharper network can improve this, but the gain per choice is
limited by a small signal under heavy noise, and games diverge quickly, so paired dice help only
partly.

## Corrections to earlier reasoning

1. **Per-choice gains don't add up across a game (reasoning, with a check).** Each rollout holds
   the strategy to the end, so a lasting lean is counted again at every choice. The correct sum
   compares each pick with the strategy held just before it. Check: `cards` averages +1.09 ±0.39
   per position, which would add to about +10 over 9.7 choices, while `cards` held for a whole
   game measured +1.5 ±1.3 (all table sizes, so only a rough comparison).
2. **A per-stage rule is worth little over a whole game.** Fit on other games, it picks cities at
   setup and cards after that. Counted correctly: +0.44 ±2.25 pp per game, or +0.22 ±0.82 without
   the setup step. The lean that looks good per choice mostly isn't a new gain at each choice.
3. **The benchmark does not explain the two probes.** With each probe's own switching rule and
   held strategies, it predicts v3 at +5.3 ±1.4 (measured +6.7 ±3.2) and v4 at +7.8 ±1.6 (measured
   −1.1 ±3.3). v4 misses by about 2.4 errors. The prediction assumes the held strategy is unrelated
   to the current position, which is optimistic, so v3's match is weak support only.

## Other results

| Use of 24 rollouts per strategy | Gain ±se   | vs best mean ±se |
| ------------------------------- | ---------- | ---------------- |
| Best mean                       | 0.86 ±0.28 | n/a              |
| Shrink toward the stage average | 1.27 ±0.31 | +0.41 ±0.16      |
| Only current, cities, cards     | 1.03 ±0.27 | +0.17 ±0.08      |
| Average full, w1@6 and w1@10    | 1.04 ±0.30 | +0.18 ±0.10      |
| Switch only if over 1 paired se | 0.58 ±0.22 | −0.28 ±0.12      |

These are per-choice numbers against `current`, so correction 1 applies: shrinkage's gain may
partly be the average lean. Dropping weak options and shrinking need games to confirm. Successive
halving did not help at equal budget (−0.06 ±0.08 and +0.10 ±0.08).

**Selector.** With 5-fold splits by seed, ridge models using 86 inputs did not beat a constant per
strategy: v3 labels 1.20 to 1.62 vs constant 1.76 (±0.37); v4 labels, which include planner goal
inputs, 0.39 to 0.50 vs 0.58 (±0.10). So no position-specific value was found, but full-rollout
labels have never been paired with goal inputs: v3 saved none.

## Conclusion

- **Checked:** at equal CPU, a stopped w1 is no better or worse than full rollouts. More rollouts
  raise the gain slowly. Linear selectors find nothing beyond constants.
- **Inferred:** a better value network alone is unlikely to unlock a cheap teacher. Why v4 failed
  is open: luck, or w1 misjudging positions the leaning seat creates, which r1 self-play positions
  would not contain. The second is a hypothesis.
- **What would change this:** a stopped scorer clearly beating full rollouts at equal CPU on the
  probe seat's own positions, or a selector beating constants on held-out games.

## Recommended changes to PLAN.md (for the owner to decide)

1. Put **Longest Road as a race first**. It is the only item here with evidence from games against
   a person, it is cheap, and it can ship. Those games were against s2, so r1 needs watching too.
2. **Drop the w1@4, 48-rollout probe rerun.** Its equal-CPU question is answered, and 60 seeds
   (±3.2) could not separate the outcomes that matter.
3. **Replicate v3 on 180 fresh seeds** before building on it (about ±1.8 pp, about 3.5 hours), with
   whole-game `cards` and `cities` seats on the same seeds as cheap controls.
4. **Gate the selector before refitting any network.** Compute goal inputs from saved states, add
   full-rollout labels (2,000 positions, about 2.3 hours), and require a held-out gain over constants.
5. **If v4's failure still matters,** run the scorer benchmark on the probe seat's own positions.
   Refit a value network only if that shows a scorer problem.
6. If the selector gate fails, stop treating the probe's gain as something a cheap live bot can
   copy, and put the effort into weaknesses seen in games against people.

## Good, bad, verdict

**Good.** Answers several planned experiments with no new games, and every number can be rerun.
**Bad / limits.** 3 players only; r1 self-play positions; 19 setup positions; opponents are exact
copies of the bot; nothing here measures play against people. Effects this size are far from the
owner's goal of large gains against people.
**Verdict.** Keep the benchmark. Rework the plan's order. Don't scrap the value network idea, but
stop treating it as the next step.

**Reproduce.** `node training/run.mjs bench-analysis` (a few seconds).
