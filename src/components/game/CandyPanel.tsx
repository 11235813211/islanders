// Christmas Candy: taking a card off the loaded candy train, laid out like the gold panel.
import { Check } from 'lucide-react';
import { useState } from 'react';
import { CLASSIC_RESOURCES, type ClassicResource, type GameAction, type GameView } from '../../../shared/types';
import { Palette, Panel } from './CornerPanels';
import { tradableLabel } from './tradables';

/** True when the next pick from the candy train is this seat's. */
export const picksCandy = (view: GameView) =>
  view.phase === 'candy' && view.candyLoad?.picks[0]?.playerId === view.selfId;

/** Pick one card from the candy train; each card on it shows how many are left. */
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
  const [choice, setChoice] = useState<ClassicResource | null>(null);
  const load = view.candyLoad!;
  const onTrain = (r: string) => load.cards.filter(c => c === r).length;
  const mine = load.picks.filter(p => p.playerId === view.selfId).length;
  return (
    <Panel
      title="Candy train"
      status={`${mine === 1 ? '1 pick' : `${mine} picks`}${secondsLeft === null ? '' : ` · ${secondsLeft}s`}`}
      action={
        <button
          className="button primary"
          disabled={busy || !choice}
          onClick={() => {
            if (!choice) return;
            send({ type: 'take-candy', resource: choice });
            setChoice(null);
          }}
        >
          <Check size={18} />
          {choice ? `Take ${tradableLabel(choice)}` : 'Choose a card'}
        </button>
      }
    >
      <Palette
        items={[...CLASSIC_RESOURCES]}
        label="Cards on the candy train"
        name={r => `Choose ${tradableLabel(r)} (${onTrain(r)} on the train)`}
        disabled={r => busy || !onTrain(r)}
        pressed={r => choice === r}
        count={onTrain}
        pick={r => setChoice(r as ClassicResource)}
      />
    </Panel>
  );
}
