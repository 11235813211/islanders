# Plan for evidence based Advanced bot improvements

Updated 2026-11-16. The objective is higher win probability against strong opponents,
eventually including skilled people, while preserving cheap Worker decisions and using
only `GameView` information.

**No proposed new strategy currently has enough evidence to justify a major implementation
or training run.** The next justified work is measurement of verified decision-model gaps.
An isolated experimental candidate may be needed to measure its effect; that is not a
commitment to shipping it or expanding it into a new planner.

This revision changes documentation only. All code, test, and instrumentation work below
is proposed future work. The current bot and inactive experiments remain unchanged.

Read [how decisions work](ADVANCED.md), the [evidence review](EVIDENCE.md), and the
[statistical protocol](STATISTICS.md) before starting an experiment. The historical
search gate and its failed result are retained in the evidence review. Win-rate differences
use percentage points (pp); the historical `±` values below are reported standard errors,
not 95% confidence intervals.

## Current decisions

| Work                                                             | Decision                                                                 | Evidence required to change the decision                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Audit income and lodestone target scoring                        | Done 2026-11-16 (C1/C2 fixed; kept as correctness, not a measured gain). | Pilot +0.5 ±1.0 pp: a +2 pp confirmation would need a true effect near +5 pp. See [RUNS.md](RUNS.md).                                    |
| Activate the alternative planner                                 | Leave inactive.                                                          | A materially changed candidate must pass confirmation, replication, and protected-population gates, including Middle Fog.                |
| Activate the value network                                       | Leave inactive.                                                          | New targets/features or a demonstrably stronger teacher, followed by wins in held-out full games; training loss alone cannot qualify it. |
| Rewrite play around economic plans                               | Park.                                                                    | A narrow plan with follow-through must first demonstrate a material whole-game win advantage.                                            |
| Add broad trade or race intelligence                             | Park implementation; permit opportunity diagnosis.                       | Reproducible opportunities, a frozen isolated candidate, and confirmed gains in a relevant opponent population.                          |
| More generic tuning, larger networks, or more of the same search | Park expensive runs.                                                     | New evidence that addresses the specific previous failure, then a bounded pilot.                                                         |

## Why the inactive experiments stay inactive

### Alternative planner

`planner = 1` selects `makePlans` and `planStep`. It ranks city, settlement/route,
exploration, development, and road-award plans by estimated payoff divided by waiting time.
It recomputes each decision; it is not a persistent plan with learned follow-through.
Its plan set also omits survey/chart/split/relay investments. See
[plans.ts](../shared/bots/advanced/plans.ts) and [plan-turn.ts](../shared/bots/advanced/plan-turn.ts).

The reported comparisons were +0.7 ±1.3 pp and −0.2 ±1.4 pp against the shipped bot, plus
−10.0 ±1.6 pp on Middle Fog at three players. There is no demonstrated overall benefit,
and there is a substantial reported regression. A description of sensible goals is not
counterevidence to those results.

**Potential:** the existing goal/path representation may be useful experimental machinery.
The current policy has not earned activation. A future attempt must identify and change a
specific failure, such as inaccurate economic inputs or exploration without a profitable
follow-up, and demonstrate that the changed policy wins. Re-running unchanged code on more
seeds or retuning until a favorable map appears does not meet this requirement.

### Value network

`choose.ts` scores compact hypothetical positions after a limited set of moves. With
`valueRole = 0`, the planner decides whether to spend and the network chooses which build;
with `valueRole = 1`, the network also chooses whether to trade or stop. Neither role is
active in shipped weights. Candidate actions and summaries omit important Cartographers
choices; this is not a search over every legal action or a complete turn simulation.

Two full-control attempts produced edges of ×0.35 and ×0.20 against their reported fields
and hoarded resources. Restricting control produced −0.9 ±1.0 pp and −1.5 ±0.9 pp, with no
demonstrated positive gain. Improved validation loss did not validate action selection.

**Potential:** learning to rank moves or plans remains an untested direction under better
inputs and training targets. The recorded failures concern these networks, their data,
candidate actions, and greedy use. They do not prove that every learned policy is incapable
of strong play. A renewed trial needs a better teacher or action-level comparisons that
preserve follow-up, accurate features, and new full-game confirmation. Until then, keep
`valueNet` absent and do not promote old checkpoints. See [EVIDENCE.md](EVIDENCE.md).

## Gate zero Establish a reliable baseline

Freeze the implementation and its wrappers, defaults, weights, engine, board library,
opponent field, and scenario mixture. The reviewed baseline is code commit
`4bcded4eb2e620943043cce785a4e9575d71770c`; a future experiment must register its actual baseline
again if the project has moved. Do not treat `s2`, `shipped`, or a moving git branch as an
immutable implementation.

Verify that baseline versus itself gives an exactly zero paired difference on identical
jobs, that hero rotation covers all seats, and that winner/points/diagnostics use seat IDs.
Check unfinished games and fallbacks rather than treating successful completion as proof
that every Advanced decision was legal. Save raw seed-level results and the registration.

Use the existing `compare` command for its paired difference, not the individual `eval`
error bars. Its current limitations, including the shared outer wrapper for `ref:advanced`,
are listed in [STATISTICS.md](STATISTICS.md#current-tools-and-limits).
If an experiment needs analysis the tools cannot yet provide, its gate cannot pass from
the console summary alone.

**Advance when:** the experiment is reproducible, baseline isolation is verified, and the
chosen analysis can report the registered effect and uncertainty. Otherwise stop here.

## Gate one Verify and isolate the economic gaps

Start with C1 and C2 from [ADVANCED.md](ADVANCED.md#confirmed-gaps-and-their-evidential-limits).
They are verified mechanisms and therefore suitable for bounded diagnostic work. The
historical road-saving fix supports inspecting concrete decision errors, but supplies no
expected effect size for these particular changes.

Proposed future work:
1. Establish deterministic expectations for extra chart numbers, split choices, relay
   production under the robber, and lodestone target scoring. Reuse engine rules and
   existing fixtures; do not create a second authoritative rules implementation.
2. Diagnose each separately over a prespecified set of complete games and eligible
   positions. Count all opportunities, how often estimates differ, and how often the
   selected action differs. Record map, size, phase, and fallbacks. Include losing games.
3. Prepare the smallest isolated candidate needed to measure one discrepancy. Hold setup,
   opponent behavior, and unrelated heuristics fixed wherever possible. If shared estimates
   affect several decisions, record those paths explicitly rather than attributing the
   effect to just one of them.
4. Run a bounded exploratory pilot. Use it to select at most one finalist and estimate
   variance; it does not establish a strength gain. Set the pilot compute ceiling before
   running and preserve every tested candidate's result.

**Advance when:** the mismatch is reproducible, the candidate actually changes the intended
decisions, and a properly powered confirmation fits the registered budget. This permits
measurement, not broader implementation. If the mechanism is rare, the candidate does not
change decisions, or the required precision is unaffordable, park it and record why.

## Gate two Require a practical win advantage

For an income correction, use Cartographers games against a frozen Advanced field as the
primary population. Freeze the map/settings/size mixture. Protect base island at four
players, non-Cartographers sea games, and 5–6 player games. Keep Middle Fog as an explicit
protected population for any revival of the alternative planner.

Select one frozen finalist from the pilot. Calculate a fixed sample from pilot variance,
90% power, the registered practical effect, and the full comparison family. Use fresh
confirmation seeds, rotate seats, and analyze differences by independent seed. Follow
[STATISTICS.md](STATISTICS.md) for paired intervals, multiplicity, completion sensitivity,
and an independent replication.

**Advance to a focused improvement only when all of these pass:**
- Confirmation lower confidence bound exceeds **+2 pp** wins in the target population.
- Fresh replication has a lower bound above zero and an estimated gain of at least +2 pp.
- Protected populations' simultaneous lower bounds exceed **−2 pp**.
- The upper bound on increased unfinished games is below **+0.5 pp**, and the unfavorable
  unfinished-game sensitivity analysis does not undo the strength claim.
- Behavior tests, CPU measurements, and required project checks pass without relaxing rules,
  information limits, or human trade limits.

These margins are explicit project priorities, not estimates from historical data. If the
interval crosses a threshold, the result is inconclusive and does not authorize larger
investment. If its upper bound lies below the desired benefit, stop that direction at this
scope. A correctness-only change may have a separate rationale, but cannot be reported as
a demonstrated winning improvement.

## Gate three Investigate strategic explanations only after the inputs are understood

The human income trajectories motivate investigation. They do not establish that the
candidate strategy is good. Reproduce the whole-game study with versioned records and a
saved analysis, reconcile its 11-game and 12-game samples, include wins and losses, and
define the opportunity denominator before counting examples.

| Hypothesis                                | Diagnostic required before a policy trial                                                                                            | What a valid trial must preserve                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Economic investments need follow-through  | Identify affordable investments the bot passes up, their ownership/share, resource costs, later actions needed, and rival responses. | The candidate follows the plan through several decisions or to a declared abort/completion condition. Do not hand control back to the unchanged bot after the first move. |
| Trades enable stronger rival builds       | Count eligible offers and estimated partner builds before and after them, along with our own benefit.                                | Test the full trade interaction against relevant trading opponents; refusing all trades is a different intervention.                                                      |
| The bot loses affordable settlement races | Count legal routes, resource affordability, move order, and actual blocking opportunities for both players.                          | Compare complete contest/expand alternatives. Equal geometric distance alone is not a lost race.                                                                          |

Only a narrow, falsifiable candidate proceeds to the same pilot/confirmation process.
Do not build a suite of new opponent personalities or a general plan architecture before
the specific exploit and proposed response have demonstrated value. Existing styles share
the Advanced implementation and cannot alone validate play against people who exploit
different weaknesses.

## Gate four Require strong headroom before major training

The original search test failed its preregistered ≥45% teacher gate. It remains closed;
increasing its budget is not an automatic next step. A different search or plan executor
must be registered as a new experiment with a specific reason to overcome the earlier
candidate-set and continuation-policy limits.

For major investment, require a confirmed lower bound above **+10 pp** wins against three
frozen Advanced opponents, at four players in a declared map mixture, followed by independent
replication and protected-map checks. This is a new prospective investment threshold, not
a reinterpretation of the old 45% gate. It must demonstrate the new policy's whole-game
advantage before large-scale training data are collected.

Only then test whether a compact learned policy retains that advantage within the runtime
budget. Evaluate the deployed student independently; the teacher's win rate and the
student's imitation loss are not evidence that the student wins. Keep expensive search
offline. Human testing is a separate gate for claims about strong people, with randomized
version assignment, balanced seats, and player/session-aware uncertainty.

## First deliverables for future work

1. A frozen experiment registration and baseline/control report.
2. Reproducible diagnostic cases and opportunity counts for C1/C2.
3. At most one selected isolated candidate, with a fixed confirmation design and budget.
4. A result record marked pass, fail, or inconclusive, including adverse results and a fresh
   replication if warranted.

Until those results exist, the recommendation is to leave the current alternative planner
and value network inactive, and to treat sustained planning, richer trades, and blocking
as hypotheses rather than promised improvements.
