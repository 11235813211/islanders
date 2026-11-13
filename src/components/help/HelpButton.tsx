import { Info } from 'lucide-react';
import { useState } from 'react';
import { useMedia } from '../../hooks/useMedia';
import { GameDialog } from '../TradePanel';
import { HELP_TABS, type HelpSection, type HelpTab } from './helpContent';
import './help.css';

/** Touch screens get "tap" wording; a mouse gets "click". */
const TOUCH = '(pointer: coarse)';

/**
 * The (i) button: help for people who know the board game but not this site. Tabs split how to
 * play here from the rules of the base game and each expansion, each tab in its own color.
 * `sections` gets whether the screen is a touch screen, so the wording matches the device.
 */
export default function HelpButton({ sections }: { sections: (touch: boolean) => HelpSection[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HelpTab>('ui');
  const touch = useMedia(TOUCH);
  const all = open ? sections(touch) : [];
  const shown = all.filter(section => (section.tab ?? 'ui') === tab);
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
          <div className="help-tabs" role="tablist" aria-label="Help topics">
            {HELP_TABS.filter(t => all.some(s => (s.tab ?? 'ui') === t.id)).map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className={`help-tab help-${t.id}`}
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className={`help-sections help-${tab}`} role="tabpanel">
            {shown.map(section => (
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
