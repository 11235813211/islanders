# Do linked roads and settlements win more?

**Question.** Roads and settlements can serve each other. Does the bot win more if a settlement route earns
credit for lengthening its road, and a road plan for bringing an open spot closer?

**Sources.** `select` against the live bot (`shipped` at `9b756ac`, every opponent the same), 600 seeds 9900000,
all maps, rotated seats, 2026-11-18 12:52–13:32. Code on branch `bot-road-routes`. `±` is the paired standard error.
Wins are the measure; other counts only help explain them.

## Result

| Version                                                | Win-rate change |
| ------------------------------------------------------ | --------------- |
| `roadRoute` 1 (route overlap)                          | −0.06 ±0.63     |
| `roadOpens` 0.5, first design (added to payoff)        | −1.89 ±0.49     |
| `roadRoute` 1, `roadOpens` 0.5, first design           | −1.20 ±0.68     |
| The same plus `roadBlock` 1                            | −1.74 ±0.70     |
| `roadOpens` 0.5, corrected (share of the race's worth) | −0.41 ±0.36     |
| `roadOpens` 1, corrected                               | −0.55 ±0.37     |
| `roadRoute` 1, `roadOpens` 0.5, corrected              | −0.29 ±0.64     |

No game went unfinished. With every switch off, an action fingerprint over 40 games matched the live bot.

## Checked vs inferred

- **Checked:** no version won more. Plan payoffs feed `econ.goals`, which set hand value and trades, so a flat
  credit reaches every card decision even for plans ranked last. Making the credit proportional removed most of
  the loss on the same seeds.
- **Inferred:** that feed caused the first design's loss.
- **Not known:** why route overlap adds nothing. It held the road more (0.30 vs 0.26) without more settlements or wins.

The "dead routes" count is a poor measure here: it includes any road running past the last building, which
Longest Road trails often do.

## Conclusion

**Don't ship; all switches stay off.** Good: the route search is exact and cheap (6-player build moves about 1.3 ms
median, 7.4 ms worst). Bad: no win gain, and the opening credit leans negative even when corrected. Design lesson:
trace where a value flows before adding to it. **What would change it:** evidence from games against people that
the bot's roads and settlements fail to work together, or a design that only reorders choices without touching
plan payoffs.

**Reproduce:** `node training/run.mjs select --baseline shipped --field shipped --games 600 --seed 9900000
--candidates 'knobs:roadRoute=1,knobs:roadOpens=0.5'`.
