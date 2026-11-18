# 2026-11-17 (late afternoon): Scorer benchmark: the teacher is mostly noise, and w1 matches it

**Question (PLAN Phase 3 step 2).** How well does a stopped rollout, scored by a value network or
by points, choose the same strategy as full rollouts? This is the target a new network must hit.
The stopped probe (w1 at 6 rounds) lost the probe's whole gain (−1.1 ±3.3 vs +6.7 ±3.2 pp per game).

**Design.** `bench-positions` saves 400 choice points (as whole states) from r1 self-play: 100 games
on the probe's seeds (7100000, 3 players), setup and every 3rd own turn, 4 per game. `scorer-bench`
plays every fitting strategy to the end 48 times per position on the probe's resampling and dice,
snapshotting each rollout at 2, 4, 6 and 10 rounds; at each snapshot w1, w1td, w1lin and a points
softmax (β fitted) give our chance. One run thus judges every method on the same trajectories.
Rollouts are split into halves of 24 (the probe's count): a method picks on one half and is
judged by full rollouts on the other, so the reference's own noise is in the ceiling, not charged
to the scorer. Positions are r1 self-play, not the probe seat's own games (inferred to be similar:
same seeds, maps and choice schedule).

**Results (measured, `training/data/bench-1.json`; 27.6 min, 50 CPU-s per position).**

| Method         | Gain per choice (pp) | Agree with full | Pair corr. | Cost of a full rollout |
| -------------- | -------------------- | --------------- | ---------- | ---------------------- |
| full (24)      | +0.9 ±0.4            | 37.8%           | 1          | 100%                   |
| w1 @ 2 rounds  | +0.6 ±0.4            | 27.9%           | 0.10       | 30%                    |
| w1 @ 4         | +0.9 ±0.4            | 28.9%           | 0.21       | 48%                    |
| w1 @ 6         | +1.0 ±0.5            | 32.9%           | 0.33       | 61%                    |
| w1 @ 10        | +1.0 ±0.4            | 34.3%           | 0.52       | 78%                    |
| points @ 4 / 6 | +0.2 ±0.4            | 29.4–29.6%      | 0.17–0.28  | 48–61%                 |

(Gain: full-rollout win share of the method's pick minus `current`'s, on the other half. Pair:
per sample, correlation of the method's strategy−current difference with the final results'.)
w1td is within noise of w1; w1lin and points are a little worse.
1. **The teacher is mostly noise.** The true spread of strategy advantages (covariance between
   halves) is about 3.5 pp; one half's spread is 9.2 pp, so 24 rollouts' noise is about 8.5 pp. Full
   rollouts pick the same strategy on both halves only 38% of the time; the advantage correlation
   between halves is 0.15. That matches the earlier finding that the probe's labels can't be
   learned (sd 8–10 pp, [headroom entry](2026-11-17-strategy-headroom.md)): they are about 85% noise.
2. **w1 stopped at 4–10 rounds is as good as full rollouts at the same count**: the gains are
   equal within ±0.4. A stopped value is less noisy than a 0/1 result, which makes up for what the
   scorer misses. Points alone are clearly worse; a network is needed.
3. **w1 is biased toward cards**: it picks `cards` 31–34% of the time, full rollouts 21%, and
   `current` 24–28% vs 41%. The stopped probe picked cards 36% and current 24%. That's the same
   bias, so it's real. Inferred cause: at the cutoff, development cards bought but not yet paid off
   still show up in w1's inputs (developments, knights, army), so it credits them early.
4. **Per choice the headroom is about 1 pp**, highest mid-game (+1.3 ±0.7) and lowest early
   (+0.5 ±0.8); setup has too few positions (19) to say.

**What it means (reasoning).**
- The probe's +6.7 per game must come from about 10 choices per seat adding up, which is plausible
  at ~1 pp each. The two probe results differ by 7.8 pp with a combined error of about 4.6, so they
  are only 1.7 errors apart. The stopped probe's failure may be partly bad luck, partly the cards
  bias adding up over a game (a single-choice benchmark can't see that), or partly the probe's
  switching margin. This benchmark can't tell which.
- More rollouts matter more than a sharper scorer. If gain grows with the square root of the
  reliability (signal² / (signal² + noise²)), 96 rollouts instead of 24 would take reliability from
  0.15 to about 0.40, about +1.5 pp per choice. Stopped rollouts at 4 rounds cost about half, so the
  cheap teacher should be judged at equal CPU, not equal rollouts.
- The gain column can't separate scorers closer than about 0.5 pp (it is limited by the
  reference's noise). Judge new networks mainly by **pair correlation at 4–6 rounds** (w1: 0.21,
  0.33), by **Brier score** at the cutoff, and by **pick shares close to full rollouts'** (no cards
  bias), with gain as the check that nothing broke.

**Good.** Cheap to rerun on any checkpoint (one command, ~30 min). It separates the reference's
noise from the scorer's error, and it found the cards bias. Positions are saved as states, so a
network with new inputs can be judged on exactly these positions.

**Bad / limits.** The positions are r1 self-play, not the probe seat's own games. Picks have no
switching margin. Only 3 players. With 19 setup positions, setup can't be judged. The real target
is the expected result, which this can only estimate.

**Next.**
1. Measure at equal CPU: stopped w1@4 with 2× rollouts vs full. Split into thirds (pick on two
   thirds, judge on one) or collect 96 rollouts on fewer positions.
2. Phase 3 step 3 (refit) aims at pair correlation and the cards bias. Inputs should tell a card
   held from a card played. Train on stopped-rollout snapshots labelled with final results, which
   this harness makes cheaply: the snapshots are the training data.
3. Before a big Phase 2 collection, rerun the strategy probe with stopped w1@4 at 48 rollouts on
   v3's seeds (about the same CPU as v3). If it keeps most of +6.7, the cheap teacher is ready.

**Verdict.** Keep the benchmark as Phase 3's yardstick, judged by pair, Brier and pick shares.
w1 is not the weak link at one choice, but its cards bias is a lead for why the stopped probe
failed.

**Reproduce.** `node training/run.mjs bench-positions --games 100 --per-game 4` then
`node training/run.mjs scorer-bench --rollouts 48 --scorers w1,w1td,w1lin --out training/data/bench-1.json`;
`scorer-bench --results training/data/bench-1.json --scorers w1,w1td,w1lin` reprints it.

_Note (2026-11-17, later): the "Next" items 1 and part of "What it means" are updated by the
[offline analysis](2026-11-17-bench-offline.md). At equal CPU, stopped w1 ties full rollouts, and
adding per-choice gains over `current` across a game overcounts lasting leans._
