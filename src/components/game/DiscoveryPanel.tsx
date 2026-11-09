import { Check } from 'lucide-react';
import { useState } from 'react';
import { BUILD_COSTS, emptyBag, resourceCount } from '../../../shared/engine';
import { type GameAction, type GameView, RESOURCES, type Resource, type ResourceBag } from '../../../shared/types';
import { ResourceIcon, SEA } from '../../art';
import { RESOURCE_LABELS } from '../ResourceHand';
import { Panel } from './CornerPanels';

const COST = RESOURCES.filter(r => BUILD_COSTS.development[r] > 0);

/** Discoveries cover what you are missing first, then the rest, as the engine does by default. */
function startingChoice(view: GameView, discoveries: number): ResourceBag {
  const covered = emptyBag();
  let left = discoveries;
  for (const r of [...COST].sort((a, b) => view.hand[a] - view.hand[b]))
    if (left > 0) {
      covered[r] = 1;
      left--;
    }
  return covered;
}

/**
 * Buying a development card with jungle discoveries in hand: for each of its three resources,
 * pay with the card or with a discovery.
 */
export default function DiscoveryPanel({
  view,
  discoveries,
  busy,
  send,
  close,
}: {
  view: GameView;
  discoveries: number;
  busy: boolean;
  send: (action: GameAction) => void;
  close: () => void;
}) {
  const [covered, setCovered] = useState(() => startingChoice(view, discoveries));
  const used = resourceCount(covered);
  const payable = COST.every(r => covered[r] || view.hand[r] > 0);
  const choose = (r: Resource, discovery: boolean) => setCovered(c => ({ ...c, [r]: discovery ? 1 : 0 }));
  return (
    <Panel
      title="Buy development card"
      close={close}
      status={`${used} of ${discoveries} discover${discoveries === 1 ? 'y' : 'ies'} used`}
      action={
        <button
          className="button primary"
          disabled={busy || !payable}
          onClick={() => {
            send({ type: 'buy-development', discoveries: covered });
            close();
          }}
        >
          <Check size={18} />
          Buy
        </button>
      }
    >
      <div className="discovery-choices">
        {COST.map(r => (
          <fieldset key={r} className="discovery-choice" aria-label={`Pay ${RESOURCE_LABELS[r]} with`}>
            <ResourceIcon resource={r} size={26} />
            <button
              type="button"
              aria-pressed={!covered[r]}
              disabled={view.hand[r] === 0}
              onClick={() => choose(r, false)}
            >
              Card ({view.hand[r]})
            </button>
            <button
              type="button"
              aria-pressed={!!covered[r]}
              aria-label={`Pay ${RESOURCE_LABELS[r]} with a discovery`}
              disabled={!covered[r] && used >= discoveries}
              onClick={() => choose(r, true)}
            >
              <SEA.DiscoveryIcon size={20} />
              Discovery
            </button>
          </fieldset>
        ))}
      </div>
    </Panel>
  );
}
