# Analysis of bot training

This is where analysis of the Advanced bot's training goes: why experiments came out the way
they did, what a result can and can't tell us, and what that means for the next step. Newest
first. Related files:
- [PLAN.md](PLAN.md): what we're doing next and why.
- [RUNS.md](RUNS.md): one entry per batch of games (why, ETA, one-line result).
- [README results log](README.md#results-log): the full write-up of each result.
- [EVIDENCE.md](EVIDENCE.md): what the past results establish, experiment by experiment.
- [ADVANCED.md](ADVANCED.md): how the bot decides today.
- [STATISTICS.md](STATISTICS.md): how to compare bots and report uncertainty.

## How to write an entry

Anyone (person or agent) who analyzes training results, bot behavior, or saved games writes it
up here, even when the conclusion is "nothing found". An entry should let the next reader check
it without redoing the work:
- **Date and question.** What was asked, and why it matters.
- **Sources.** The runs, log entries, files, and commits it rests on, linked. Numbers copied from
  the log keep their `±` and sample sizes.
- **What was checked directly vs inferred.** Say which claims you verified in code or data and
  which are reasoning. Don't present a hypothesis as a finding.
- **Conclusion and what would change it.** Including which experiment would test it.
- **Good, bad, next.** What looks right and wrong about the design and the result, ideas to
  improve it, and a verdict: keep, rework, or scrap. When an idea with strong reasoning behind it
  doesn't work, treat that as a sign the design approached it wrong: say what in the design
  could explain the failure before dropping the idea.
- **Design review.** For new designs, the pros and cons considered (be skeptical up front).
- **Reproduce.** The commands, or the `tests/` or `training/` file that holds the analysis. No
  scratch scripts that only lived in a terminal.

Fix or mark an entry when later results contradict it (keep the original text, add a dated note).

---

## 2026-11-17 (5:45 am): Honest strategy headroom, and why the selector can't learn it yet

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

---

## 2026-11-17 (4:30 am): A hidden-information leak in every rollout search so far

**Question.** Probe v2 gained +13.3 ±2.9 pp, yet each choice's scores looked like pure noise
(selector couldn't learn; label spread no larger than rollout noise). How can noisy choices give
a large, consistent gain?

**Finding (checked in code and by test).** Rooms default to balanced dice (`diceMode:
'balanced'`, `shared/default-settings.ts`): rolls are drawn from a shuffled deck of the 36
combinations stored in `state.diceDeck`, reshuffled when 12 are left. The deck is hidden from
views, but `determinize` in [search.ts](search.ts) resampled hands, development cards, fog and
volcano faces, not the dice deck. Every rollout therefore knew the next rolls (up to 24, about
8 rounds at 3 players). A seat that knows which numbers come up next picks strategies (and in the
2026-11-12 probe, builds) that fit them: real-looking gains that can't exist in play.

Unit tests run with random dice (`tests/setup.ts`), so `tests/search.test.ts` never saw a dice
deck. Fixed: `determinize` now reshuffles the remaining dice cards (which cards are left is
public, by counting rolls since the reshuffle; their order isn't), and the test plays with
balanced dice and checks the dice order is redrawn (fails without the fix).

**What it invalidates.** The strategy probe pilot (+8.5) and v2 (+13.3), and the 2026-11-12
build-move search probe (+3.5 to +8.5), as measures of headroom. It does not affect any bot-vs-bot
comparison (`compare`/`eval`): those never look ahead. `r1`'s gains stand.
`records-disagree` rollouts are conditional on the recorded state by design (documented there).

**Good / bad / next.** Good: caught before building Phase 2 on it; the noise analysis is what
gave it away, so checking label signal against noise is worth doing on every teacher. Bad: three
earlier conclusions rested on it. Next: probe v3 (same seeds, fixed) gives the honest number.

**Verdict.** Keep the fix; rerun before drawing any conclusion about strategy headroom.

---

## 2026-11-17 (night, 3 am): Strategy probe pilot: choosing when beats any fixed strategy

**Question.** Does choosing among whole-game strategies from the position (rollouts in which the
seat keeps following the strategy) beat the shipped bot, when every strategy loses on its own?

**Sources.** [RUNS.md](RUNS.md) strategy probe pilot; `training/data/strategy-probe-1.json` (each
choice with every strategy's rollout score); [strategy-search.ts](strategy-search.ts).

**Result (measured).** +8.5 ±3.0 pp over 50 seeds × 4 seats at 4 players (33.5% vs 25%), against
s2 (before r1). Each preset alone: −0.1 to −6.7 pp. So the value is in choosing when, as the
owner expected. Choices vary by map and stage: at setup it keeps current 69% of the time; in
later stages current drops to 27–35%. On Four Isles explore is chosen 28%, on Cartographers maps
chart 11–21%, on Trainer 1 (new-base-board) cities/cards over half.

**Good.** First evidence of a large gain within reach: +8.5 pp (in the +5 to +10 band of the plan).
It needs only about 7 choices per game, so a cheap learned selector could plausibly copy it.

**Bad / doubts.**
- Pilot: 50 seeds, ±3 pp. The interval runs from about +2.5 to +14.5.
- It is in the same range as the 2026-11-12 build-move search (+3.5 to +8.5): part of the gain is
  rollouts in general, not strategies in particular.
- Rollouts play opponents as the same bot (exact model of the field). Against people it will be
  less sure what they do.
- The presets change knobs the old planner reads (settlementValue, cityValue, spareRoads, ...). r1's
  plan-based planner ignores most of them, so these strategies no longer mean much on r1.
- 7 CPU-min per game: training only.

**Next.**
1. Rebuild strategies for the plan-based planner as goal-kind leans (multipliers on the payoff of
   city, settlement/route, development, survey goals) plus the existing setup lean. This matches
   the owner's framing: the same ROI goals, with a direction that can change when cards and the
   board change.
2. Rerun the probe against r1, at 3 players (cheaper per seed; owner's suggestion) and 4.
3. Save position features at each choice so Phase 2 can train a selector (what the view looked
   like when each strategy won its rollouts).

**Verdict.** Keep: strongest lead so far. Rework the strategy set before scaling compute.

_Note (04:30): this result is invalid. Rollouts knew the upcoming balanced-dice order; see the
entry above._

---

## 2026-11-17 (night, later): The plan-based planner, what made it work, and its weak spots

**Question.** The plan-based planner (`plans.ts`) already ranks concrete goals by return per
round of waiting, close to the owner's ROI framing. It lost to the fixed-order planner in
2026-11-12 tests. Can it be fixed, and what was missing?

**Sources.** [RUNS.md](RUNS.md) (planner runs, r1), [plans.ts](../shared/bots/advanced/plans.ts),
[plan-turn.ts](../shared/bots/advanced/plan-turn.ts), checkpoint `r1`.

**Result (measured).** Planner alone −0.2 ±1.1 pp vs s2; with rival odds +0.7; with "what a
settlement opens next" (`frontierOption`) +3.4; with that and a later city there (`cityOption`)
+3.5 ±1.1 on the selection seeds, then +3.8 ±0.9 and +2.4 ±0.9 on two fresh 600-seed sets.
Shipped as `r1` after the protected checks (RUNS.md). Against Intermediate ×1.91, was ×1.65.

**Why it worked (reasoning, partly checked).** The single largest piece was valuing what a
settlement makes possible: the planner had scored each settlement only by its own point and
production, so it couldn't tell a dead-end spot from one that opens the next two. That's the
"ease of what you can do next" in the owner's ROI note. Rival odds helped a little on their own
and are used inside the frontier value too. The earlier planner's failure was not the ROI idea;
it was missing what goals enable, distance-only races, and a broken fog goal.

**Good.** One currency (points) across goals, so new goal types slot in without new weights. The
rival model is cheap (one pass over open corners per seat) and checkable (`race-check`). All
gains held on fresh seeds and at every table size in the larger confirmation set.

**Bad / doubts.**
- Selection used one seed set and four knob settings; the second fresh set came in lower (+2.4).
  The true effect is probably +2 to +3.5 pp.
- `frontierGain` counts only the single best corner beyond a spot, ignores whether rivals reach
  it via other routes besides the race odds, and recomputes per plan (CPU fine today, but O(plans
  × corners)).
- Fog exploring is off, not fixed: on fog maps the bot now never values revealing tiles.
- The survey payoff (1 + 0.3 × `surveyValue`) is a guess; it passes the behavior test, but the
  Cartographers gain (+2.6 ±1.4) isn't isolated from the rest.
- No commitment beyond sunk progress; 2-player results were mixed (−2.3 on one set, +2.9 on the
  other: small samples).
- All of this is bot vs bot. The rival model's accuracy is partly circular (bots score spots like
  the model). Human games are the real test.

**Next / ideas.**
1. Fog exploring, redesigned 2026-11-17: a revealed spot now counts a settlement's return _less its
   cost_ (4 cards). On the three fog maps (Middle Fog, Triangulation, Mercator's Folly; 300 seeds
   6900000) vs exploring off: `exploreValue` 1 +0.1 ±0.7, 0.5 0.0 ±0.5 pp; it explores 0.5 and 0.2 tiles
   a game. The harm is gone, no gain. Possible reason (reasoning): a revealed tile is public, so the
   explorer gets one card while every player can race for the new spots; exploring may be worth
   little unless we are also first to settle there. Next idea: value exploring only toward fog that
   our own routes can settle first (rival model on the corners next to the fog). Shipped stays at 0.
2. ~~Frontier value as the sum of the best two spots beyond.~~ Tried 2026-11-17: adding 0.5 or 1.0
   of the second-best spot: +0.6 ±0.7 and +0.4 ±0.8 pp (400 seeds 6800000). No effect; removed.
3. ~~Tune the planner's own numbers.~~ Tried 2026-11-17 (RUNS.md): best +0.9 ±0.8 pp, not shipped.
   As with every earlier tune, the knobs aren't where the strength is; structure is.
4. ~~Check `race-check` on saved human games.~~ Done 2026-11-17: the person's 37 settlements after
   setup in the 11 saved games, predicted from another seat's view at the person's previous move
   (about a turn earlier): top 1 73%, top 3 89%; nearest open corner 65%. Lower than on bots (87/96%)
   as expected, still clearly better than the baseline. Small sample (±7 pp). Reproduce:
   `race-check --positions training/data/disagree/pos-a.json,...,pos-h.json`.

**Verdict.** Keep and build on it: the plan-based planner is now the base for strategy work, and
the fixed-preset strategies (previous entry) should become goal-level choices inside it.

**Reproduce.** `compare --a shipped --knobs '{"planner":1,"raceModel":1,"cityOption":0.4,
"frontierOption":0.4,"exploreValue":0}' --b shipped --field shipped --games 600 --seed 6500000`
(before promotion; after it, compare `shipped` against `s2`).

---

## 2026-11-17 (night): Strategy presets, the rival model, and what a strategy should be

**Question.** First Phase 1 results: do fixed whole-game strategies differ usefully, can rivals'
next settlements be predicted from the view, and does racing by that prediction help?

**Sources.** [RUNS.md](RUNS.md) (fixed-strategy pass, race model compare);
[strategy.ts](../shared/bots/advanced/strategy.ts), [rivals.ts](../shared/bots/advanced/rivals.ts),
[races.ts](races.ts), [strategy-search.ts](strategy-search.ts).

**Fixed strategies (measured).** Each preset as one seat vs shipped bots, 300 seeds, all maps and
sizes, paired against the shipped bot in the same seats: expand −6.3 ±1.3, cities −1.8 ±1.3, cards
−6.7 ±1.2, explore −0.1 ±1.3, chart −1.0 ±0.8 pp. Behavior counts show weak follow-through:
- expand: 6.9 roads per game vs 5.0, but 3.3 settlements vs 2.9 and 3.0 dead routes vs 2.0. It
  builds roads toward spots it then doesn't get.
- cities: 2.4 cities vs 2.3. It settles less, so it has fewer settlements to upgrade.
- cards: 8.8 cards vs 4.7, fewer of everything else.

**Interpretation (reasoning).** A strategy defined as "always prefer X" is the wrong unit (owner's
point, 2026-11-17): a real strategy is a sequence of concrete build goals ranked by return on
investment (what it gives: production, points, whose worth changes as the game goes on; what it
makes easy next; the chance a rival takes it first), flexing with the cards that come. The
presets remain useful only as probe options and for diagnostics. The planner that matches the
ROI view already exists in [plans.ts](../shared/bots/advanced/plans.ts) (payoff per turn of
waiting); the next step is improving it (races, what a goal enables next) rather than tuning
labels.

**Rival model (measured on bot games).** `race-check`, shipped bots, predictions made from
another seat's view at each turn start, scored on each later settlement:

| Games                     | Settlements | Model top 1 | Model top 3 | Nearest open corner |
| ------------------------- | ----------- | ----------- | ----------- | ------------------- |
| 4 players, all maps (100) | 1,034       | 87%         | 96%         | 83%                 |
| All sizes and maps (200)  | 2,002       | 88%         | 96%         | 81%                 |
| Cartographers maps (150)  | 1,523       | 85%         | 94%         | 78%                 |

Two fixes got it there: corners a player's routes already reach must count (excluding them gave
16%), and a reached corner is preferred (×3) over building toward another, as players do. Caveat:
the bots score spots almost as the model does, so bot-game accuracy is partly circular. Saved
human games are the real test (to do: run the same check on records).

**Racing by the model (measured).** The shipped planner choosing its expansion target by the
chance it gets there first (`raceModel` 1) instead of "who is closer": +1.1 ±0.9 pp over 400 seeds
(2p +6.0, 3p +1.5, 4p +0.7, 5p −0.8; small per-size samples). Owner: acceptable as a gain. In the
shipped planner the race only picks the long-range target; it should matter more where every
route goal is weighed by its odds (the ROI planner).

**Good / bad / verdict.** Presets: cheap to build and they plug into the harness, but they lose
because they override good judgment everywhere instead of choosing when. Verdict: keep only as
probe options; rework strategy as goal-level choices in the plan-based planner. Rival model:
keep (accurate on bots, cheap, now shipped inside r1); doubt: human accuracy unknown.

**Reproduce.** `node training/run.mjs compare --a strategy:expand --b shipped --field shipped
--games 300 --seed 6000000`; `race-check --games 100 --players 4`; `compare --a shipped --knobs
'{"raceModel":1}' --b shipped --field shipped --games 400 --seed 6100000`.

---

## 2026-11-17: Why earlier experiments couldn't find large gains

**Question.** Were the value network, the plan-based planner, and the search probe weak ideas,
or did the experiments as built have no way to find a large gain? This decides whether a
strategy layer and a value network are worth building properly.

**Sources.** README results log (value network round 1, seat value network w1, plan-based
planner, headroom probe, person vs bot); [EVIDENCE.md](EVIDENCE.md);
[value.ts](../shared/bots/advanced/value.ts), [choose.ts](../shared/bots/advanced/choose.ts),
[plans.ts](../shared/bots/advanced/plans.ts), [search.ts](search.ts),
[record-disagree.ts](record-disagree.ts), [Brain](../shared/bots/types.ts).

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
motivates the experiment in [PLAN.md](PLAN.md); it doesn't prove which strategy is right.

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
   only geometric distance (C4 in [ADVANCED.md](ADVANCED.md)); neither predicts where a rival is
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
