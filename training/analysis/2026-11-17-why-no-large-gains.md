# 2026-11-17: Why earlier experiments couldn't find large gains

**Question.** Were the value network, the plan-based planner, and the search probe weak ideas,
or did the experiments as built have no way to find a large gain? This decides whether a
strategy layer and a value network are worth building properly.

**Sources.** README results log (value network round 1, seat value network w1, plan-based
planner, headroom probe, person vs bot); [EVIDENCE.md](../EVIDENCE.md);
[value.ts](../../shared/bots/advanced/value.ts), [choose.ts](../../shared/bots/advanced/choose.ts),
[plans.ts](../../shared/bots/advanced/plans.ts), [search.ts](../search.ts),
[record-disagree.ts](../record-disagree.ts), [Brain](../../shared/bots/types.ts).

**Conclusion.** Mostly the latter. Every experiment so far measured or learned from _the
current bot's continuation of the game_. That design can find at most a one-step improvement on
the current bot. It can't find a strategy that takes many turns to pay off, which is how the
person beats the bots. Small results from these experiments are not evidence that large gains
don't exist.

### 1. All three tools are anchored to the current bot (checked in code)

| Tool                         | How the rest of the game is played                                                                                  | What it can find                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Value networks v1, w1        | Trained on positions from the shipped bot's own games, labeled by who won (w1td: TD(λ 0.7) refit of the same data). | The value of a position _if the shipped bot plays on_.           |
| Headroom probe (`search.ts`) | Each candidate build is played out with the shipped bot in every seat, including the searching seat after one move. | The best single build decision, given the shipped bot afterward. |
| `records-disagree`           | The person's move, then the bot plays the person's seat.                                                            | Whether one human move is better, given the bot follows it up.   |

Reinforcement learning calls this one step of policy improvement: given a policy π, pick each
move by the value of continuing with π. It is guaranteed not to be worse than π, but in one step
it only fixes decisions that are wrong _given π's own follow-up_. A plan the bot would never
continue (build a survey ship, then chart, then settle the new island) scores like its first
move alone, usually a loss of cards. The log already says this for `records-disagree`: "a plan
the bot wouldn't follow up scores nothing".

So the probe's +3.5 to +8.5 pp (screen 8–16, build decisions only, 50 seeds) is roughly the
ceiling for one round of anything trained on the current bot's play. It is not a measure of the
total headroom.

### 2. The human advantage is a multi-turn strategy (descriptive, from the records)

In TIGER28 the person's income grew 33 → 76 between turns 15 and 45 while the best bot's stayed
36 → 36; the person won 6 of 11 finished games against Advanced bots, and crushed them on Middle
Fog (2026-11-11). Income growth like that comes from several investments that only pay off
together (expansion, then cities on the new production, then ports). That is exactly what the
tools in section 1 assign no value to. This is a small sample from one strong player, so it
motivates the experiment in [PLAN.md](../PLAN.md); it doesn't prove which strategy is right.

### 3. The value network was tried once, with known flaws (checked in code)

- **One fit, no loop.** v1 (25k games, 2.3M positions) and w1 (20k games, 504k positions) were
  each fit once to the shipped bot's play. Methods that made learned values work in games
  (TD-Gammon, AlphaZero, expert iteration) repeat play → train → play many times so the network
  learns from a policy that keeps improving. That loop was never run.
- **Weak labels.** One win/loss bit per game, shared by every position in it. Positions in one
  game are strongly correlated, so 2.3M positions are worth far fewer independent examples. The
  log noted "whole-game labels can't tell holding from building".
- **Moves are judged on edited summaries, not real positions.** `choose.ts` builds each
  candidate's result by editing a seat summary. A road changes only `reachDistance` by one and
  costs two cards; a settlement adds its pips. The network never sees what the road leads to.
- **Missing inputs.** No lodestone, charts, surveys, splits or relays (`featuresOf` in
  `value.ts` uses the five base resources only); no board shape beyond the best one or two
  reachable corners; no opponent threat to our targets.
- **The hoarding result follows from that.** Winners tend to hold cards, and the features show
  a build's cost clearly and its benefit barely, so "keep the cards" scores highest. Full
  control ×0.35 and ×0.20 with hoarding is a symptom of the targets and features, not proof that
  a learned evaluation can't help.
- **The fix was built and not run.** `moves-collect` (action-level comparisons from the same
  position) exists; the log says it was stopped before running at scale.

### 4. The plan-based planner was not a strategy layer (checked in code)

`plans.ts` ranks plans by payoff per turn of waiting and re-picks at every decision; it keeps no
commitment, and its plan set has no survey/chart/split/relay investments. Brains are stateless
(`Brain` gets only a `GameView`), so nothing carries a plan from one decision to the next. Its
−10.0 ±1.6 pp on Middle Fog 3p came from overbuilding ships while exploring: an implementation
problem in one plan kind, not evidence against planning. The overall results (+0.7 ±1.3,
−0.2 ±1.4 pp) say this scorer is about as good as the fixed priorities, nothing more.

### 5. What this suggests (reasoning, to be tested)

1. Test whether committed multi-turn strategies have large headroom, with rollouts in which
   the searching seat _keeps following_ the chosen strategy. This is the decisive cheap test:
   if choosing among well-built strategies can't beat three Advanced bots by about +10 pp, a
   learned strategy layer won't either; if it can, it is also the teacher for one.
2. Retry the value network inside a play → train → play loop, with labels that credit single
   moves (n-step or TD returns, final points as well as wins, action comparisons from the same
   position), real engine afterstates instead of edited summaries, and the missing inputs.
3. Treat strategy, setup placement, and rival prediction as one problem. Expansion is decided
   largely at setup (which resources and how much open room), and every later settlement is a
   race: where rivals are heading decides which targets are worth chasing, which to give up,
   and when blocking pays. Today setup scores spots without a strategy in mind, and races use
   only geometric distance (C4 in [ADVANCED.md](../ADVANCED.md)); neither predicts where a rival is
   going. (Raised by the owner, 2026-11-17.)
4. Keep search and big networks offline; ship a small selector or network distilled from them,
   so moves stay cheap on Workers.

**Limits of this analysis.** Bot-vs-bot gains are capped by dice luck: at four players, even a
much stronger bot will likely win well under 2× its fair share against competent opponents.
Gains against people can be bigger, because the current bot has a real strategic hole they
exploit. A strategy layer could beat people more while beating Advanced only modestly, or the
reverse; that is why the plan ends with games against people.

**What would change this conclusion.** A well-implemented strategy probe (each strategy checked
to do what it says) that gains under +5 pp against Advanced would mean strategy choice is not
the main gap, and attention should move to tactics: trades, robber, races.
