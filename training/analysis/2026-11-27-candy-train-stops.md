# Counting candy train stops (Christmas Candy)

**Question.** Advanced ignored candy trains when placing and building: a stop gives a card of
choice (a city two) each time the train's number is rolled, much like a gold field. Does counting
stops as gold pips make it stronger in candy games, and at what weight?

**Change.** `addTrains` in `shared/bots/advanced/geometry.ts`: each stop adds the train number's
pips × `trainSpot` × (1 at the start station down to 0.7 at the end of the line) to `geo.gold`,
and to a new `geo.train`. Building plans (`cornerYield`) and own production (`productionOf`) add
`geo.train` as choice. Only in rooms with `christmasCandy`, so other games play exactly as before.

**Sources.** `select`, 600 rotated seeds from 8,200,000 (2,223 games per arm), settings
`{"christmasCandy":true,"candyTrains":true}`, field Intermediate (which also ignores trains),
baseline the same bot with `trainSpot=0`. Commit on branch `bot-candy-train`.

| trainSpot   | Hero win share (fair 27.0%) | Paired vs 0     |
| ----------- | --------------------------- | --------------- |
| 0 (ignored) | 48.6% ±1.1% (×1.80)         | –               |
| 0.6         | 72.3% ±0.9% (×2.68)         | +21.89 ±1.44 pp |
| 0.85        | 76.9% ±0.9% (×2.85)         | +26.78 ±1.43 pp |
| 1.1         | 77.3% ±0.9% (×2.86)         | +27.42 ±1.44 pp |

Per seat per game at 0.85 vs 0: candy cards taken 7.20 vs 2.76, settlements 3.78 vs 3.26, cities
2.83 vs 2.32, development cards 3.61 vs 4.43. CPU per game 647 ms vs 722 ms (no extra search).

**Checked vs inferred.** Checked: the gain against a train-blind Intermediate field. Inferred, not
measured: the gain against people, who see the train and may race for its stops; the bot's race
model already judges contested corners, but stops are now worth more to it than to the field.

**Conclusion.** Keep at 0.85; 0.85 and 1.1 are equal within noise, 0.6 is clearly lower. Would
change if games against people show the bot overpaying for stops (losing races or starving a
resource it lacks), or if a train-aware field shrinks the gain.

**Verdict.** Shipped.

**Reproduce.**

    node training/run.mjs select --candidates 'knobs:trainSpot=0.6,shipped,knobs:trainSpot=1.1' \
      --baseline 'knobs:trainSpot=0' --games 600 --seed 8200000 \
      --settings '{"christmasCandy":true,"candyTrains":true}' --report
