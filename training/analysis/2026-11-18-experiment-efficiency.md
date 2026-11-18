# 2026-11-18: Are the current road and forecast experiments worth their cost?

**Question.** Are Claude's current batches using a useful number of games, and are they efficient?

**Sources.** Working tree based on `6293c33d613fff8e7a4032f6b1c5b7afc7cd40b4`, including
uncommitted experimental code; `training/{cli,evaluate,pool,jobs,forecast-check,road-diagnosis}.ts`,
`shared/bots/advanced/forecast.ts`, [RUNS](../RUNS.md), [protocol](../STATISTICS.md), and the
[original award diagnosis](2026-11-17-awards-vs-people.md). Runtime snapshot: Node 24.22.2,
`THREADS=10`, comparison worker at approximately 1,070% CPU (about ten cores).

Batch scripts and filtered output are under
`/private/tmp/claude-501/-Users-trentmosher-Software-01-GAMES-06-Catan/2ada4701-6087-4c51-97b6-118f810bbdc4/scratchpad/`:
`road-grid.sh`, `road-grid.txt`, `batch2.sh`, `batch2.txt`.
Script SHA-256: road-grid `8bd659039ca821265cb52d6dd0fb01e25d45149b9228f8dc461c830b77b1738e`;
batch2 `1a073962620ef119fe52791f837c893f5302d646f0a4191429fc1af863e07686`.
These scripts do not freeze source code. Results below are a partial snapshot, not a claim
that the still-running batch passed. This audit started no games and changed no bot or runner code.

## Sample size: reasonable pilots, limited precision

`compare --games 300` means 300 initial seeds, each rotated through every seat, for each of two
versions. The current mixtures produce 1,116 games per version with seed start 8100000 and
1,106 with 8200000: about 2,200 simulations per comparison, with 300 seed clusters.
`pairedDifference` correctly averages rotations within each seed before estimating uncertainty.
The two versions share initial seeds and scenarios, not a guaranteed immutable future dice tape.

Completed v2 comparisons at this snapshot (win difference in percentage points):

| Candidate      | Field           | Difference ± one SE | Approximate unadjusted 95% interval |
| -------------- | --------------- | ------------------- | ----------------------------------- |
| roadRace 1     | shipped         | −0.36 ±1.15         | −2.62 to +1.90                      |
| roadRace 1     | style:roadracer | +0.21 ±1.20         | −2.15 to +2.57                      |
| roadRace 0.5   | shipped         | −0.01 ±1.11         | −2.19 to +2.17                      |
| forecastPlan 1 | shipped         | −2.43 ±1.13         | −4.65 to −0.21                      |

Intervals use rounded printed SEs times approximately 1.968 (299 degrees of freedom).
They are exploratory, unadjusted for testing multiple candidates, and cannot serve as shipping
gates. The road results show no clear improvement; they do not prove zero effect. The forecast
result is an adverse pilot signal, not confirmatory proof of harm.

At this variance, 300 seeds can screen substantial effects but are too imprecise to resolve
sub-percentage-point tuning. Halving the standard error requires about four times the seeds,
not twice. This follows the [paired-observation method](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm)
and [sample-size scaling](https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm).
Reusing these seeds during exploration is useful pairing; it is not independent replication.

## Verified avoidable work

- The first grid ran six comparisons: `2 × (3 × 1116 + 3 × 1106) = 13,332` simulations.
  The second schedules seven: `2 × (6 × 1116 + 1106) = 15,604`, excluding diagnostics.
- `compare` recomputes B for every candidate. In batch2, six comparisons share the shipped
  baseline, shipped field, and 8100000 seed set. Reusing that B result saves
  `5 × 1116 = 5,580` games, **35.8% of the batch's scheduled comparison games**. This is a
  game-count saving, not a measured wall-time saving: candidate and baseline costs differ.
  It requires unchanged code, effective parameters, engine, library, scenario settings and seeds.
- `select` in `training/cli.ts` already runs one baseline and pairs every named checkpoint
  against it. Registering the knob variants as checkpoints would enable that reuse within a
  frozen batch without a new runner. Checkpoints freeze parameters, not source implementation.
- `forecast-check` plays the same 120 shipped-policy games separately for spreads 2.5, 3.5 and 5.
  The changed spread affects only the final conversion of forecast finish times to probabilities,
  not the policy playing those games or the forecast trajectory. One saved pass of finish times
  and outcomes can score all three spreads, avoiding 240 repeat games and repeat forecasting.
- `road-diagnosis` and `forecast-check` run serial loops; their `THREADS=10` environment setting
  does not parallelize them. The comparison stage does use ten worker threads and small job
  batches. Its observed CPU usage supports active parallel work, not a stalled process.
- The shell filters discard raw comparison outcomes, progress and much diagnostic output.
  `compare` itself has no raw-results export. Save per-seed results and full logs for reusable
  analysis; do not replay games merely to recover statistics that could have been retained.

## Where the experimental effort should go

The original issue was people taking and keeping Longest Road in two-player Jumbotan.
These broad samples contain only 31 or 34 two-player seeds, spread across maps. Broad testing
is useful for regressions but gives little precision on that specific problem. The new
`style:roadracer` is a useful stress opponent, but uses the same experimental road model at
another weight; it has not been established as a substitute for the observed human strategy.

Keep testing distinct mechanisms (road decisions, forecast during play, forecast at setup).
Before another large weight sweep, inspect whether the relevant decisions actually improve
in the target situations. The road diagnosis compares the best proposed road target with what
the unconstrained policy later did; a low realized arrival rate mixes prediction error with
choosing other plans. It does not alone establish that the conditional forecast is wrong.
Likewise, good winner calibration does not prove that ranking alternative actions helps.

**Recommended next batch:** use a small, explicitly exploratory 50–100-seed target pilot to
check behavior and large failures, with a fixed source snapshot and reusable baseline. That
sample is not enough to dismiss small benefits. Advance a promising version to broader tests;
freeze one finalist and size fresh confirmation/replication from pilot variance under the
existing protocol. Add targeted Jumbotan/two-player evidence, and eventually human games.
Retain CPU-per-move checks: high offline throughput does not establish Worker request safety.

**Good:** paired seeds, all-seat rotation, clustered SEs, whole-game wins, active worker pool,
and distinct experiments that can answer useful questions.

**Bad:** repeated baselines and calibration trajectories, serial diagnostics, weak targeting
of the original problem, and output that cannot be reused for detailed analysis.

**Verdict: keep the pilot evidence; rework the batch organization.** The quantity is not absurd,
but a substantial part is avoidable. The completed results justify diagnosis more than another
broad tuning grid. This is not evidence to abandon the underlying road or forecast idea.
The conclusion would change with a targeted behavioral improvement, a frozen finalist that
passes fresh confirmation, or measured overhead showing reuse costs more than it saves.

## Reproduce the audit without running games

Read the script/output pairs named above; inspect `compare` and `select` in `training/cli.ts`,
`pairedDifference` and `matchJobs` in `training/evaluate.ts`, and the serial loop in
`training/forecast-check.ts`. The tables and arithmetic above preserve the evidence if the
temporary logs disappear. For a current runtime snapshot:

```sh
ps -axo pid,ppid,etime,time,%cpu,state,command
rg -n 'async compare|async select|const baseline|pairedDifference|forecastCheck|const scale' training/cli.ts training/evaluate.ts training/forecast-check.ts shared/bots/advanced/forecast.ts
```
