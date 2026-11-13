import { Anchor, Ban, Hand, Link2, Sailboat, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BoardLibrary, DesignKind } from '../../../shared/maps';
import type { Tool } from './EditorCanvas';

/** Editor tools, their keyboard shortcuts, and helpers for naming new boards. */
export const TOOLS: { tool: Tool; key: string; label: string; icon: ReactNode; hint: string }[] = [
  {
    tool: 'select',
    key: 'v',
    label: 'Move',
    icon: <Hand size={17} />,
    hint: 'Click to select, drag to move the view, scroll to zoom',
  },
  {
    tool: 'link',
    key: 'k',
    label: 'Link',
    icon: <Link2 size={17} />,
    hint: 'Click or drag over random tiles and harbors to give them the same resource',
  },
  {
    tool: 'nostart',
    key: 'n',
    label: 'No start',
    icon: <Ban size={17} />,
    hint: 'Click a corner so no starting settlement may go there (click again to clear)',
  },
  {
    tool: 'harbor',
    key: 'h',
    label: 'Harbor',
    icon: <Anchor size={17} />,
    hint: 'Click a coast edge to add or remove a harbor',
  },
  {
    tool: 'robber',
    key: 'r',
    label: 'Robber',
    icon: <UserRound size={17} />,
    hint: 'Click land to set where the robber starts',
  },
  {
    tool: 'pirate',
    key: 'p',
    label: 'Pirate',
    icon: <Sailboat size={17} />,
    hint: 'Click sea to set where the pirate starts',
  },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'board';
/** A board id from its name that no other board uses. */
export const freshId = (library: BoardLibrary, name: string) => {
  const base = slug(name);
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (!library.boards.some(b => b.id === id)) return id;
  }
};
export const typing = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

/** Terrains in the order the picker shows them. `land` means "random" when the game is set up. */
export const KIND_ORDER: DesignKind[] = [
  'land',
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'lodestone',
  'desert',
  'gold',
  'jungle',
  'volcano',
  'sea',
  'iceberg',
  'fog',
];

/** Short names for the terrain picker (the full names are tooltips). */
export const KIND_LABELS: Record<DesignKind, string> = {
  land: 'Random land',
  wood: 'Forest',
  brick: 'Hills',
  sheep: 'Pasture',
  wheat: 'Fields',
  ore: 'Mountains',
  lodestone: 'Lodestone',
  desert: 'Desert',
  gold: 'Gold',
  jungle: 'Jungle',
  volcano: 'Volcano',
  sea: 'Sea',
  iceberg: 'Iceberg',
  fog: 'Fog',
};
