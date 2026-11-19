# Robber blocks one number: bot check

**Question.** Cartographers rule change (2026-11-19): the robber blocks only a charted tile's most
likely number (a robbed 6-5-4 still pays on 5 and 4). Advanced scored a robbed tile by all of its
numbers, so a 6-5-4 tile looked about 2.4× as good to rob as a plain 6, enough to outweigh its
leader weighting (`threat`, about 2.3× between a leader near the goal and a player halfway). The
owner reported bots robbing a trailing human's charted tile. Does counting only the blocked number
(`blockedPips`, `paidPips` in `bots/analysis.ts`) keep Advanced at least as strong?

**Sources.** Branch `robber-top-number`. Both sides play the new rule; only the bot differs.
- `compare --a shipped --b ref:advanced --ref main --games 1200 --cartographers`: live
  Cartographers boards, 1,200 seeds, 4,528 games each.
- `eval --games 2000`: shipped vs Intermediate on every map, size and setting.

**Results (checked).**
- Wins A − B: **+1.12 ±0.52 pp** (54.5% vs fair 26.5%). By size: 2p −0.31, 3p +0.96, 4p +1.33,
  5p +1.53, 6p +2.16. Robber moves per game 5.86 vs 5.65; splits 1.60 vs 2.67 (a robbed tile is no
  longer skipped as a split target, and income counts its unblocked numbers).
- Vs Intermediate: 57.1% ±1.1% (fair 29.7%, ×1.92), the same as the last shipping test.
- Off Cartographers maps the bot is unchanged by construction: with one number per tile the new
  helpers give the old values.

**Inferred, not checked.** Fewer robberies on trailing players' charted tiles; not measured per victim.

**Conclusion and verdict.** Keep: the change matches the engine and doesn't hurt (about 2 SE better).
A larger leader-only weighting would be a separate tuning question.

**Reproduce.** The two commands above, on `robber-top-number` (or main after merge, with `--ref` the
commit before it).
