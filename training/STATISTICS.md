# Statistical requirements for bot improvements

This protocol governs future experiments in [PLAN.md](PLAN.md). Existing results are
assessed separately in [EVIDENCE.md](EVIDENCE.md); they were not necessarily collected under
these requirements. A code correction, a plausible mechanism, and a statistically supported
increase in wins are three different claims.

## Register the comparison before running it

Record the candidate code hash, baseline hash, engine revision, weights, effective defaults,
board-library snapshot, Node version, opponent implementations, map/settings mixture, table
sizes, seed lists, action limit, analysis method, and stopping rule. Define the target
population explicitly: a bot field, one particular human, or a specified group of humans.

Use one primary outcome: the candidate's change in probability of winning a whole game.
Production, points, charts, survey ships, and action disagreements explain behavior but do
not substitute for wins. Specify the smallest effect worth the work before observing results.

Keep three disjoint sets of games: exploratory pilot, confirmation, and replication.
Only the pilot may influence candidate selection, parameter choices, or sample-size planning.
Freeze one finalist before confirmation. If multiple finalists receive confirmatory tests,
declare their number and adjust for that family. A changed candidate needs new held-out data.

Seed numbers alone do not guarantee independence from training: record which ranges and
scenarios were used in every earlier collection, tuning, selection, and evaluation run.
Do not reuse the historical 900000, 1000000, 1100000, or 1200000 ranges as an untouched holdout.

## Pair games and count independent units correctly

Compare candidate A and baseline B against the same frozen field, on the same generated
scenario and initial seed, rotating each through every seat. Within seed `s`, let:

`D_s = average over seats of (A won - B won)`

Use the mean of `D_s` as the win-rate difference. Its standard error is the sample standard
deviation of those seed differences divided by the square root of the number of independent
seeds. Seat rotations share a board; counting each rotation as an independent observation
can misstate uncertainty. This is the unit already used by `pairedDifference` in
[evaluate.ts](evaluate.ts).

For a large enough sample with non-degenerate differences, use a paired t interval:

`mean(D) ± t(1 - alpha/2, N - 1) * sd(D) / sqrt(N)`

Report the interval and the number of seed clusters, not just `± SE`. This applies the
standard paired-observation method to independent seed-level differences. [NIST paired observations](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm)

Preselect a suitable interval method for sparse or degenerate outcomes; an observed zero
standard error is not proof of equivalence. For a weighted opponent field, first combine
opponent results with fixed weights within each seed, then estimate uncertainty across
seeds. The same principle applies to simultaneous map summaries: preserve their dependence.

The current simulator shares a seeded random stream, not a separate immutable dice tape.
Different actions can consume random values differently, so later dice need not remain
identical. Pairing remains useful, but describe it as shared initial seeds and scenarios,
not guaranteed identical future rolls.

## Current tools and limits

| Tool or output                                | Appropriate use                                                        | Limitation                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `compare`, final `A − B` line                 | Paired mean difference and seed-cluster SE for the registered mixture. | Prints one SE, not a confidence interval; no standard raw-results export in this command.                                              |
| `eval`, individual `A`/`B` lines in `compare` | Descriptive win rate, action counts, completion, per-map inspection.   | `summarize` uses a per-game binomial SE; it does not account for rotated seeds or provide paired uncertainty.                          |
| `gauntlet`, individual paired rows            | Opponent-specific paired comparisons.                                  | The weighted-total SE assumes independent opponent rows even though seed ranges are shared. Recompute from seed-level data for a gate. |
| `compare`, per-size lines                     | Descriptive size-specific differences.                                 | These lines omit uncertainty; they cannot establish non-inferiority.                                                                   |
| `records-disagree`                            | Locate particular decisions to inspect.                                | Selected, correlated positions; bot continuations; recorded hidden state; excludes trades.                                             |
| Named checkpoint or `shipped`                 | Compare parameters under the current implementation.                   | Not a frozen implementation baseline after code changes.                                                                               |
| `ref:advanced --ref <hash>`                   | Freeze the older brain and its imported helpers.                       | `actWith`, the engine, simulator, and outer Cartographers wrapper still come from the current runner.                                  |

If an experiment changes a shared wrapper or engine, `ref:advanced` alone does not isolate
the old behavior. Use separately frozen complete runners, or an explicitly verified
experiment boundary, with the same intended rules and scenario generator. Do not let the
baseline silently inherit the candidate change.

The current commands can support some paired comparisons, but do not implement the whole
protocol. Where raw export, clustered totals, or simultaneous intervals are required,
the gate stays unmet until a reproducible analysis exists. Future test/verification tooling
belongs in `tests/`; reusable experiment infrastructure belongs in `training/`. No such
code is introduced by this documentation change.

## Minimum effects and sample size

The plan uses the following **project decisions**, not statistically discovered constants:

| Claim                                            | Required confirmed effect                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Worth a focused improvement                      | Lower confidence bound above +2 pp wins in its registered target population.        |
| Worth a major planner or teacher investment      | Lower confidence bound above +10 pp versus a frozen Advanced field at four players. |
| No material regression in a protected population | Lower confidence bound above −2 pp.                                                 |
| Completion preserved                             | Upper confidence bound on the increase in unfinished games below +0.5 pp.           |

For a four-player baseline with 25% wins, +10 pp means 35% wins. These are advancement
thresholds, not predictions. A smaller real effect can be recorded as smaller; it does not
justify a claim of a breakthrough. Behavior correctness can be assessed independently,
but must not be presented as measured strength.

Choose a fixed confirmation sample using the pilot variance and 90% power at a declared
alternative. When the gate requires a lower bound above a minimum effect `delta_min`, use
the distance from that minimum to the planning alternative `delta_alt`:

`N ≈ ((z(1 - alpha*/2) + z(0.90)) * sigma_D / (delta_alt - delta_min))²`

Here `alpha*` includes any multiple-comparison adjustment. Validate the final sample size
using the chosen test and a conservative variance estimate; pilot variance is uncertain.
Do not design for detecting +2 pp against zero and then claim the same power to establish
an effect greater than +2 pp. [NIST sample-size planning](https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm)

Illustration only: with one primary comparison, 95% two-sided intervals, independent
seed differences with standard deviation 0.25, a +2 pp minimum and a +5 pp planning
alternative, the normal approximation gives about 730 seeds. At four players that is
2,920 games per version, 5,840 total, before replication or regression checks. It is not
a measured variance or a universal sample size; multiple comparisons increase the requirement.

Freeze a compute ceiling as well as the sample size. If the required precision cannot be
funded, record the question as unresolved. A fixed sample of 10–15 human games cannot be
assumed sufficient without an effect, variance, and power calculation.

## Multiple comparisons and stopping

Use a 5% family error budget for the predeclared confirmatory claims. If there are `M`
comparisons, a simple conservative choice is a `1 - 0.05/M` interval for each. Include the
protected strata and any multiple finalists in the declared family; do not select only
the favorable map after seeing the results. Bonferroni does not require independent
comparisons. [NIST simultaneous intervals](https://www.itl.nist.gov/div898/handbook/prc/section4/prc473.htm)

Run the fixed sample before looking at a pass/fail result. Do not add games until the
interval turns positive. Any sequential design needs its own error-controlled stopping
rule registered beforehand. All candidates, null results, harms, exclusions, and abandoned
runs remain in the experiment record. New confirmation attempts must be accounted for;
repeated attempts do not reset the evidence history.

| Result at the planned sample                      | Decision                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Lower bound exceeds the practical threshold       | Eligible for independent replication.                                                               |
| Upper bound is below the practical threshold      | Stop that investment: worthwhile benefit is ruled out at the stated confidence for that population. |
| Interval crosses the threshold                    | Inconclusive; do not advance on the point estimate.                                                 |
| Primary gate passes but a protected gate does not | Do not promote as a general improvement.                                                            |

Replication uses fresh seeds, the same frozen candidate, and the same registered population.
Require its lower bound above zero and its estimated gain at least the practical threshold,
as well as the original confirmation gate. Do not average a failed replication away.
Any changed scope requires a new, narrower registration and independent data.

## Completion, fallbacks, and protected populations

Count unfinished games in every denominator. Never delete them from a candidate comparison.
Also report a sensitivity range: at one extreme all unresolved candidate games lose and
unresolved baseline games win; at the other, reverse those assignments. A strong claim
should survive the unfavorable assignment with the registered uncertainty analysis.
Record action caps, illegal-action fallbacks, crashes, and their causes separately.

For the first Cartographers income experiment, protect base island at four players,
non-Cartographers sea games, and 5–6 player games under fixed mixtures. Register the mixture
inside each group before running. A non-significant regression is not proof that the
change is harmless; its lower interval bound must clear the −2 pp margin.

CPU and behavior checks are additional gates: existing meaningful unit tests and
`npm run check`, median/p99/worst decision timing on the same hardware, and deployment CPU
measurement before claiming request-budget safety. Do not relax trade limits to gain wins.

## Evidence against people

Use randomized version assignment within prespecified player/map/size blocks, balancing seats
and keeping the version hidden where practical. Compare the person's chance of winning
against baseline tables and candidate tables; this table-level outcome differs from one
hero seat's win probability against bots and needs its own declared minimum effect.

Repeated games from a person or session require a design and analysis that accounts for
that grouping. Pilot those independent units to plan sample size. One person's results
support a claim about that person under the tested conditions; claims about skilled players
require multiple players and uncertainty at the player level. Do not treat hundreds of
moves from a few games as a large human trial.

Existing consented records can discover hypotheses and provide regression positions.
They are already examined data, so they cannot be the sole confirmation set. Include
completed wins and losses in descriptive studies, record unfinished and incompatible
records explicitly, and do not silently drop difficult cases.

## Required experiment record

Save the registration, complete commands, raw per-seed outcomes, analysis version, and all
results together. Report absolute win rates, paired difference in pp, adjusted interval,
independent seed count, total games, opponent and scenario definitions, completion and
fallback rates, runtime, and whether each gate passed. Keep exploratory findings separate
from confirmation. The next experiment is justified by that record, not by its best example.
