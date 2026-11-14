import { Flag, ListOrdered, type LucideIcon, PackagePlus } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  type BoardDesign,
  boardExpansions,
  layoutsOf,
  type RouteZone,
  rulesOf,
  type SpecialRule,
  specialRules,
} from '../../../shared/maps';
import { ZONE_STYLE } from '../RouteZones';
import './special-rules.css';

/** Each kind of special rule's icon, short tag, and color, so cards and the detail view match. */
export const SPECIAL_KINDS: Record<SpecialRule['kind'], { icon: LucideIcon; tag: string; color: string }> = {
  setup: { icon: ListOrdered, tag: 'Setup', color: '#7a45ff' },
  rewards: { icon: PackagePlus, tag: 'Extra pieces', color: '#0f7f8f' },
  routes: { icon: Flag, tag: 'Route', color: '#1b8f37' },
};

/** The special rules of every layout of a board (a route may be drawn on only some of them). */
function kindsOf(design: BoardDesign): SpecialRule['kind'][] {
  const kinds = new Set(layoutsOf(design).flatMap(layout => specialRules(rulesOf(layout)).map(r => r.kind)));
  return (Object.keys(SPECIAL_KINDS) as SpecialRule['kind'][]).filter(k => kinds.has(k));
}

/** Small icon tags on a map card naming its special rules. */
export function SpecialTags({ design }: { design: BoardDesign }) {
  const kinds = kindsOf(design);
  if (!kinds.length) return null;
  return (
    <span className="special-tags" title="Special rules">
      {kinds.map(kind => {
        const { icon: Icon, tag, color } = SPECIAL_KINDS[kind];
        return (
          <span key={kind} className="special-tag" style={{ '--special-color': color } as CSSProperties}>
            <Icon size={13} aria-hidden="true" />
            {tag}
          </span>
        );
      })}
    </span>
  );
}

/** A swatch for each route area, matching the outlines on the map. */
function ZoneLegend() {
  return (
    <ul className="zone-legend" aria-label="Route areas">
      {(['start', 'next', 'finish'] as RouteZone[]).map(zone => (
        <li key={zone} style={{ '--zone-color': ZONE_STYLE[zone].color } as CSSProperties}>
          <span className={`zone-swatch zone-${zone}`} aria-hidden="true" />
          {ZONE_STYLE[zone].name}
        </li>
      ))}
    </ul>
  );
}

/** The layout's special rules, each in a colored card with its icon, for the map detail view. */
export default function SpecialRulesList({ layout, design }: { layout: BoardDesign; design: BoardDesign }) {
  const rules = specialRules(rulesOf(layout), boardExpansions(design).includes('seafarers'));
  if (!rules.length) return null;
  return (
    <section className="special-rules" aria-label="Special rules">
      <h4>Special rules</h4>
      {rules.map(rule => {
        const { icon: Icon, color } = SPECIAL_KINDS[rule.kind];
        return (
          <article key={rule.kind} className="special-rule" style={{ '--special-color': color } as CSSProperties}>
            <h5>
              <Icon size={16} aria-hidden="true" />
              {rule.title}
            </h5>
            <ul>
              {rule.lines.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {rule.kind === 'routes' && <ZoneLegend />}
          </article>
        );
      })}
    </section>
  );
}
