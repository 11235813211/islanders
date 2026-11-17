# Plan for the Advanced bot

Updated 2026-11-17. The goal is a bot that beats skilled people, with every move cheap enough
for the free Workers plan and using only what `GameView` shows.

Why this direction: [ANALYSIS.md](ANALYSIS.md#2026-11-17-why-earlier-experiments-couldnt-find-large-gains).
In short, every earlier experiment measured or learned from the current bot's own follow-up,
so it could only find one-step improvements. People beat the bot with strategies that pay off
over many turns. The plan below tests that gap directly and then builds on it.

## Status (2026-11-17, end of day)

- **Shipped `r1`** (committed): the plan-based planner with rival-model races and "what a
  settlement opens next": +2.4 to +3.8 pp vs `s2` on fresh seeds, vs Intermediate ×1.91.
- **Phase 1 probe:** with the dice leak fixed, choosing strategies by full rollouts gains
  +6.7 ±3.2 pp vs r1 at 3 players (~250 CPU-s per game). Strategies are goal-kind leans
  (`strategy.ts`).
- **Phase 2:** `selector.ts` and `selector-fit` exist; a selector trained on the probe's choices
  learned nothing (labels are mostly rollout noise).
- **Static valuation has plateaued:** need-based income and measured enabling (`goalModel`) played
  like r1 at twice the CPU; reverted. Knob tuning: null again. The measured headroom is lookahead.
- **Rival model on a person:** 73% top 1, 89% top 3 (37 settlements).
- Details, verdicts and weak points: [ANALYSIS.md](ANALYSIS.md).

## Next (start here)

1. **Phase 3, value network as a rollout stand-in** (below). Done when stopped rollouts scored by
   it reproduce full rollouts on the probe's positions; then the probe is cheap enough to teach
   a live selector.
2. **Longest Road and Largest Army** (owner: people keep both away from the bot, especially at
   2 players and on Jumbotan): measure first, then value the awards as races (Smaller items).

## How we work

There are two lanes with different bars.

**Exploration: encouraged.** Ideas with strong conceptual backing (game knowledge, the game-AI
literature, saved human games, an analysis here) get built and tried without first proving
they win. A first version that doesn't win is a result about that version: before dropping an
idea, write down whether it failed because of the idea or because of how it was built, and
what a better version would change. Rules for this lane:
- Experimental code sits behind a knob, a named brain or seat (`style:…`, a checkpoint), or in
  `training/`. It must not change shipped behavior until it passes the shipping lane.
- Pilots can be any size and can be changed and rerun freely; no preregistration.
- Use paired comparisons (`compare`, `--rotate`) and report effects with `±`, so results are
  readable. Keep unfinished games in the count.
- Log every batch in [RUNS.md](RUNS.md), every analysis in [ANALYSIS.md](ANALYSIS.md), and every
  result (including failures) in the [README results log](README.md#results-log).

**Shipping: careful.** Changing `weights.json` or default behavior needs:
- A paired comparison against `ref:advanced` on seeds not used to pick the candidate.
- No regression worse than −2 pp on: the base island at 4 players, The Channel
  (`new-board-4`), 5–6 players, and Middle Fog. Unfinished games not up.
- `npm run check`, `tests/bots.test.ts` CPU limits, and the human trade limits all pass.
- A claimed gain is reported with its `±` from that held-out run. Correctness fixes can ship
  without a measured gain if they don't regress.

[STATISTICS.md](STATISTICS.md) has the details for confirmation runs and claims about people.

**Size of effects.** Against three Advanced bots at 4 players (25% fair), +2 pp is small,
+5 pp is worth having, and +10 pp (35% wins) is large. Against people the gap is bigger today,
so games against people are the measure that matters most in the end.

## Phase 1: Strategy headroom probe

Question: if a seat chooses among committed multi-turn strategies, and each option is scored by
playing on _with that strategy_, how much does it beat three Advanced bots?

Build (training only):
1. **Strategies** as overrides on the Advanced brain, each with a commitment that holds for
   several turns (a target corner or island, a priority order, what trades aim for):
   - `current`: the shipped bot, as the control.
   - `expand`: settlements first, committed to a chosen target (corner or new island) until
     built or lost; roads/ships toward it before cities.
   - `cities`: ore/wheat cities and development cards; settle only toward ore/wheat.
   - `explore`: ships, fog, island bonuses (sea maps only).
   - `chart`: survey ship, charts, splits, lodestone (Cartographers maps only).
   - `award`: Longest Road or Largest Army race.
     Each strategy needs behavior checks (a unit test or a diagnostic count) showing it does what
     it says, e.g. `expand` builds more settlements and income than `current`. A strategy that
     doesn't follow through invalidates the probe.
2. **One loop: predict rivals, find the races, choose against them.** This is how a strong
   player thinks, and strategy, setup and blocking are parts of it, not separate features:
   - _Predict each rival's plan_ from what the view shows (where their routes and buildings are,
     production, public card count, pieces left, turn order), by scoring their options the same
     way we score ours. The output is odds over their likely targets, not one guess.
   - _Turn that into races_: for each open corner or island, who gets there first and how likely,
     counting pieces needed, cards needed and expected income, and how many players place or
     move in between (the snake order during setup).
   - _Choose our strategy against that prediction_: a target counts only by the chance we win it,
     plus what blocking a rival's target is worth when that is cheap. Far islands fall out of the
     same sum: trip cost (ships, turns) against payoff (island bonus, production, no competition)
     minus the chance someone gets there first. AI Trainer 1 is the test map for this.
   - The same loop runs at setup: where the starting settlements go decides which strategies are
     possible (`expand` needs wood/brick and open room, `cities` ore/wheat).
     Checks: in self-play, how often a rival's next settlement was among its predicted top 1 and
     top 3 targets; then the same on saved human games (people head for different places than
     bots, so bot-tuned predictions must be checked against them). Today races use distance only
     (C4 in [ADVANCED.md](ADVANCED.md)).
3. **Strategy presets first, then better strategies.** The first strategies are presets of the
   existing knobs (like the `style:` seats) plus a few behavior hooks, so the harness can play and
   roll them out unchanged. The rollouts give opponents' real responses, so the probe works
   before the rival model exists; the rival model is what lets a cheap live bot do the same.
4. **Fixed-strategy pass** (cheap, first): every strategy plays a whole game against three
   `current`, all maps and sizes, `--rotate`. Shows per map which strategies are already
   better, and catches broken ones.
5. **Strategy search seat**: at set points (setup and every 3rd own turn), for each
   strategy run determinized rollouts (hidden facts resampled as `search.ts` does) in which this
   seat follows that strategy to the end and the others play `current`. Pick the best; play it
   until the next choice point. Reuse `rollouts.ts` and `search.ts`.

Measure: win rate of the search seat vs three `current` at 4 players on the base island and the
live map mix; which strategy it picks when (map, turn, position); income by turn against the
person's records (TIGER28: 33 → 76 by turn 45).

Cost estimate: about 7 choice points × 6 strategies × 32 rollouts ≈ 1,300 rollouts per game,
about 4–5 CPU-minutes per game; 200 games is about 1–1.5 hours on 14 cores. Start with 50 seeds.

No strategy is expected to be best everywhere: the value is in knowing when to use which. The
fixed-strategy pass only checks the strategies work and where each is viable; the search seat
is the real test because it chooses from the position. Every choice is logged with its context
(map, size, turn, position, each strategy's rollout score) as the training data for Phase 2.

Judging the result: a small first result is expected. Before deciding whether more compute or
a restructure is needed, check (a) each strategy actually follows through (behavior counts),
(b) the search seat's choices vary sensibly with map and position, and (c) where it loses, why
(by map and game phase). More rollouts only help if the strategies are good and the choice is
noisy; if the strategies themselves are weak, fix how the bot thinks instead.

What the result means:

| Search seat vs three Advanced | Next step                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| +10 pp or more                | Strategy choice is a big gap. Go to Phase 2 and Phase 3, with this search as the teacher.                        |
| +5 to +10 pp                  | Real headroom. Improve the weakest strategies (diagnostics first) and the choice points, then rerun.             |
| Under +5 pp                   | Check each strategy follows through. If they do, strategy choice isn't the gap: write it up and turn to tactics. |

## Compute on Workers

Everything in Phase 1 runs offline. The live bot must stay within the free Workers plan (about
10 ms of CPU per request; today a move is a median 0.15 ms, worst 6.7 ms). If a stronger bot
needs more thinking time, options include spreading a decision over several requests (a bot
"thinks" across a few alarms) or doing heavier work once per turn instead of per move. **Ask the
owner before** any change that raises Worker CPU or request counts.

Measured 2026-11-17 (for that decision, not a request yet): the strategy probe's full-rollout
choice gains +6.7 ±3.2 pp vs r1 at 3 players, at about 250 s of CPU per game, roughly 30 s per
choice (about 7 choices per seat per game). That is far beyond the free plan's ~10 ms per request.
Stopping rollouts early with today's value network lost the gain. So live search is only realistic
with a much better value network (Phase 3) or a paid plan with long CPU limits; the cheaper path
is still a learned selector.

## Phase 2: Strategy layer in the shipped bot

Make strategy choice cheap enough for live play.
- **Selector**: a small classifier (features of the view → which strategy) trained on the Phase 1
  search seat's choices and their rollout scores. Start with logistic regression as the bar.
- **Commitment without memory**: brains get only a `GameView`. Either derive the commitment
  from the view with hysteresis (keep the current target unless another is clearly better), or
  add per-seat bot memory to the stored state (a new stored field with a migration, never sent
  to other seats). Try the first; add memory only if it measurably helps.
- Measure the selector bot against `ref:advanced` and against the Phase 1 search seat (how much
  of the search's gain it keeps). Ship through the shipping lane.

## Phase 3: Value network, trained in a loop

Retry the learned evaluation with the flaws in [ANALYSIS.md](ANALYSIS.md) fixed.
- **Real afterstates**: score a move by applying it to the state (as the engine would) and
  computing features, not by editing a summary.
- **Inputs**: add lodestone, charts, splits, relays and surveys; the committed strategy and its
  progress; the rival-target predictions (who reaches which open corner first); income by turn.
- **Labels with credit for single moves**: n-step or TD(λ) returns; final points and turns to
  win alongside win/loss; action comparisons from the same position (run `moves-collect`).
- **Loop**: play with the current best (search seat + network) → collect → fit → evaluate
  against the previous generation and `ref:advanced` → repeat for at least 3–5 generations.
  Track cards held, discards and roads per generation to catch hoarding early.
- **Use**: first as the leaf score in a short offline search (rollouts cut off after a few
  turns), which makes the teacher cheaper and stronger; then in the shipped bot as a one-ply
  move chooser or folded into the Phase 2 selector, inside the CPU limits.

Order of work (updated 2026-11-17 evening):
1. **Done: the cheap teacher with `w1` fails.** Rollouts stopped after 6 rounds and scored by `w1`
   lost the probe's whole gain (−1.1 ±3.3 vs +6.7 with full rollouts, same seeds). `w1` has old
   inputs, was trained on s2's play, and was never judged on this task.
2. **A benchmark for any scorer, before training.** From `strategy-probe-3.json` positions (or
   re-collected ones with states saved), measure how often a stopped-rollout scorer picks the
   same strategy as full rollouts, and the correlation of their scores. Cheap to run, and the
   target a new network must hit. (The probe files hold features and scores, not game states;
   saving the states, or seeds plus steps to rebuild them, is part of this step.)
3. **Refit on r1 self-play** with better inputs: the seat summaries plus lodestone and surveys,
   pace and trade-aware affordability (`goals.ts`), the rival model's odds on our next targets,
   pieces left, award gaps. Labels: TD(λ) or n-step returns and final points, not only the winner.
4. **Judge by the benchmark** (agreement with full rollouts), then rerun the probe with the new
   scorer on v3's seeds. Only if it keeps most of +6.7 at a fraction of the cost, collect 10× the
   choices and retry the selector.
5. Only then consider it inside the live bot (one-ply move choice), where earlier versions hoarded.

## Phase 4: Ship and measure against people

- Ship through the shipping lane, with CPU per move checked in `tests/bots.test.ts`.
- Play saved games against people (the "Save my games" records); compare income by turn and
  win rate with the earlier records. Note that one strong player's games are a small sample.
- Every few weeks, run `records-disagree` on new records with the new bot to find what people
  still do better.

## Smaller items alongside

- **Longest Road and Largest Army, especially at 2 players and on Jumbotan (owner, 2026-11-17):**
  people keep both awards away from the bot with little effort. In the planner, Longest Road is a
  fixed-value goal (1.2–1.4 points, only when 1–3 roads would take it) and the army counts only
  inside a development card's value; neither weighs what the award is worth at this table size
  and point target, nor what it would take to keep it or take it back. A 2-point swing in a
  2-player game is worth far more than in a 4-player one. Diagnose first: award holders and
  swings in 2-player and Jumbotan games (bot vs bot, and the saved games), then value awards by
  the race for them like settlements (who can get there, how fast, and what it denies).

These are cheap and can run any time:
- C3 (Cartographers can replace a winning move) and C7 (gold choices beyond bank stock) from
  [ADVANCED.md](ADVANCED.md#confirmed-gaps-and-their-evidential-limits): fix as correctness.
- Intermediate route-first targeting on Roadrace (32% unfinished in mixed tables) and the
  `routeLinks: settlement` stall (10%).
- Trade diagnostics: count offers that let a rival build or win a race. These become inputs
  for Phase 3.

## Earlier experiments and their code

| Code                                           | Status                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Plan-based planner (`planner = 1`, `plans.ts`) | Inactive. Its plan payoffs may be reused for strategy targets in Phase 1.                                        |
| Value network (`choose.ts`, `value.ts`)        | Inactive; old checkpoints not promoted. Phase 3 replaces the edited-summary candidates and extends the features. |
| Headroom probe (`search.ts`, `rollouts.ts`)    | Kept. Its hidden-state resampling and paired rollouts are the base for the Phase 1 strategy search.              |
| `records-disagree`, `disagree`                 | Kept for finding concrete weak moves. Remember they score a move only by the bot's own follow-up.                |

The previous, more conservative plan is in git at `b3c3758:training/PLAN.md`.
