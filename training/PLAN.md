# Plan: a strong Advanced bot

Goal: a bot that is good at the game, not one that has learned Intermediate's habits. The old
target ("Intermediate wins about 10%") is dropped. Read `training/README.md` (commands, results
log) and `AGENTS.md` first. Status is at the bottom; update it as steps finish.

## Rules for every step

- **Never measure against Intermediate alone.** A change counts only if it is no worse against
  every opponent in the gauntlet (below) and better on the total. A gain that shows up only against
  Intermediate is exploitation; reject it.
- Paired, seat-rotated comparisons on fresh seeds (`compare`, `select`), with ± errors. No
  promotion from one run.
- Play-time CPU stays as it is now (median well under 1 ms; worst under about 7 ms;
  `tests/bots.test.ts`). Heavy compute happens only in training.
- Bots read only `GameView`. The public card count is `view.likelyHands` (bot seats only).
- Keep the trade-offer limits in the README.

## The gauntlet (build first, in step 3a)

`training/run.mjs gauntlet --hero X`: one report of X's edge against each of these, plus a
weighted total:
- Intermediate and Beginner;
- the current shipped bot and the last two promoted checkpoints (self-play: stops cycling);
- styles (`style:trader`, `style:hoarder`, `style:cards`, `style:builder`);
- mixed tables (one of each at the table), the closest stand-in for varied humans.

All scenarios (every map, 2–6 players, varied settings), and the base island at 4 players
reported separately, since that is the game most people play.

## Step 3: value network that sees every seat

Why the first value network failed (README log): it learned from whole-game outcomes, so it
picked up correlations ("winners hold cards") instead of what a move does.

a. **Gauntlet command** (above).
b. **Per-seat output.** The network predicts every seat's chance to win (softmax over seats, our
seat first, opponents sorted by points), from our features plus a small block per opponent
(points, likely hand from `likelyHands`, production, cards, knights, road, pieces left).
Fixed width: pad to 6 seats. Keep it board-agnostic. Files: `shared/bots/advanced/value.ts`
(features), `training/mlp.ts` (add a softmax output and cross-entropy loss).
c. **Better labels**, in `training/networks.ts` / new `training/labels.ts`:
- TD(λ) targets: each sampled position learns from the network's value a few turns later,
  plus the final result (λ ≈ 0.7), so dice luck mostly cancels;
- move comparisons: at sampled decisions, try each candidate (build each kind, buy a card,
  hold), play each out 16–32 times with the current bot (cut off after about 15 turns and
  scored by the network), and label each candidate with its average. This answers "hold or
  build?" directly. Budget: about a day on 14 threads for 30k decisions.
  d. **Play:** the planner proposes the top few moves; the network scores each one's result,
  averaged over the next roll (11 totals, weighted). That's a few hundred evaluations per
  decision, well within the CPU budget. `shared/bots/advanced/choose.ts`.
  e. Measure with the gauntlet; promote only if it beats the shipped bot everywhere.

## Step 4: one value for trades, robber, and monopoly

With every seat's chances: accept or offer a trade only if our chance rises and the partner's
does not rise more (nor the leader's); place the robber where the leader's chance drops most;
play monopoly where our gain is largest. Replaces knobs in `trade.ts` and `robber.ts` where it
measures better. Also protects against people fleecing the bot with lopsided trades.

## Step 5: offline teacher

An expensive searcher for training only: sample hidden cards and the deck from the card count,
run tree search (1–5 s per decision) with the current bot playing out the games, and save its
choices and values. Train the network on them, play self-play with the new network, repeat.
Each round must pass the gauntlet. Cores: `THREADS` (default: all but one).

## Step 6: real results

Record outcomes of live games by bot level (no hands, just who won, table size, map) so the bot
can be judged against people. Needs a small server change and a plain note in the UI if it
counts people's games.

## Status

- Done (2026-11-10, uncommitted unless git says otherwise): training 2× faster (same games);
  public card count (`shared/engine/hands.ts`, `tests/hands.test.ts`), used by Advanced for
  steals, monopoly, and whom to offer to. 36.3% vs 34.7% against Intermediate on seeds 700000.
- Next: 3a (gauntlet), then 3b–3e.
