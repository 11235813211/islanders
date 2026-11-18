# Bot training analysis

Start here to find what we currently believe and why. Each analysis is one short file in
[analysis/](analysis/); this page holds the current conclusions and the index.

## Where things go

| Put this                             | Here                                         |
| ------------------------------------ | -------------------------------------------- |
| What we believe now                  | "Current conclusions" below                  |
| Why: one question, its evidence      | A new file in `analysis/`                    |
| A batch of games: why, ETA, result   | [RUNS.md](RUNS.md)                           |
| One line per result, with a link     | [README results log](README.md#results-log)  |
| What we do next                      | [PLAN.md](PLAN.md), linking here for reasons |
| How the bot decides today            | [ADVANCED.md](ADVANCED.md)                   |
| How to compare bots and claim a gain | [STATISTICS.md](STATISTICS.md)               |

Full numbers live in one place, the analysis file. Other documents give the headline and link to it.

## The standard

**Every analysis gets written down, including one done just to answer a question** and including
"nothing found". Before reporting it:
1. Add `analysis/YYYY-MM-DD-short-topic.md`, one question per file, ideally under about 150 lines.
2. Add a row to the index, and update "Current conclusions" if what we believe changed.
3. Put any code it needs in `training/` or `tests/`, so one command reruns it.

An entry states:
- **Question** and why it matters. **Sources:** runs, files and commits, with `±` and sample sizes.
- **Checked vs inferred.** Never present a hypothesis as a finding.
- **Conclusion, and what would change it.**
- **Good, bad, verdict** (keep, rework or scrap). If a well-founded idea fails, say what in the
  design could explain it before dropping the idea. New designs also list pros and cons.
- **Reproduce:** the command.

Entries are a record: don't rewrite old ones. If a later result changes one, add a dated note at
its end and update the conclusions below.

## Current conclusions

Updated 2026-11-18. All bot-vs-bot unless it says otherwise.

| Conclusion                                                                                                  | Status                   | Evidence                                                          |
| ----------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| Placement forecast (weight 0.25) gains about +0.9 ±0.3 pp, also against forecasting opponents               | Likely, too slow to ship | [forecast](analysis/2026-11-18-forecast-roads-placement.md)       |
| The forecast predicts winners well but can't yet judge waiting or choose builds                             | Measured                 | [forecast](analysis/2026-11-18-forecast-roads-placement.md)       |
| Value Longest Road by what committing adds; spare roads hold it more, win gain unproven                     | Measured                 | [forecast](analysis/2026-11-18-forecast-roads-placement.md)       |
| Earlier road/forecast grids repeated baselines; the later narrowed-candidate batch uses one shared baseline | Verified in batch code   | [efficiency audit](analysis/2026-11-18-experiment-efficiency.md)  |
| Narrowed candidates show no clear win gain; setupForecast 0.25 is a weak lead                               | Exploratory              | [narrowed candidates](analysis/2026-11-18-narrowed-candidates.md) |
| r1 beats s2 by about +2 to +3.5 pp, mostly from valuing what a settlement opens                             | Established              | [planner](analysis/2026-11-17-plan-based-planner.md)              |
| Knob tuning and sharper static goal values have stopped paying                                              | Likely                   | [goal valuation](analysis/2026-11-17-goal-valuation.md)           |
| Choosing strategies by full rollouts gains about +6.7 ±3.2 pp at 3 players                                  | Needs replication        | [headroom](analysis/2026-11-17-strategy-headroom.md)              |
| Rollout labels at 24 per strategy are mostly noise                                                          | Established              | [benchmark](analysis/2026-11-17-scorer-benchmark.md)              |
| Stopped w1 rollouts equal full rollouts at equal CPU, per choice                                            | Established at 3 players | [offline](analysis/2026-11-17-bench-offline.md)                   |
| Why the stopped-rollout probe lost its gain                                                                 | Open                     | [offline](analysis/2026-11-17-bench-offline.md)                   |
| A selector can learn position-specific strategy choice                                                      | Not shown                | [offline](analysis/2026-11-17-bench-offline.md)                   |
| People take and keep Longest Road from the bot at 2 players (4 games, s2)                                   | Observed, small sample   | [awards](analysis/2026-11-17-awards-vs-people.md)                 |
| Any rollout result from before the dice fix                                                                 | Invalid                  | [dice leak](analysis/2026-11-17-rollout-dice-leak.md)             |

## Index

Newest first.

| Date            | Question                                                                                                      | Answer in one line                                             | Verdict                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| 11-18 night     | [Can a forecast improve placement, builds and Longest Road?](analysis/2026-11-18-forecast-roads-placement.md) | Placement yes, modestly; builds not yet; roads held more       | Keep placement, make it faster  |
| 11-18 01:48     | [What did the narrowed candidates establish?](analysis/2026-11-18-narrowed-candidates.md)                     | No clear gain; light setup forecast leads, road holds fall     | Confirm setup lead, rework road |
| 11-18           | [Are the current experiments worth their cost?](analysis/2026-11-18-experiment-efficiency.md)                 | Useful pilots; reuse baselines and target the original problem | Keep evidence, rework batches   |
| 11-17 evening   | [What does the saved benchmark say about the plan?](analysis/2026-11-17-bench-offline.md)                     | Stopped w1 ties full at equal CPU; reorder the plan            | Keep benchmark, rework order    |
| 11-17 afternoon | [How good is a stopped-rollout scorer?](analysis/2026-11-17-scorer-benchmark.md)                              | Teacher is mostly noise; w1 matches it per choice              | Keep as yardstick               |
| 11-17 afternoon | [Do people beat the bot to the awards?](analysis/2026-11-17-awards-vs-people.md)                              | Longest Road yes, Largest Army no, in 4 games                  | Fix the road goal               |
| 11-17 afternoon | [Does need-based goal valuation beat r1?](analysis/2026-11-17-goal-valuation.md)                              | Same strength at twice the CPU                                 | Not shipped                     |
| 11-17 05:45     | [How much strategy headroom is real?](analysis/2026-11-17-strategy-headroom.md)                               | +6.7 ±3.2 pp; selector can't learn it yet                      | Keep probe as teacher           |
| 11-17 04:30     | [Why did noisy choices give large gains?](analysis/2026-11-17-rollout-dice-leak.md)                           | Rollouts knew the upcoming dice                                | Fixed; rerun earlier probes     |
| 11-17 03:00     | [Does choosing strategies beat fixed ones?](analysis/2026-11-17-strategy-probe-pilot.md)                      | +8.5 pp, later invalidated by the dice leak                    | Invalid                         |
| 11-17 night     | [Can the plan-based planner be fixed?](analysis/2026-11-17-plan-based-planner.md)                             | Yes, shipped as r1                                             | Keep                            |
| 11-17 night     | [Do presets and the rival model work?](analysis/2026-11-17-strategy-presets-rival-model.md)                   | Presets lose; rival model is accurate on bots                  | Keep rival model                |
| 11-17           | [Why couldn't earlier experiments find large gains?](analysis/2026-11-17-why-no-large-gains.md)               | They only measured one step from the current bot               | Led to the current plan         |
