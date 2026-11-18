# 2026-11-17 (night, 3 am): Strategy probe pilot: choosing when beats any fixed strategy

**Question.** Does choosing among whole-game strategies from the position (rollouts in which the
seat keeps following the strategy) beat the shipped bot, when every strategy loses on its own?

**Sources.** [RUNS.md](../RUNS.md) strategy probe pilot; `training/data/strategy-probe-1.json` (each
choice with every strategy's rollout score); [strategy-search.ts](../strategy-search.ts).

**Result (measured).** +8.5 ±3.0 pp over 50 seeds × 4 seats at 4 players (33.5% vs 25%), against
s2 (before r1). Each preset alone: −0.1 to −6.7 pp. So the value is in choosing when, as the
owner expected. Choices vary by map and stage: at setup it keeps current 69% of the time; in
later stages current drops to 27–35%. On Four Isles explore is chosen 28%, on Cartographers maps
chart 11–21%, on Trainer 1 (new-base-board) cities/cards over half.

**Good.** First evidence of a large gain within reach: +8.5 pp (in the +5 to +10 band of the plan).
It needs only about 7 choices per game, so a cheap learned selector could plausibly copy it.

**Bad / doubts.**
- Pilot: 50 seeds, ±3 pp. The interval runs from about +2.5 to +14.5.
- It is in the same range as the 2026-11-12 build-move search (+3.5 to +8.5): part of the gain is
  rollouts in general, not strategies in particular.
- Rollouts play opponents as the same bot (exact model of the field). Against people it will be
  less sure what they do.
- The presets change knobs the old planner reads (settlementValue, cityValue, spareRoads, ...). r1's
  plan-based planner ignores most of them, so these strategies no longer mean much on r1.
- 7 CPU-min per game: training only.

**Next.**
1. Rebuild strategies for the plan-based planner as goal-kind leans (multipliers on the payoff of
   city, settlement/route, development, survey goals) plus the existing setup lean. This matches
   the owner's framing: the same ROI goals, with a direction that can change when cards and the
   board change.
2. Rerun the probe against r1, at 3 players (cheaper per seed; owner's suggestion) and 4.
3. Save position features at each choice so Phase 2 can train a selector (what the view looked
   like when each strategy won its rollouts).

**Verdict.** Keep: strongest lead so far. Rework the strategy set before scaling compute.

_Note (04:30): this result is invalid. Rollouts knew the upcoming balanced-dice order; see the
[dice leak entry](2026-11-17-rollout-dice-leak.md)._
