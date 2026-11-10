import { Plus, Trash2 } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import type { BoardDesign, FillKind, LinkRule } from '../../../shared/maps';
import { POOL_KINDS } from '../../../shared/maps/validate';
import { TileIcon } from './BrushPicker';
import { linkColor } from './EditorLayer';
import { usedLinks } from './LinkPicker';
import { KIND_LABELS } from './tools';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;
const TERRAINS = POOL_KINDS.filter(k => k !== 'iceberg');

function Letter({ letter }: { letter: string }) {
  return (
    <span className="rule-letter" style={{ '--chip': linkColor(letter) } as CSSProperties}>
      {letter}
    </span>
  );
}

/** One rule in words: "B, C in Mountains or Hills" or "A, B, C all different". */
function RuleText({ rule }: { rule: LinkRule }) {
  return (
    <span className="rule-text">
      {rule.links.map(l => (
        <Letter key={l} letter={l} />
      ))}
      {rule.kind === 'distinct' ? (
        <span>all different</span>
      ) : (
        <span>in {rule.terrains.map(t => KIND_LABELS[t]).join(' or ')}</span>
      )}
    </span>
  );
}

/**
 * Rules between link letters, checked every time the board is drawn: "B, C both in mountains or
 * hills" keeps those letters to some terrains, "A, B, C distinct" gives them different terrains.
 */
export default function LinkRules({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const letters = usedLinks(design);
  const [kind, setKind] = useState<LinkRule['kind']>('in');
  const [picked, setPicked] = useState<string[]>([]);
  const [terrains, setTerrains] = useState<FillKind[]>([]);
  const rules = design.linkRules ?? [];
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
  const ready = kind === 'distinct' ? picked.length >= 2 : picked.length >= 1 && terrains.length >= 1;
  const setRules = (next: LinkRule[]) =>
    edit(d => {
      const { linkRules: _old, ...rest } = d;
      return next.length ? { ...rest, linkRules: next } : rest;
    });
  return (
    <section className="inspector-section" aria-label="Link rules">
      <h3>Link rules</h3>
      {!letters.length && <p className="inspector-hint">Link some tiles first (the Link tool), then add rules here.</p>}
      {rules.map((rule, i) => (
        <div key={i} className="rule-row">
          <RuleText rule={rule} />
          <button
            type="button"
            className="icon-button"
            aria-label="Delete rule"
            onClick={() => setRules(rules.filter((_, j) => j !== i))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {letters.length > 0 && (
        <div className="rule-form">
          <div className="chip-row" role="radiogroup" aria-label="Rule">
            {(['in', 'distinct'] as const).map(k => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                {k === 'in' ? 'In terrains' : 'All different'}
              </button>
            ))}
          </div>
          <fieldset className="chip-row wrap" aria-label="Letters">
            {letters.map(l => (
              <button
                key={l}
                type="button"
                className="link-chip"
                style={{ '--chip': linkColor(l) } as CSSProperties}
                aria-pressed={picked.includes(l)}
                onClick={() => setPicked(p => toggle(p, l))}
              >
                {l}
              </button>
            ))}
          </fieldset>
          {kind === 'in' && (
            <fieldset className="chip-row wrap" aria-label="Terrains">
              {TERRAINS.map(t => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={terrains.includes(t)}
                  aria-label={KIND_LABELS[t]}
                  data-tip={KIND_LABELS[t]}
                  onClick={() => setTerrains(list => toggle(list, t))}
                >
                  <TileIcon kind={t} size={20} />
                </button>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!ready}
            onClick={() => {
              setRules([
                ...rules,
                kind === 'in' ? { kind, links: picked, terrains } : { kind: 'distinct', links: picked },
              ]);
              setPicked([]);
              setTerrains([]);
            }}
          >
            <Plus size={16} />
            Add rule
          </button>
        </div>
      )}
    </section>
  );
}
