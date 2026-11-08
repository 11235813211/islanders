import { Anchor, Eraser, Mountain, MousePointer2, Paintbrush, Sailboat, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BoardLibrary } from '../../../shared/maps';
import type { Tool } from './EditorCanvas';

/** Editor tools, their keyboard shortcuts, and helpers for naming new boards. */
export const TOOLS: { tool: Tool; key: string; label: string; icon: ReactNode; hint: string }[] = [
  {
    tool: 'select',
    key: 'v',
    label: 'Select',
    icon: <MousePointer2 size={17} />,
    hint: 'Click to select; drag outward to add sea',
  },
  { tool: 'land', key: 'l', label: 'Land', icon: <Mountain size={17} />, hint: 'Paint random land (or hold Shift)' },
  {
    tool: 'brush',
    key: 'b',
    label: 'Paint',
    icon: <Paintbrush size={17} />,
    hint: 'Paint the brush terrain (or hold Ctrl/⌘)',
  },
  { tool: 'erase', key: 'e', label: 'Delete', icon: <Eraser size={17} />, hint: 'Delete tiles (or hold Alt/Option)' },
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
