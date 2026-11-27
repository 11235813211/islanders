// Christmas Candy: taking cards off the loaded candy train, laid out like the gold panel.
import { Check } from 'lucide-react';
import { useState } from 'react';
import { candyRun, emptyBag, resourceCount } from '../../../shared/engine';
import {
  CLASSIC_RESOURCES,
  type ClassicResource,
  type GameAction,
  type GameView,
  type ResourceBag,
} from '../../../shared/types';
import { Chosen, Palette, Panel } from './CornerPanels';
import { tradableLabel, withItem } from './tradables';

/** True when the next pick from the candy train is this seat's. */
export const picksCandy = (view: GameView) =>
  view.phase === 'candy' && view.candyLoad?.picks[0]?.playerId === view.selfId;

/** The take-candy action for the chosen cards: the first as `resource`, the rest as `more`. */
function takeAction(bag: ResourceBag): GameAction {
  const [first, ...rest] = CLASSIC_RESOURCES.flatMap(r => Array<ClassicResource>(bag[r]).fill(r));
  if (!rest.length) return { type: 'take-candy', resource: first! };
  const more = emptyBag();
  for (const r of rest) more[r]++;
  return { type: 'take-candy', resource: first!, more };
}

/** The confirm button's text for the chosen cards. */
function takeLabel(bag: ResourceBag): string {
  const picked = resourceCount(bag);
  if (!picked) return 'Choose a card';
  if (picked > 1) return `Take ${picked} cards`;
  return `Take ${tradableLabel(CLASSIC_RESOURCES.find(r => bag[r])!)}`;
}

/**
 * Pick cards from the candy train: one per pick in a row that is yours (a city's two, or the next
 * building's when no one else picks in between), confirmed together. Each card shows how many are left.
 */
export default function CandyPanel({
  view,
  busy,
  send,
  secondsLeft,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
  /** Seconds before a bot picks for you. */
  secondsLeft: number | null;
}) {
  const load = view.candyLoad!;
  // Chosen cards belong to this train stop: once anyone picks, the choice starts over.
  const stop = `${load.train}:${load.picks.length}:${load.cards.join()}`;
  const [chosen, setChosen] = useState({ stop, bag: emptyBag() });
  const bag = chosen.stop === stop ? chosen.bag : emptyBag();
  const setBag = (next: ResourceBag) => setChosen({ stop, bag: next });
  const run = candyRun(load, view.selfId);
  const picked = resourceCount(bag);
  const onTrain = (r: string) => load.cards.filter(c => c === r).length;
  // With one pick, a new card replaces the chosen one; with more, cards add up to the run.
  const left = (r: string) => onTrain(r) - (run > 1 ? bag[r as ClassicResource] : 0);
  const pick = (r: ClassicResource) => setBag(withItem(run === 1 ? emptyBag() : bag, r, 1) as ResourceBag);
  return (
    <Panel
      title="Candy train"
      status={`${picked} / ${run} chosen${secondsLeft === null ? '' : ` · ${secondsLeft}s`}`}
      action={
        <button
          className="button primary"
          disabled={busy || !picked}
          onClick={() => {
            send(takeAction(bag));
            setBag(emptyBag());
          }}
        >
          <Check size={18} />
          {takeLabel(bag)}
        </button>
      }
    >
      <Palette
        items={[...CLASSIC_RESOURCES]}
        label="Cards on the candy train"
        name={r => `Choose ${tradableLabel(r)} (${left(r)} on the train)`}
        disabled={r => busy || left(r) <= 0 || (run > 1 && picked >= run)}
        pressed={r => bag[r as ClassicResource] > 0}
        count={left}
        pick={r => pick(r as ClassicResource)}
      />
      {run > 1 && (
        <Chosen
          bag={bag}
          label="Take"
          direction="in"
          hint={`Choose up to ${run} cards`}
          remove={r => setBag(withItem(bag, r, -1) as ResourceBag)}
        />
      )}
    </Panel>
  );
}
