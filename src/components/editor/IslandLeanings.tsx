import { HEX_RADIUS, hexCenter } from '../../../shared/board';
import type { BoardDesign, FillKind, NumberLevels } from '../../../shared/maps';
import { islandLevels, islandsOf, randomTerrains } from '../../../shared/maps/numbers';
import { tileKey } from '../../../shared/maps/types';
import { TileIcon } from './BrushPicker';
import { levelName, levelTone } from './levels';
import { KIND_LABELS } from './tools';

/** One island's label: where it sits (board units) and its lines (the terrains on each; none for the island's usual level). */
interface Leaning {
  key: string;
  x: number;
  y: number;
  lines: { kinds: FillKind[]; level: number }[];
}

/**
 * Label lines for an island's levels: the level most of its terrains share, as a bare word (left
 * out when normal), then each other level with the icons of the terrains on it.
 */
function labelLines(levels: NumberLevels, kinds: FillKind[]): Leaning['lines'] {
  const byLevel = new Map<number, FillKind[]>();
  for (const k of kinds) byLevel.set(levels[k] ?? 0, [...(byLevel.get(levels[k] ?? 0) ?? []), k]);
  const usual = [...byLevel].sort((a, b) => b[1].length - a[1].length || Math.abs(a[0]) - Math.abs(b[0]))[0]![0];
  const rest = [...byLevel].filter(([level]) => level !== usual).sort((a, b) => b[0] - a[0]);
  return [...(usual ? [{ kinds: [], level: usual }] : []), ...rest.map(([level, on]) => ({ kinds: on, level }))];
}

/** Islands whose random numbers lean off the usual mix, with a label spot above each one's top row. */
function leanings(design: BoardDesign): Leaning[] {
  return islandsOf(design).flatMap(island => {
    const kinds = randomTerrains(design, island);
    const levels = islandLevels(island);
    if (!kinds.some(k => levels[k])) return [];
    const lines = labelLines(levels, kinds);
    const centers = island.map(t => hexCenter(t.q, t.r));
    const top = Math.min(...centers.map(c => c.y));
    const row = centers.filter(c => c.y === top);
    const x = row.reduce((a, c) => a + c.x, 0) / row.length;
    return [{ key: tileKey(island[0]!.q, island[0]!.r), x, y: top - HEX_RADIUS, lines }];
  });
}

/**
 * Small labels over islands whose random numbers are richer or poorer than usual: the island's
 * usual level, then the terrains that differ. They sit above each island and fade while the pointer is over them; presses
 * pass through to the canvas.
 */
export default function IslandLeanings({
  design,
  view,
  size,
}: {
  design: BoardDesign;
  view: { cx: number; cy: number; scale: number };
  size: { width: number; height: number };
}) {
  const noEnds = !!design.noTwoTwelve;
  return (
    <div className="island-leanings" aria-hidden="true">
      {leanings(design).map(({ key, x, y, lines }) => (
        <div
          key={key}
          className="island-leaning"
          style={{
            left: (x - view.cx) * view.scale + size.width / 2,
            top: (y - view.cy) * view.scale + size.height / 2 - 4,
          }}
        >
          {lines.map(({ kinds, level }) => (
            <span key={level} className={levelTone(level)} title={kinds.map(k => KIND_LABELS[k]).join(', ')}>
              {kinds.map(k => (
                <TileIcon key={k} kind={k} size={14} />
              ))}
              {levelName(level, noEnds)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
