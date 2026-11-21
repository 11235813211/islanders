import {
  Anchor,
  Anvil,
  Bomb,
  Church,
  Coins,
  Construction,
  Crown,
  Drama,
  Droplets,
  Eye,
  FlaskConical,
  Hammer,
  Handshake,
  Heart,
  Landmark,
  Lightbulb,
  type LucideIcon,
  Pickaxe,
  Pill,
  Printer,
  Route,
  Scale,
  ScrollText,
  Ship,
  Store,
  Swords,
  UserMinus,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { Track } from '../../../shared/knights';
import { PROGRESS, PROGRESS_KINDS, type ProgressKind } from '../../../shared/knights';
import type { GameView } from '../../../shared/types';
import { KNIGHTS } from '../../art';
import { CardGroup, groupTurn, stackCards } from '../ResourceHand';

/** Names short enough for a card in the hand; the full name is in its label and tooltip. */
const SHORT: Record<ProgressKind, string> = {
  alchemist: 'Alchemy',
  inventor: 'Inventor',
  crane: 'Crane',
  engineer: 'Engineer',
  irrigation: 'Irrigate',
  medicine: 'Medicine',
  mining: 'Mining',
  printer: 'Printer',
  'road-building': 'Roads',
  smith: 'Smith',
  'commercial-harbor': 'Harbor',
  'master-merchant': 'Master',
  merchant: 'Merchant',
  'merchant-fleet': 'Fleet',
  'resource-monopoly': 'Monopoly',
  'trade-monopoly': 'Trade',
  bishop: 'Bishop',
  constitution: 'Charter',
  deserter: 'Deserter',
  diplomat: 'Diplomat',
  intrigue: 'Intrigue',
  saboteur: 'Saboteur',
  spy: 'Spy',
  warlord: 'Warlord',
  wedding: 'Wedding',
};

/** Each card's own picture, so cards of one color tell apart in a compact hand. */
const CARD_ICON: Record<ProgressKind, LucideIcon> = {
  alchemist: FlaskConical,
  inventor: Lightbulb,
  crane: Construction,
  engineer: Hammer,
  irrigation: Droplets,
  medicine: Pill,
  mining: Pickaxe,
  printer: Printer,
  'road-building': Route,
  smith: Anvil,
  'commercial-harbor': Anchor,
  'master-merchant': Crown,
  merchant: Store,
  'merchant-fleet': Ship,
  'resource-monopoly': Coins,
  'trade-monopoly': Scale,
  bishop: Church,
  constitution: ScrollText,
  deserter: UserMinus,
  diplomat: Handshake,
  intrigue: Drama,
  saboteur: Bomb,
  spy: Eye,
  warlord: Swords,
  wedding: Heart,
};

/** Each track's mark on its cards. */
const TRACK_ICON: Record<Track, (size: number) => ReactNode> = {
  trade: size => <Coins size={size} />,
  politics: size => <Landmark size={size} />,
  science: size => <FlaskConical size={size} />,
};

function cardIcon(kind: ProgressKind) {
  const Icon = CARD_ICON[kind];
  return <Icon size={26} />;
}

/** The card's track color, read by knights.css. */
function trackStyle(kind: ProgressKind, index: number, count: number): CSSProperties {
  const color = KNIGHTS.trackColors[PROGRESS[kind].track];
  return {
    ...groupTurn(index, count),
    '--card': color.base,
    '--card-light': color.light,
    '--card-dark': color.dark,
  } as CSSProperties;
}

/** Progress cards in the hand row, one stack per kind, in the track's color. Playable ones glow; a tap opens the card. */
export default function ProgressHand({ view, open }: { view: GameView; open: (cardId: string) => void }) {
  const hand = view.ck?.hand ?? [];
  const kinds = PROGRESS_KINDS.filter(kind => hand.some(c => c.kind === kind));
  return (
    <>
      {kinds.map((kind, index) => {
        const cards = hand.filter(c => c.kind === kind);
        const playable = cards.find(c => view.ck!.legal.playable.includes(c.id));
        const info = PROGRESS[kind];
        return (
          <CardGroup
            key={kind}
            className={`cards-dev cards-progress${index === 0 ? ' cards-dev-first' : ''}${playable ? ' cards-dev-ready' : ''}`}
            style={trackStyle(kind, index, kinds.length)}
            cards={stackCards(kind, cards.length)}
            count={cards.length}
            label={SHORT[kind]}
            corner={TRACK_ICON[info.track](11)}
            art={<span className="cards-dev-art">{cardIcon(kind)}</span>}
            ariaLabel={`${info.name} (${cards.length})${playable ? ', ready to play' : ''}`}
            title={`${info.name}: ${info.text}`}
            disabled={false}
            onClick={() => open((playable ?? cards[0]!).id)}
          />
        );
      })}
    </>
  );
}
