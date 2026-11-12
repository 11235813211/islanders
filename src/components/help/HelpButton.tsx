import { Info } from 'lucide-react';
import { useState } from 'react';
import { useMedia } from '../../hooks/useMedia';
import { GameDialog } from '../TradePanel';
import type { HelpSection } from './helpContent';
import './help.css';

/** Touch screens get "tap" wording; a mouse gets "click". */
const TOUCH = '(pointer: coarse)';

/**
 * The (i) button: opens how-to help for people who know the board game but not this site.
 * `sections` gets whether the screen is a touch screen, so the wording matches the device.
 */
export default function HelpButton({ sections }: { sections: (touch: boolean) => HelpSection[] }) {
  const [open, setOpen] = useState(false);
  const touch = useMedia(TOUCH);
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label="How to play here"
        title="How to play here"
        onClick={() => setOpen(true)}
      >
        <Info size={19} />
      </button>
      {open && (
        <GameDialog title="How to play here" close={() => setOpen(false)}>
          <div className="help-sections">
            {sections(touch).map(section => (
              <section key={section.title}>
                <h3>{section.title}</h3>
                <ul>
                  {section.lines.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </GameDialog>
      )}
    </>
  );
}
