# 2026-11-17 (4:30 am): A hidden-information leak in every rollout search so far

**Question.** Probe v2 gained +13.3 ±2.9 pp, yet each choice's scores looked like pure noise
(selector couldn't learn; label spread no larger than rollout noise). How can noisy choices give
a large, consistent gain?

**Finding (checked in code and by test).** Rooms default to balanced dice (`diceMode:
'balanced'`, `shared/default-settings.ts`): rolls are drawn from a shuffled deck of the 36
combinations stored in `state.diceDeck`, reshuffled when 12 are left. The deck is hidden from
views, but `determinize` in [search.ts](../search.ts) resampled hands, development cards, fog and
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
