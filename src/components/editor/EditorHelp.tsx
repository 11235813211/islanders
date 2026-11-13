import { Info } from 'lucide-react';
import { useState } from 'react';
import { GameDialog } from '../TradePanel';
import { EDITOR_HELP, type EditorHelpRow, type EditorHelpTab } from './editorHelpContent';
import './editor-help.css';

/** The keys or clicks a row takes, as key caps joined by "+". */
function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="editor-help-keys">
      {keys.map((key, i) => (
        <span key={key}>
          {i > 0 && <span className="editor-help-plus">+</span>}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

function Row({ row }: { row: EditorHelpRow }) {
  return (
    <li className="editor-help-row">
      <span className="editor-help-icon" aria-hidden="true">
        {row.icon}
      </span>
      <div className="editor-help-text">
        <div className="editor-help-title">
          <strong>{row.title}</strong>
          {row.keys && <Keys keys={row.keys} />}
        </div>
        <p>{row.text}</p>
      </div>
    </li>
  );
}

/** The (i) button in the board editor's top bar: how to draw and set up a board, by topic. */
export default function EditorHelp() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<EditorHelpTab['id']>('draw');
  const shown = EDITOR_HELP.find(t => t.id === tab)!;
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label="How to use the board editor"
        title="How to use the board editor"
        onClick={() => setOpen(true)}
      >
        <Info size={18} />
      </button>
      {open && (
        <GameDialog title="Board editor" close={() => setOpen(false)}>
          <div className="editor-help-tabs" role="tablist" aria-label="Help topics">
            {EDITOR_HELP.map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className={`editor-help-tab ehelp-${t.id}`}
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <ul className={`editor-help-rows ehelp-${tab}`} role="tabpanel" aria-label={shown.label}>
            {shown.rows.map(row => (
              <Row key={row.title} row={row} />
            ))}
          </ul>
        </GameDialog>
      )}
    </>
  );
}
