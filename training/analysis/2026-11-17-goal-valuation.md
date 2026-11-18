# 2026-11-17 (afternoon): Need-based goal valuation matches r1 but doesn't beat it

**Question.** Does valuing goals the way the owner described (income by what we need, real trade
costs through our harbors, and what a goal enables measured by recomputing our next races) beat
r1's simpler valuation (pips × scarcity, plus two option constants)?

**Design (goals.ts, `goalModel` 1).** Rounds to afford a cost with surplus traded at our rates and
gold as any card. "Pace" = points per round for a build mix (a city, a settlement with 2 roads,
half a development card). Income and harbors are worth their gain in pace × rounds left after the
build. Enabling: after a hypothetical build (new income, harbor, a new place to build roads from),
how much the score of our next settlement goals improves, with the rival model's odds at the new
arrival time. Checked by eye with `goal-report`: a city doubling brick and sheep got the largest
enabling bonus; a missing resource's spots are valued up, a resource we have plenty of down.

**Result (measured, RUNS.md).** −1.2 to +0.1 pp vs r1 (±1.1) across enabling weights and variants.
With enabling it builds almost exactly what r1 builds. CPU per move about doubles.

**Why it may not have helped (reasoning).** The two valuations agree on most decisions: r1's
constants already approximate "a settlement that opens more spots" and "a city later", and need
mostly shows up through trade costs either way. Where they differ, the differences are small next
to dice. Static valuation of single goals seems to have reached what it can give against bots that
value goals the same way. The measured headroom is in lookahead (strategy probe +6.7 pp from
rollouts), not in sharper one-step values.

**Good.** The machinery is sound and reusable: trade-aware affordability and "pace" are natural
inputs for a value network and for setup (a start judged by the pace it gives and the races it
wins). `goal-report` is a useful way to read the planner's numbers in one position.

**Bad.** No gain; twice the CPU. The build mix and enabling weight are guesses.

**Weak points in this design (reviewed after the result).** These are the places the model can
be wrong in ways that would hide a real effect or create a fake one. Anyone reviving it should
address them first.

_Affordability (`roundsToAfford`)_
1. Trades are continuous: 3 surplus ore at 4:1 counts as 0.75 of a card. That overstates what a
   poor, unbalanced economy can buy, which understates how much a missing resource matters.
2. Only bank and harbor trades count. Bots make about 3.5 accepted player trades a game, often
   1:1, which makes missing resources far cheaper than 4:1. With people, cheaper still or much
   worse (they refuse). The model has no notion of who would trade with us.
3. Gold counts as a perfect wildcard; the bank running out, the robber on our best tile, 7s
   (discards when holding many cards to trade later) and development-card income (Year of
   Plenty, Monopoly) are all ignored.
4. Hand cards and income are pooled with no timing: a cost that needs 4 wheat is "affordable"
   by 4:1 trades of income that hasn't arrived in the right order.

_Pace (`pointRate`)_
5. The build mix (1 city, 1 settlement with 2 roads, ½ development card) is fixed. It doesn't
depend on how many open spots we can still reach, how many settlements we have left to
upgrade, or the game stage, so it can value income for builds we will never make.
6. Pace uses one bundle, so the bottleneck resource dominates. That is the "need" effect, but it
is all-or-nothing: whichever resource is scarcest in the bundle gets nearly all the value.
7. Points per round × rounds left is linear; it ignores that the game ends when someone reaches
the target, so late income is worth more to the leader than to a player far behind.
8. Rounds left comes from the leader's points and one knob; it is the same for every seat.

_Enabling (`enablingValue`, removed)_
9. It measured how much our next settlement goals improve after a hypothetical build, but the
"after" frontier added only the goal's corner, not the roads or ships built along its path,
so route goals got too little credit for the ground they cover.
10. Rival intents were not updated after the hypothetical build: if we take a corner, rivals
re-target, which can open or close other races. Odds came from the current intents.
11. It was computed only for the best 8 goals by the score before enabling, so a goal ranked 9th
could never be lifted by what it opens up.
12. Units were mixed: a change in "score per round of waiting" times a weight (`enableValue`),
rather than points. The weight had to be guessed and tuning it changed little.
13. Max-only (best next goal) gave zero credit to a second good spot; the best-three variant
fixed that in principle and still made no difference.

_Evaluation_
14. It was compared against r1 bots that value goals almost the same way. If both bots make the
same mistakes, a better valuation may not show up in bot-vs-bot wins at all; it would show
up against people who exploit those mistakes, which this test can't measure.
15. 400 seeds with ±1.1 pp can't see effects under about 2 pp.

**Verdict.** Don't ship `goalModel` 1; the bot is back on r1's planner. goals.ts now keeps only
trade-aware affordability, pace, and income-by-pace (used by `goal-report`, and candidate inputs
for a value network). The enabling code is removed; this entry describes it. Weak points 1, 2, 5
and 9 are the most likely to matter if the idea is revisited.
