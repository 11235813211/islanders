# 2026-11-18: Forecast, Longest Road and placement: what worked and why

**Question (owner).** Can a playout-free forecast of the game improve build choices and placement, and
can Longest Road be judged the way a person judges it (game length, road engine, harbors, rivals,
blocking)? When something stalls, why?

**Sources.** [RUNS.md](../RUNS.md) entries dated 2026-11-18. Code: `shared/bots/advanced/forecast.ts`,
`plan-forecast.ts`, `setup-forecast.ts`, `road-race.ts`; `training/override-study.ts`,
`road-diagnosis.ts`, `forecast-check.ts`, `turn-end-audit.ts`, `move-cost.ts`. Everything is
bot-vs-bot and off by default; shipped play stayed identical to the previous commit (paired check 0.00).
`±` is one standard error. Pilot cuts were read freely, so single cells are leads, not findings.

## Results

| Idea (against the shipped bot)            | Best evidence                                                        | Reading                                       |
| ----------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Placement forecast, weight 0.25           | Fresh seeds: +1.57 ±0.63, +0.93 ±0.84, +0.08 ±0.63, +0.87 ±0.54 pp   | About **+0.9 ±0.3**, versions differ slightly |
| Same, when every opponent also forecasts  | +2.69 ±0.81 (weight 0.5: +2.82 ±1.17)                                | Not an artifact of naive opponents            |
| Spare-card roads plus the close-race goal | +0.71 ±0.55; road held 0.34 vs 0.26                                  | Holds the road more; win gain unproven        |
| Trade down when over the discard limit    | +0.14 ±0.69; discards 1.50 vs 1.91 a game                            | Fewer discards; win gain unproven             |
| Forecast choosing builds                  | −0.11 ±0.75                                                          | No gain yet                                   |
| Placement + roads + trades, one fresh set | +2.32 ±0.86; base +2.75, Channel +3.17, Fog −1.37, 5–6 players +1.91 | Promising, but too slow                       |
| Roads + trades, no placement forecast     | +0.73 ±0.77; base −1.75 ±1.11                                        | Not ready                                     |

The combined figure is probably high: its parts measured separately add to less, and it is one seed set.

## Why things stalled, and what fixed them (checked with data)

**Longest Road, first version: held the road more, won less (−2.31 ±1.15 at full weight).** `road-diagnosis`
compared its promises with games. It promised reaching the target length 85–93% of the time and got
there 35–46%, because it assumed all income went to roads. It credited 3% for holding the award without
trying, while the shipped bot held it 48% of the time in those same confident positions. So it overstated what
committing adds. Fix: value only the added chance, at a realistic income share. As the owner expected, a
weak road engine then usually doesn't try: road first on 2–3% of turns, down from 9%.

**Road race, second problem.** The decision study showed spare-card roads helped where replacing a road
being built hurt (−3.0 ±1.5), and early road moves hurt. Roads became spare-card spending after the early game.
That version dropped the old "take it when close" goal and held the road _less_ (0.22 vs 0.26), which fresh seeds
exposed. Restoring it gave 0.34.

**Forecast: predicts well, chooses badly at first.** As a predictor it beat an even guess and the current
networks at every stage (Brier at spread 5: after setup 0.187 vs 0.193 even, late 0.183 vs 0.227). Choosing moves
it lost 2.4 ±1.1. A 1/20-card nudge moved it 0.17 pp against 4.41 pp between top plans, so this was not chaos
but systematic error. The decision study found the errors: it ignored the robber (choosing a different city in the
mid game: −10.0 ±3.1), and it treated waiting as free, passing up affordable builds. Accuracy across positions does
not imply accuracy about differences between moves.

**A theory that failed.** "Ending the turn with usable cards is a general leak" was not supported: bank trade +0.1 ±0.7,
road −0.9 ±1.3. Only holding more than the discard limit showed a gain (trade +2.5 ±1.3).

## Checked vs inferred

- **Checked:** every number above; the engine's starting-card rule; forecast speedup left results identical.
- **Inferred:** that placement gains come from pace and contested expansion (the forecast combines them, and no
  ablation separates them). That results transfer to people: untested, and the forecast assumes rivals like our planner.
- **Limits:** the decision studies credit one move with shipped play afterward, so they undervalue plans.

## CPU

`move-cost`, worst decision at 6 players: shipped 10.8 ms; placement forecast 27.5 ms (median 9.4 ms against 1.2).
Build turns with the road race: median 1.35 ms against 0.37, worst 9.7. Looking fewer road pieces ahead and
caching distances did not reduce placement cost; the profile points at the forecast's repeated affordability
checks. Placement can't ship on the free plan's roughly 10 ms budget without the owner's decision or more speed.

## Good, bad, verdict

**Good.** Playing out only the moves where two versions disagree found causes that win rates couldn't. A shared
baseline and small pilots cut wasted games. **Bad.** Gains are small next to the goal of beating strong people, and
none is tested against people. **Verdict.** Keep the placement forecast and rework it for speed. Keep spare roads and
over-limit trades as options, unshipped. Rework the forecast for build choices: it needs parallel spending while
saving, card risk from 7s, and uncertainty about rivals before it can judge waiting.

**What would change this.** A base-island or protected-map loss on larger samples; a placement gain that disappears
against people; a faster forecast that keeps the gain.

**Reproduce.** `road-diagnosis --weight 1 --games 200`; `forecast-check --games 120`; `override-study --games 120
--variants 'forecast:forecastPlan=1,road:roadRace=1,setup:setupForecast=0.5'`; `turn-end-audit --games 100`;
`select --baseline shipped --field shipped --games 600 --seed 9100000 --candidates 'knobs:setupForecast=0.25'`;
`move-cost --players 6 --knobs '{"setupForecast":0.25}'`.
