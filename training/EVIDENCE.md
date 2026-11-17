# Evidence for Advanced bot improvements

Reviewed 2026-11-16. The conclusion is narrower than the proposed improvements: **the
existing record does not establish that a new economic planner, trade model, race model,
or larger network will materially increase wins.** It establishes specific code gaps,
several failed approaches, and historical improvements against particular bot fields.

Note (2026-11-17): [ANALYSIS.md](ANALYSIS.md) explains why these experiments could only find
one-step improvements on the current bot, so small results here don't rule out large gains;
[PLAN.md](PLAN.md) now encourages exploring those directions. The status table at the end is
superseded by the plan.

[ADVANCED.md](ADVANCED.md) describes current decisions. [PLAN.md](PLAN.md) permits larger
work only after a candidate passes the [statistical protocol](STATISTICS.md).
The chronological [README results log](README.md#results-log) remains the historical record.
The results below are reported results from that log, not new experiments or reanalyses
of raw game data. A missing paired interval is not reconstructed from unrelated errors.
Each historical result applies to the implementation tested then; it is not a fresh
benchmark of the current revision.

## Evidence categories

| Category                | What it supports                                                                                   | What it does not support                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Verified mechanism      | A branch, omission, or numerical mismatch exists in the inspected code.                            | That fixing it improves wins, or how often it matters.         |
| Descriptive observation | A pattern occurred in the recorded games.                                                          | Its cause or generality to other players, maps, and versions.  |
| Historical comparison   | A reported candidate outperformed or underperformed its baseline in that experiment.               | Automatic transfer to the current engine or to skilled people. |
| Confirmed improvement   | A frozen candidate passes prospective effect-size, uncertainty, replication, and regression gates. | Generality beyond its tested population.                       |

None of the proposed directions below currently meets the final category.

## What past experiments actually show

`pp` means percentage points of win probability. An edge of ×1.3 means wins divided by fair
seat share; it is not +30 percentage points. The historical `±` generally denotes one
standard error, not a 95% interval. Where the log gives a paired standard error, the rough
interval below is estimate ±1.96 SE; these are unadjusted descriptive calculations, not
new confirmatory claims. The search rows use approximately 2.01 SE for 50 seed clusters.

| Experiment                                 | Reported result                                                                                        | Supported conclusion and limit                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial setup network                      | `s1` edge ×1.21; linear ×1.16; earlier control affected by seat imbalance and later scenario changes.  | Historically useful setup ranking. No isolated paired interval here; does not prove more setup training will help.                                                                                          |
| Knob tuning `t1` versus `s1`               | +0.8 ±1.3 pp, 600 paired seeds; approximate 95% interval −1.7 to +3.3 pp.                              | No demonstrated gain. A small positive effect also has not been ruled out.                                                                                                                                  |
| Setup round two                            | `s2` +0.3 ±0.8 pp versus `t1`; approximate interval −1.3 to +1.9 pp.                                   | No demonstrated improvement from that additional training round.                                                                                                                                            |
| First value network                        | Full control edge ×0.35; restricted role −0.9 ±1.0 pp.                                                 | Full control was substantially worse and hoarded. Better training loss did not translate into better play.                                                                                                  |
| Seat value network                         | Full control edge ×0.20; restricted role −1.5 ±0.9 pp.                                                 | Repeated adverse result for that approach. This does not prove all learned policies must fail.                                                                                                              |
| Reachable-settlement road fix, 2026-11-11  | Wins versus Intermediate 33.5% → 45.8%, edge ×1.25 → ×1.71, seeds 900000; Beginner edge ×2.87 → ×3.22. | Strongest reported large gain associated with a concrete planner correction. No paired uncertainty logged here; route-link changes were also present. It does not quantify the benefit of a new correction. |
| Public hand count                          | 34.7% → 36.3%, latter ±0.9 pp, 800 rotated seeds starting 700000.                                      | Positive historical signal, but a single-arm SE cannot supply the paired uncertainty of the +1.6 pp difference.                                                                                             |
| Alternative plan scorer                    | +0.7 ±1.3 pp and −0.2 ±1.4 pp; Middle Fog 3p −10.0 ±1.6 pp.                                            | No demonstrated overall benefit; substantial map-specific regression. Do not revive it on the strength of its conceptual appeal.                                                                            |
| Branch versus earlier Advanced, 2026-11-12 | Base/4 32.6% ±1.7 pp against 25% fair, 800 games; all scenarios edge ×1.44.                            | The combined branch beat that earlier bot in the reported sample. It does not isolate which change caused the gain.                                                                                         |
| Cartographers survey changes               | 28.6% ±1.6 pp against 26.3% fair, 761 games; surveys and lodestone production increased.               | Behavior changed. The reported win uncertainty and mixed-size aggregation do not establish a strong gain.                                                                                                   |
| Endgame check                              | Edge ×1.01 ±0.04, 1836 games.                                                                          | No demonstrated overall strength gain; selected behavior tests can still justify a correctness claim.                                                                                                       |
| Lodestone chart weight doubled             | 26.6% ±0.8 pp against 26.3% fair, 3416 games; more charts and lodestone.                               | More economic activity did not establish more wins. Strong reason to keep wins as the primary outcome.                                                                                                      |
| Special-build and gold fixes               | Versus Intermediate edge ×1.72, old bot ×1.71; about 1% unfinished for both.                           | Behavior fixes have no demonstrated large strength gain from these summaries. Unfinished games belong in the denominator.                                                                                   |

The early unrotated control was ×0.93; the rotated control was ×1.00. Comparisons across
those protocols or across changed scenario mixtures must not be treated as paired gains.
The seat-order labeling bug affected positions collected after 2026-11-12 and before its
2026-11-14 fix; the log says no logged training run used those bad labels. Mixed-size action
counts before the 2026-11-14 averaging fix also require caution.

## The search experiment remains closed

_Note (2026-11-17): this probe's rollouts knew the order of the balanced dice deck (`determinize`
didn't reshuffle it; fixed, see [ANALYSIS.md](ANALYSIS.md)), so its gains are biased upward._

The original 2026-11-12 probe declared its gates before running: at least 45% wins versus
three shipped bots to justify using search as a teacher; under 30% meant stop and rethink.
It searched build decisions with a narrow action set and the existing bots as continuation
policies. Each configuration used the same 50 seeds rotated over four seats, 200 games.

| Configuration                        | Win rate | Difference from 25% and approximate unadjusted 95% interval |
| ------------------------------------ | -------- | ----------------------------------------------------------- |
| A: screen 8, confirm 32, margin 1.5  | 28.5%    | +3.5 ±2.5 pp SE; interval −1.5 to +8.5 pp                   |
| B: screen 8, confirm 32, margin 0    | 33.5%    | +8.5 ±3.2 pp SE; interval +2.1 to +14.9 pp                  |
| C: screen 16, confirm 64, margin 1.5 | 30.5%    | +5.5 ±2.3 pp SE; interval +0.9 to +10.1 pp                  |

A failed its preregistered progression gate. B and C suggest possible modest headroom, but
share seeds with A, involve multiple configurations, and have no independent confirmation
in the log. B's higher point estimate does not prove it beats C. Compute cost was roughly
4–11 CPU-minutes per game. No run met the 45% teacher target.

These results bound this candidate set and continuation policy. They neither establish that
larger search is worth its cost nor rule out a different, stronger strategy. The previous
plan is preserved in git at `4bcded4:training/PLAN.md`; these thresholds have not been
retroactively changed to declare the old experiment successful.

## What the human records establish

Two log entries describe different samples: the move comparison used 11 finished games
from one person, who won six; the later whole-game study reports 12 finished games.
Their relationship and version distribution need reconciliation before pooling them.
There is no randomized baseline-versus-candidate human comparison in those entries.

The move study examined 944 human moves, found 354 disagreements, and ran 64 paired
continuations per disagreement. Reported categories included build +0.7 ±0.4 pp,
gold +1.7 ±0.8 pp, special build +4.4 ±1.3 pp, and charts/splits 0.0 ±1.0 pp.
Those numbers answer a conditional question: what happens after this move when the bot
plays the rest of the game? They do not estimate the value of the person's whole strategy.

Important limits in [record-disagree.ts](record-disagree.ts):
- Moves from the same game are related; 354 disagreements are not 354 independent games.
- Many moves and categories were inspected. The largest selected differences are biased
  upward without fresh confirmation or adjustment for multiple comparisons.
- Trade offers and answers are excluded. This tool cannot validate a new trading policy.
- The continuations start from reconstructed recorded state; they do not resample hidden
  state as `search.ts` does. The acting brain still receives a view, but the result is
  conditional on the recorded hidden situation, not solely on what the human knew.
- Giving the person's first move to the existing bot can lose the intended follow-up plan.
- The original engine revision is required for reliable replay. Migrating an extracted
  position does not make a whole old game reproducible on new rules.

The whole-game study reports income diverging during turns 15–45. In TIGER28, the person's
income grew 33 → 76 and the best bot's remained 36 → 36. It also reports five of 37 later
human settlements with a similarly close bot, and four settlements on turns involving
bot trades. These are concrete cases worth diagnosing. They do not show that charting,
blocking, or refusing those trades would have caused more bot wins. The analysis was
described as scratch scripts rather than a reproducible study command, and selected wins
can overstate how generally the pattern occurs.

## Status of the proposed directions

| Direction                                    | Strongest available basis                                                                                                                 | Decision (2026-11-16)                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Accurate income and lodestone target scoring | C1/C2 fixed 2026-11-16 and measured: +0.5 ±1.0 pp on live Cartographers boards, +1.4 ±0.7 pp at 5–6 players, exactly 0 off Cartographers. | Kept as a correctness fix. No demonstrated win gain; no confirmation run is justified at this effect size. |
| Sustained economic plans                     | Human income trajectories; current fixed priorities; adverse evidence for the old plan scorer.                                            | Research hypothesis. No broad planner rewrite justified.                                                   |
| Opponent-aware trade valuation               | Confirmed card-count proxy and selected human trade examples.                                                                             | Measure eligible opportunities and consequences first. No demonstrated improvement yet.                    |
| Contesting and blocking                      | Geometric race model and selected settlement examples.                                                                                    | Measure actual affordable races first. Proximity alone is insufficient.                                    |
| More search or network training              | Earlier full-control networks regressed; original search gate failed.                                                                     | Park expensive runs. A new teacher must first demonstrate material wins.                                   |

Statistical strength and practical value are separate requirements: a very small effect can
be statistically detectable without justifying major work. That distinction motivates the
explicit minimum effects in the plan. [ASA statement](https://www.amstat.org/asa/files/pdfs/P-ValueStatement.pdf)
