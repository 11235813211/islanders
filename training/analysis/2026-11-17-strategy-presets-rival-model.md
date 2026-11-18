# 2026-11-17 (night): Strategy presets, the rival model, and what a strategy should be

**Question.** First Phase 1 results: do fixed whole-game strategies differ usefully, can rivals'
next settlements be predicted from the view, and does racing by that prediction help?

**Sources.** [RUNS.md](../RUNS.md) (fixed-strategy pass, race model compare);
[strategy.ts](../../shared/bots/advanced/strategy.ts), [rivals.ts](../../shared/bots/advanced/rivals.ts),
[races.ts](../races.ts), [strategy-search.ts](../strategy-search.ts).

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
ROI view already exists in [plans.ts](../../shared/bots/advanced/plans.ts) (payoff per turn of
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
