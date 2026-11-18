# 2026-11-17 (5:45 am): Honest strategy headroom, and why the selector can't learn it yet

**Question.** With the dice leak fixed, how much does choosing strategies from the position gain
against r1, and can a cheap selector reproduce it?

**Result (measured).** Probe v3: +6.7 ±3.2 pp vs r1 at 3 players (60 seeds, same seeds as v2's
+13.3, so the leak was worth about half). Selector networks on its 1,747 choices: none beat
predicting the average advantage.

**Where the gain may come from (reasoning, partly checked).** Fixed leans for a whole game:
cards +1.5 ±1.3, cities +0.9 ±1.3 (vs r1). The probe chose cards 30% and cities 22% of the
time, so perhaps +1 to +2 pp is "lean toward cards and cities more often". The rest (about +5) comes
from position-specific lookahead. The labels (each strategy's paired win-share difference over 24
rollouts) have sd 8–10 pp around means of −3 to +2, about what rollout noise alone gives, so a
selector seeing only seat summaries (production, hand, points, pieces) has almost nothing to fit.

**Good.** A real, leak-free gain of the size the plan calls "worth having" (+5 to +10), against
the stronger r1.

**Bad / doubts.** ±3.2 on 60 seeds: the interval runs from about +0.5 to +13. 3 players only. At
250 s of CPU per game, it can't run live on the free Workers plan (about 10 ms per request).

**Ideas (next).**
1. Cheaper teacher: stopped rollouts scored by a value network (`--rounds 6 --scorer w1`).
   Validate on the same seeds: if the gain and choices hold, collect 10× the choices.
2. Better selector inputs: the planner's own goal numbers (best payoff per goal kind, rounds to
   afford, rival odds on our targets, deck counts), which say directly when a lean pays.
3. Cheaper labels: more rollouts only at choices where strategies disagree in the first 8.
4. Live search with more compute is an option only with the owner's permission (it would need
   seconds of CPU per choice, a paid Workers plan or work spread across many requests).
5. A quick check that the gain isn't just the cards/cities lean: a seat that always leans cards
   in the mid game (no rollouts).

**Verdict.** Keep the probe as the teacher; don't ship a selector until one beats the average on
held-out choices and wins in games.

_Update 06:10: idea 1 tried. Stopping rollouts after 6 rounds and scoring with w1 lost the whole
gain (−1.1 ±3.3 pp on v3's seeds; RUNS.md). Not a verdict on stopped rollouts: w1 (old inputs,
trained on s2's play, never judged on this task) is the weak part. A value network for this job
should be judged by how well stopped rollouts reproduce full ones on recorded choices; that is
now Phase 3's first target. The `--rounds/--scorer` options stay as the harness for it._
