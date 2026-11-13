import { choiceFits, choiceGroups, choiceLimit } from '../choices';
import { type GameState, RESOURCES } from '../types';
import { addLog, BUILD_COSTS, type Handlers, needPhase, pay, requireRule, resourceCount, tally } from './core';
import { revealFog } from './fog';
import { legalMoves } from './legal';
import { eruptAt, volcanoDie } from './production';
import { afterFreePiece, afterProduction, finishSetupLink } from './turn';

/** What a player still picks: any resource from gold and volcanoes, one of two from split tiles. */
const owedGroups = (state: GameState, playerId: string) =>
  choiceGroups(state.pendingGold[playerId] ?? 0, state.pendingSplit[playerId]);

/** Ships (sea maps) and choosing resources from gold fields, volcanoes, and split tiles. */
export const seaHandlers: Pick<Handlers, 'place-ship' | 'build-ship' | 'move-ship' | 'choose-gold' | 'roll-volcanoes'> =
  {
    /** The player who rolled rolls a die for each erupting volcano, in board order. */
    'roll-volcanoes'({ next, random }) {
      needPhase(next, 'eruption');
      for (const hexId of next.eruption ?? []) eruptAt(next, hexId, volcanoDie(next, hexId, random));
      next.eruption = null;
      next.phase = 'build';
    },

    'place-ship'({ next, player, playerId }, action) {
      needPhase(next, 'setup-road');
      requireRule(
        legalMoves(next, playerId).ships.includes(action.edgeId),
        'Connect this ship to the settlement you just placed.',
      );
      next.ships[action.edgeId] = playerId;
      tally(next, playerId, 'built', 'ship');
      addLog(next, `${player.name} built a ship.`, { kind: 'build', playerId, piece: 'ship' });
      revealFog(next, action.edgeId, playerId);
      finishSetupLink(next);
    },

    'build-ship'({ next, player, playerId }, action) {
      needPhase(next, 'build', 'free-roads', 'special-build');
      requireRule(
        legalMoves(next, playerId).ships.includes(action.edgeId),
        'Choose open sea next to your settlement or ship, away from the pirate, and make sure you can pay.',
      );
      const paid = next.phase === 'free-roads' ? undefined : BUILD_COSTS.ship;
      if (paid) pay(next, player, paid);
      next.ships[action.edgeId] = playerId;
      next.shipsBuilt.push(action.edgeId);
      tally(next, playerId, 'built', 'ship');
      addLog(next, `${player.name} built a ship.`, { kind: 'build', playerId, piece: 'ship', ...(paid && { paid }) });
      if (next.phase === 'free-roads') afterFreePiece(next, playerId);
      revealFog(next, action.edgeId, playerId);
    },

    'move-ship'({ next, player, playerId }, action) {
      needPhase(next, 'build');
      requireRule(!next.shipMoved, 'You can move one ship per turn.');
      requireRule(
        legalMoves(next, playerId).shipMoves[action.from]?.includes(action.to),
        'Move a ship from the open end of your line, built before this turn and away from the pirate.',
      );
      delete next.ships[action.from];
      next.ships[action.to] = playerId;
      next.shipMoved = true;
      addLog(next, `${player.name} moved a ship.`);
      revealFog(next, action.to, playerId);
    },

    /** Off-turn too: everyone owed a gold, volcano, or split-tile pick chooses at the same time. */
    'choose-gold'({ next, player, playerId }, action) {
      needPhase(next, 'gold');
      const groups = owedGroups(next, playerId);
      const owed = Math.min(next.pendingGold[playerId] ?? 0, choiceLimit(groups, next.bank));
      requireRule(owed > 0, 'You have no resources to choose.');
      requireRule(resourceCount(action.resources) === owed, `Choose exactly ${owed} resource${owed === 1 ? '' : 's'}.`);
      requireRule(
        RESOURCES.every(r => next.bank[r] >= action.resources[r]),
        'The bank does not have those resources.',
      );
      requireRule(choiceFits(action.resources, groups), 'A split tile pays only one of its two resources.');
      for (const r of RESOURCES) {
        next.bank[r] -= action.resources[r];
        player.resources[r] += action.resources[r];
        tally(next, playerId, 'produced', r, action.resources[r]);
      }
      tally(next, playerId, 'cardsIn', 'gold', owed);
      delete next.pendingGold[playerId];
      delete next.pendingSplit[playerId];
      // Anyone else still owed may now be owed less if the bank ran low.
      for (const id of Object.keys(next.pendingGold))
        if (Math.min(next.pendingGold[id]!, choiceLimit(owedGroups(next, id), next.bank)) === 0) {
          delete next.pendingGold[id];
          delete next.pendingSplit[id];
        }
      addLog(next, `${player.name} took ${owed} resource${owed === 1 ? '' : 's'} of their choice.`, {
        kind: 'gold',
        playerId,
        resources: action.resources,
      });
      if (!Object.keys(next.pendingGold).length) next.phase = afterProduction(next);
    },
  };
