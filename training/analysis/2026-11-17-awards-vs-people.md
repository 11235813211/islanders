# 2026-11-17 (late afternoon): Longest Road and Largest Army against people, diagnosed

**Question (owner).** People keep Longest Road and Largest Army away from the bot with little
effort, especially at 2 players and on Jumbotan. Is that true in the data, which award, and why?

**Sources.** Saved games 22–28 in `training/data/records.json` (fetched 2026-11-17), replayed on
their engines (22–23 on 4bcded4, 24–28 on a25a052) with `dump-records.ts`, read with
`records-awards`. Games 24, 26, 27, 28 are the only finished 2-player games: all four are Jumbotan
(18 points), one person against the s2 Advanced bot (before r1 shipped). Bot games: `eval` with the new
`award:` counts (RUNS.md, "Award counts"). Planner code: `plans.ts` `makePlans` (road goal) and
`cardPayoff` (army), `turn.ts` `longestRoadMove`.

**What the four 2-player Jumbotan games show (checked, per-turn rows).**

| Game | Winner | Longest Road                                                       | Largest Army                    | Final road (bot / person) |
| ---- | ------ | ------------------------------------------------------------------ | ------------------------------- | ------------------------- |
| 24   | person | person from turn 41 (7 vs 2) to the end                            | person from turn 57             | 5 / 10                    |
| 26   | bot    | bot turns 34–52, person from 53 (8 vs 6) to the end                | bot from turn 70                | 8 / 11                    |
| 27   | person | person from turn 42 (5 vs 2) to the end                            | swapped 3 times; bot at the end | 5 / 7                     |
| 28   | person | person from turn 45 (6 vs 4) to the end; bot within 2 for 29 turns | bot from turn 50                | 4 / 8                     |
- **Longest Road: confirmed, and it is the main one.** The person took it in all four games and
  kept it to the end in all four; the bot never took it back. Person held it 139 of 316 turn
  starts, the bot 19. In game 27 the bot led 16 to 15 in public points at the last turn start and lost: the person won
  with 19, 2 of them the road's.
- **Largest Army: not confirmed in this sample.** The bot held it at the end in 3 of 4 (in 27 it took
  it back at turn 85). The person held it in game 24 only. Four games is little evidence either way.
- At 3–5 players (games 22, 23, 25) bots held the road as often as the person; small sample.

**Bot games don't show it (measured, RUNS.md).** r1 holds Longest Road at the end as often as any
bot opponent, including the shipped bot leaning to routes (`strategy:expand`: 2p Jumbotan 0.49 vs
0.51) and far more than Intermediate (0.70 vs 0.30). So the bot fields we test against don't race
for the awards the way the person does, and `compare` against them can't see this weakness. Awards
matter most at 2 players: in r1 self-play on all maps the winner holds the road in 72% of 2-player
games and the army in 56%; on Jumbotan 84% and 54%.

**Why (checked in code; the link to the games is inferred).** The games were played by s2, whose
fixed-order planner built a Longest Road piece right after cities and settlements whenever
`longestRoadMove` offered one. r1 (shipped now) uses the same `longestRoadMove`, so points 1, 3
and 4 hold for both; point 2 is r1's planner, so r1 may do worse or better than s2 here.
1. _The road goal only exists 1–3 roads from taking it_ (`longestRoadReach` 3 in
   `longestRoadMove`; in r1 also `gap <= min(3, pieces left)` in `makePlans`), with a floor of 5. When the person
   jumps ahead (7 vs 2 in game 24, 5 vs 2 in game 27) the bot has no goal for it at all, and
   never gets one back as the person extends.
2. _It pays a flat 1.4 points (1.2 when holding)_, whatever the table size or target. Taking the
   road from the only rival at 2 players moves the race by 4 points (our +2, their −2); at 4
   players the same 2 points taken from one of three rivals matter much less. Next to settlement
   and city goals worth 3–5 points at Jumbotan's long horizon (`goal-report --maps
   new-base-board-16 --players 2`, turn 30: routes 3.8–5.0, cities 2.2–4.2), 1.4 wins only
   when the road is cheap and nothing else is. (s2 in game 28 was within two roads for 29 turns
   and never closed: its cities and settlements came first, and no trade aimed at the road.)
3. _No defense._ When holding, the goal appears only on a tie, so the bot never builds a margin;
   a rival one road behind needs two roads to take it and nothing reacts. Same for the army: a
   card's army value is 0 while we hold it (`cardPayoff`), whatever the rival's knights.
4. _Routes get no road credit._ A road toward a settlement that also lengthens our longest road is
   valued for the settlement only, so the bot's routes branch instead of stringing out
   (inferred from final lengths: 4–8 vs the person's 7–11).
5. _Army need ignores hidden knights._ `cardPayoff` counts only rivals' played knights; their
   unplayed cards are visible as a count.

**Good / bad.** Good: the human data and the code agree on a specific, fixable cause for the road;
the bot already handles Largest Army about as well as the person in these games. Bad: 4 games
from one person; the army conclusion may change with more. The bots we test against don't
reproduce it, so a fix can't be judged by `compare` against the usual fields alone.

**Next (design, not built).** Value each award as a race, like a settlement:
- Value = the points it moves in the race to win: our 2, plus the holder's 2 weighted by how much
  that rival threatens us (1 at 2 players, about their win chance share at more), times the
  chance we keep it (from each rival's road growth: pieces left, wood/brick income, open ends).
- No fixed reach: cost is the roads needed, waiting time comes from `planScore` as for other goals.
- A defense goal when a rival is within two roads (or two knights) of taking it.
- Route goals credit the road length they add.
- A test opponent that races for awards (the same valuation with the award weight high), so
  bot-vs-bot measurement can see the weakness; then `compare` r1 vs the fix in a field of it, plus
  the shipping lane's usual checks. The real measure is the next 2-player games with people.

**Reproduce.** Dump: `dump-records.ts` header (worktrees at a25a052 and 4bcded4), then
`node training/run.mjs records-awards --only 22,23,24,25,26,27,28`. Bot games: the `eval` lines in
RUNS.md ("Award counts").
