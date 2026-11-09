import { SlidersHorizontal } from 'lucide-react';
import type { BoardDesign, DesignKind } from '../../../shared/maps';
import BrushPicker from './BrushPicker';
import type { Tool } from './EditorCanvas';
import FillBar, { type Refill } from './FillBar';
import LinkPicker from './LinkPicker';
import { TOOLS } from './tools';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/**
 * The editor's second row: click tools (move, link, harbor, robber, pirate), the Ctrl/⌘-drag
 * brush, the Link tool's letter, and the fills. Sea, land and delete are drag gestures only.
 */
export default function EditorToolbar({
  design,
  tool,
  setTool,
  brush,
  setBrush,
  linkLetter,
  setLinkLetter,
  edit,
  refill,
  togglePanel,
}: {
  design: BoardDesign;
  tool: Tool;
  setTool: (tool: Tool) => void;
  brush: DesignKind;
  setBrush: (kind: DesignKind) => void;
  linkLetter: string | null;
  setLinkLetter: (letter: string | null) => void;
  edit: Edit;
  refill: Refill;
  togglePanel: () => void;
}) {
  return (
    <div className="editor-tools">
      <div className="editor-tool-group" role="toolbar" aria-label="Tools">
        {TOOLS.map(t => (
          <button
            key={t.tool}
            type="button"
            aria-pressed={tool === t.tool}
            data-tip={`${t.hint} (${t.key.toUpperCase()})`}
            className={t.tool === 'select' ? 'tip-start' : undefined}
            onClick={() => setTool(t.tool)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <BrushPicker brush={brush} setBrush={setBrush} />
      </div>
      {tool === 'link' && (
        <div className="editor-link-letter">
          <LinkPicker design={design} value={linkLetter} change={setLinkLetter} noneLabel="Unlink" />
        </div>
      )}
      <FillBar design={design} edit={edit} refill={refill} />
      <button type="button" className="icon-button editor-panels" aria-label="Show settings" onClick={togglePanel}>
        <SlidersHorizontal size={19} />
      </button>
    </div>
  );
}
