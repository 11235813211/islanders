# 2026-11-17 (night, later): The plan-based planner, what made it work, and its weak spots

**Question.** The plan-based planner (`plans.ts`) already ranks concrete goals by return per
round of waiting, close to the owner's ROI framing. It lost to the fixed-order planner in
2026-11-12 tests. Can it be fixed, and what was missing?

**Sources.** [RUNS.md](../RUNS.md) (planner runs, r1), [plans.ts](../../shared/bots/advanced/plans.ts),
[plan-turn.ts](../../shared/bots/advanced/plan-turn.ts), checkpoint `r1`.

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
the fixed-preset strategies ([presets entry](2026-11-17-strategy-presets-rival-model.md)) should become goal-level choices inside it.

**Reproduce.** `compare --a shipped --knobs '{"planner":1,"raceModel":1,"cityOption":0.4,
"frontierOption":0.4,"exploreValue":0}' --b shipped --field shipped --games 600 --seed 6500000`
(before promotion; after it, compare `shipped` against `s2`).
