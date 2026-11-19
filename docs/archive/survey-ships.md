# Survey ships (archived 2026-11-18)

Survey ships were a Cartographers piece. They left the game when finished charts became the way to
turn lodestone into points (see [rules](../rules.md#cartographers-house-expansion)).

## Where the code is

Git tag `archive/survey-ships` is the last commit with the working feature: engine, bots, build bar,
panel, help text, and tests. To look at it or bring it back:

```sh
git show archive/survey-ships:shared/engine/cartographers.ts
git log --all --grep="Remove survey ships"   # the commit to revert
```

The drawings stay in `src/art/v14` to `v16` (`SurveyShip`, `SurveyTarget`), because art versions are
kept as they were. The current game doesn't draw them.

## The rules they had

| Rule     | Detail                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Cost     | 3 lodestone, 1 ore. Upgraded one of your ships with no land on either side                                  |
| Supply   | 4 per player (a map could set 0 to 8)                                                                       |
| Points   | 1 each                                                                                                      |
| Charting | When fitted out, charted once each tile around your nearest settlement or city along your roads and ships   |
| Limits   | Couldn't move afterward. No two survey ships (anyone's) bordered the same tile. The pirate blocked upgrades |

## What happened to existing data

- Rooms in progress: each standing survey ship became a plain ship, and its owner kept the point as
  a bonus point (`engine/migrations.ts`, step 27 → 28).
- Saved boards that set a survey ship count still load. The count is ignored.
- Game records with survey ships replay only on the engine they were played on, like any record
  from before a rule change (see `training/README.md`).
