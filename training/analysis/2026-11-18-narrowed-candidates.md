# 2026-11-18: What did the narrowed road and forecast candidates establish?

**Question.** Summarize the owner's pasted all-map and two-player Jumbotan results, ending
at 01:48, and distinguish a promising lead from a demonstrated improvement.

**Sources.** The supplied output and [RUNS.md](../RUNS.md), "Fresh-seed check of the narrowed
ideas": 400 seeds starting at 8400000 for all maps, 1,475 rotated games per version;
150 seeds / 300 rotated games per version for each Jumbotan opponent field. These are
different candidate implementations from the earlier grids. No new simulations were run
for this summary. The pasted output truncates some completion and timing fields.

## Checked results

Use the final paired differences, not subtraction of the headline win percentages. The
paired estimator averages within seeds; headline win rates weight individual games.
The printed ± values are one standard error, not 95% confidence limits.

| All-map candidate                                | Paired win difference, percentage points | Interpretation                              |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------------------- |
| setupForecast 0.25                               | +0.93 ±0.84                              | Best point estimate; weak lead              |
| roadRace 1                                       | +0.54 ±0.90                              | No clear gain                               |
| setupForecast 0.25 + roadRace 1 + forecastPlan 1 | +0.17 ±1.10                              | No demonstrated benefit from combining them |
| forecastPlan 1                                   | −0.11 ±0.75                              | Near zero, no clear gain                    |
| setupForecast 0.5                                | −0.55 ±0.98                              | Higher weight does not show improvement     |

Every approximate unadjusted 95% interval crosses zero. Even setupForecast 0.25 is
approximately −0.7 to +2.6 pp. Selecting the best of five candidates further limits what
can be inferred from its ranking. These results do not show equivalence or prove small
benefits impossible; they do not justify a strength claim or promotion on their own.

The setup variants build somewhat more cities (2.21 and 2.25 versus baseline 2.13 per game).
The combined version builds more roads (5.60 versus 5.33) and buys more development cards
(4.52 versus 4.34), without a clear win gain. These are behavioral descriptions, not proof
that those extra actions caused the outcomes.

| Two-player Jumbotan field | Baseline win rate → roadRace 1 | Paired change  | Baseline road held at end → roadRace 1 |
| ------------------------- | ------------------------------ | -------------- | -------------------------------------- |
| shipped                   | 50.0% → 48.0%                  | −2.00 ±1.88 pp | 50% → 42%                              |
| style:roadracer           | 51.7% → 50.0%                  | −1.67 ±1.86 pp | 58% → 50%                              |

The road variant wins less and holds the award less in both observed samples. Win-rate
uncertainty is too large to establish a regression; no uncertainty for award frequency is
reported. It has not demonstrated a fix for the original two-player award problem.

**Additional context, not established by this output alone.** RUNS.md records that this
spare-road version omitted the old close-race goal and that the goal has since been
restored. That is a plausible implementation explanation, not a demonstrated causal result
of the pasted comparisons. The restored version requires its own results.

## Conclusion and verdict

**Good:** shared baseline, paired comparisons, and a targeted Jumbotan check. Light setup
forecasting is a reasonable candidate for fresh confirmation.

**Bad:** no clear overall gain; the road-specific target behavior moved in the wrong
direction in these samples. Combining all three changes added activity without a clear
win improvement.

**Verdict: keep setupForecast 0.25 as a lead; rework and retest the road change; no promotion
supported by this batch alone.** Do not declare the road idea or forecasting in general
disproved. The conclusion changes with fresh, sufficiently precise results for a frozen
candidate under [STATISTICS.md](../STATISTICS.md), including the relevant target population.

**Reproduce without new games.** Compare the supplied final paired lines with the
"Fresh-seed check of the narrowed ideas" entry in RUNS.md. `select` and its `--report`
path are in `training/cli.ts`; the weighting and standard errors are in
`training/evaluate.ts` (`summarize`, `pairedDifference`). Approximate 95% limits here are
the printed paired difference ±1.96 times its SE; these are exploratory, unadjusted limits.
