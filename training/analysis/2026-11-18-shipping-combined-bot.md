# Should the combined bot ship?

**Question.** Does `setupForecast` 0.25 + `roadRace` 1 + `overLimitTrade` 1 beat the live bot on fresh
seeds, without hurting the protected games, at a cost the free plan can carry?

**Sources.** `select` against the then-shipped `r1`, with `r1` as every opponent, rotated seats, paired
seeds, 2026-11-18 11:37–12:20. Seeds 9700000–9820000 had not been used before. `±` is the paired
standard error. Commits `e618e9e` (speed and split) onward.

## Result

| Game                          | Seeds | Combined           | Placement forecast alone |
| ----------------------------- | ----- | ------------------ | ------------------------ |
| **All maps**                  | 1,200 | **+1.26 ±0.60**    | +0.60 ±0.37              |
| Base island, 2 players        | 600   | −1.59 ±1.04 pooled | −0.50 ±1.12 (first 200)  |
| Base island, 3 players        | 200   | +4.17 ±1.62        | +2.67 ±0.93              |
| Base island, 4 players        | 300   | +1.83 ±0.96        | −0.08 ±0.57              |
| Base island, 5 players        | 200   | +2.50 ±1.01        | −1.10 ±0.67              |
| Base island, 6 players        | 200   | +0.50 ±0.86        | −0.17 ±0.50              |
| The Channel                   | 200   | −0.47 ±1.21        | −0.58 ±0.63              |
| Middle Fog                    | 200   | +1.08 ±1.29        | +0.72 ±0.78              |
| Magnetic North                | 200   | +0.80 ±1.42        | +0.33 ±0.84              |
| Jumbotan, 2 players           | 600   | −1.00 ±1.09 pooled | −0.75 ±1.20 (first 200)  |
| Mixed 5–6 players (not gated) | 200   | +3.87 ±1.00        | +0.63 ±0.66              |

No game went unfinished. Against Intermediate on every map and size (2,000 games) the shipped bot now
wins 57.0% against a fair 29.7% (×1.92).

The two 2-player boards measured worse than −1 pp on 200 seeds (−2.00 ±1.66 and −3.00 ±1.96), so each got
400 more (−1.38 ±1.32 and 0.00 ±1.30). Pooled values weight by seeds and treat the two sets as independent.

**What caused the 2-player dip** (400 follow-up seeds, base island then Jumbotan):

| Version                         | Base, 2 players | Jumbotan, 2 players |
| ------------------------------- | --------------- | ------------------- |
| Road race alone                 | +0.50 ±1.17     | +0.75 ±0.53         |
| Placement + over-limit, no road | −1.25 ±1.27     | −1.38 ±1.34         |
| All three                       | −1.38 ±1.32     | 0.00 ±1.30          |

## CPU

Every speedup kept the same actions: a fingerprint of all bot actions matched over 60 mixed games, 25
six-player games, and the combined and build-forecast settings.

| 6-player placement, one process | Before  | After, whole | After, in pieces (worst piece) |
| ------------------------------- | ------- | ------------ | ------------------------------ |
| Median                          | 8.7 ms  | 4.1 ms       | 0.9–1.7 ms                     |
| Worst                           | 27.2 ms | 19.2 ms      | 10.0 ms (the draft step)       |
- In fresh processes, where code hasn't warmed up, the first piece took up to 11.9 ms, about what the old
  draft cost (worst 11.45 ms). Forecast pieces took up to 6.8 ms.
- Build moves at 6 players: median about 1.0–1.4 ms, p99 about 4–5 ms (was 0.34 and 1.75). The worst varied
  from 7 to 19 ms between identical runs, and one run beside other work hit 87 ms, so it is machine noise
  and garbage collection more than the move.
- On a local Worker, a forecast placement ran as three thinking alarms and then the move.

**Not measured:** CPU on Cloudflare itself. Cloudflare's docs count CPU per invocation, alarms included, but
don't state the free-plan figure for Durable Objects.

## Checked vs inferred

- **Checked:** the win differences above, identical actions, the alarm sequence on a local Worker.
- **Inferred:** the 2-player dip comes from placement or over-limit trades, not the road race. The
  differences are within noise, and two components weren't separated.
- **Unknown:** the effect against people. Every number here is bot against bot.

## Bug found

Magnetic North at 6 players crashed: a seat with 24 wood owed 21 cards, but actions capped each resource at
19, so no legal discard could be sent. The 5–6 player bank has 24 of each. The cap is now 99, with a test.

## Conclusion

**Ship.** The gain is 2.1 standard errors above zero, just past the bar, and every protected game is above
−2 pp. The true gain is probably near +1 pp, below last night's +2.32 from the seed set that picked this
combination. Good: real gain on fresh seeds, large at 3 and 5 players, fits the budget in pieces. Bad: thin
margin, and both 2-player boards lean negative. **What would change it:** games against people going worse, or
a larger run putting a protected game below −2 pp. Next: separate placement from over-limit trades at 2 players.

**Reproduce:** `node training/run.mjs select --baseline <old bot> --field <old bot> --games 1200 --seed 9700000
--candidates <new bot>`, adding `--maps` and `--players` for each game. `shipped` now means the new bot, so use
`ref:<commit before the merge>` style seats or `knobs:setupForecast=0;roadRace=0;overLimitTrade=0` for the old
one. `move-cost --players 6 --split true` gives the CPU table.
