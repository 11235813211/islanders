import {
  Anchor,
  ArrowLeftRight,
  Ban,
  CircleDot,
  CloudFog,
  Dices,
  Eraser,
  Eye,
  FlaskConical,
  Gauge,
  Gift,
  Hand,
  Hash,
  Layers,
  LayoutGrid,
  Link2,
  ListChecks,
  Map as MapIcon,
  Mountain,
  MousePointerClick,
  Paintbrush,
  Save,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  Snowflake,
  Trash2,
  Undo2,
  Unlink,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { TileIcon } from './BrushPicker';
import { TOOLS } from './tools';

/** One line of editor help: an icon, the keys or clicks it takes, a name, and what it does. */
export interface EditorHelpRow {
  icon: ReactNode;
  keys?: string[];
  title: string;
  text: string;
}

/** A tab of editor help, in its own color (see editor-help.css). */
export interface EditorHelpTab {
  id: 'draw' | 'tools' | 'numbers' | 'land' | 'links' | 'save';
  label: string;
  icon: ReactNode;
  rows: EditorHelpRow[];
}

const ICON = 18;
const MOD = 'Ctrl/⌘';

/** The board editor's help, by topic. The Tools tab comes from the toolbar's own list. */
export const EDITOR_HELP: EditorHelpTab[] = [
  {
    id: 'draw',
    label: 'Draw',
    icon: <Paintbrush size={15} />,
    rows: [
      {
        icon: <TileIcon kind="land" size={22} />,
        keys: ['Shift', 'drag'],
        title: 'Add land',
        text: 'Random land: its terrain is drawn from the mix each game.',
      },
      {
        icon: <TileIcon kind="sea" size={22} />,
        keys: ['Space', 'drag'],
        title: 'Add sea',
        text: 'Paints over anything.',
      },
      {
        icon: <Paintbrush size={ICON} />,
        keys: [MOD, 'drag'],
        title: 'Paint a terrain',
        text: 'Pick the terrain in the Brush menu on the toolbar first.',
      },
      {
        icon: <Eraser size={ICON} />,
        keys: ['Alt', 'drag'],
        title: 'Delete tiles',
        text: 'Drag over the tiles to remove.',
      },
      {
        icon: <Hand size={ICON} />,
        keys: ['Right-drag'],
        title: 'Move the view',
        text: 'Works with any tool. Scroll or pinch to zoom.',
      },
      {
        icon: <Smartphone size={ICON} />,
        title: 'On a phone',
        text: 'Painting needs a keyboard. On a phone you can select tiles, change settings, and preview.',
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: <MousePointerClick size={15} />,
    rows: [
      ...TOOLS.map(t => ({ icon: t.icon, keys: [t.key.toUpperCase()], title: t.label, text: `${t.hint}.` })),
      {
        icon: <SlidersHorizontal size={ICON} />,
        title: 'Settings panel',
        text: 'Select a tile or harbor with Move to change it in the panel on the right.',
      },
      { icon: <Trash2 size={ICON} />, keys: ['Delete'], title: 'Delete the selection', text: 'Esc deselects.' },
    ],
  },
  {
    id: 'numbers',
    label: 'Numbers',
    icon: <Hash size={15} />,
    rows: [
      {
        icon: <Hash size={ICON} />,
        keys: ['Click'],
        title: 'Raise a number',
        text: 'Shift-click lowers it. With a tile selected, ↑ and ↓ (or + and −) do the same.',
      },
      {
        icon: <Dices size={ICON} />,
        title: 'Fill numbers',
        text: 'Gives every tile without a number a balanced one. Press again for a new draw. Clear numbers makes them random again.',
      },
      {
        icon: <ArrowLeftRight size={ICON} />,
        title: 'Equal-odds swap',
        text: 'Each game, set numbers swap with their partner: 2↔12, 3↔11, 4↔10, 5↔9, 6↔8.',
      },
      {
        icon: <CircleDot size={ICON} />,
        title: 'Dot limit',
        text: "In the panel, choose how many dots a tile's random number may have.",
      },
      {
        icon: <Gauge size={ICON} />,
        title: 'Rich or poor islands',
        text: 'Select an island or fog, then lean its random numbers richer or poorer under Random numbers.',
      },
    ],
  },
  {
    id: 'land',
    label: 'Land & harbors',
    icon: <Mountain size={15} />,
    rows: [
      {
        icon: <Layers size={ICON} />,
        title: 'Random land mix',
        text: 'The shares random land is drawn from. Start from a preset: Base, Tropic, Polar, or All.',
      },
      {
        icon: <MapIcon size={ICON} />,
        title: 'Island mix',
        text: 'Select a tile and tick Own mix for this island to give one island its own shares.',
      },
      {
        icon: <Shuffle size={ICON} />,
        title: 'Fill land',
        text: 'Gives every random tile a terrain now, so you can adjust it. Unfill land makes them random again.',
      },
      {
        icon: <Anchor size={ICON} />,
        title: 'Harbors',
        text: 'Use the Harbor tool on a coast edge, or Place harbors to spread them. A board with none gets random harbors each game.',
      },
      {
        icon: <Anchor size={ICON} />,
        title: 'Harbor kinds',
        text: 'Select a harbor to set what it trades. Fill harbor kinds draws them all; the menu beside it limits what random harbors can give.',
      },
      {
        icon: <Ban size={ICON} />,
        title: 'Closed islands',
        text: 'Select a tile and tick No starting settlements to keep setup off its island.',
      },
      {
        icon: <Gift size={ICON} />,
        title: 'Settling bonus',
        text: 'Each player who first settles the island gets +1 to +3 points.',
      },
      {
        icon: <CloudFog size={ICON} />,
        title: 'Fog',
        text: 'Select fog, then set what that fog island hides under Under the fog, as shares or exact counts. Copy to gives the same mix to the other fog islands.',
      },
      { icon: <Snowflake size={ICON} />, title: 'Icebergs', text: 'Set the percent of sea that becomes icebergs.' },
    ],
  },
  {
    id: 'links',
    label: 'Links',
    icon: <Link2 size={15} />,
    rows: [
      {
        icon: <Link2 size={ICON} />,
        keys: ['K'],
        title: 'Link pieces',
        text: 'Pick a letter, then click or drag over random tiles and harbors. Linked pieces get the same resource.',
      },
      { icon: <Ban size={ICON} />, title: 'Not a letter', text: "A tile set to “Not A” gets any resource but A's." },
      { icon: <Unlink size={ICON} />, title: 'Unlink', text: 'Choose Unlink, then click the linked pieces.' },
      {
        icon: <ListChecks size={ICON} />,
        title: 'Link rules',
        text: 'In the panel: keep letters to some terrains (B, C in Mountains or Hills), or make them all different.',
      },
    ],
  },
  {
    id: 'save',
    label: 'Save & test',
    icon: <Save size={15} />,
    rows: [
      { icon: <Save size={ICON} />, keys: [MOD, 'S'], title: 'Save', text: 'Needs you to be signed in.' },
      { icon: <Undo2 size={ICON} />, keys: [MOD, 'Z'], title: 'Undo', text: `${MOD} Shift Z or ${MOD} Y redoes.` },
      {
        icon: <Eye size={ICON} />,
        title: 'Preview',
        text: 'Draws a sample game. New draw draws again; Show fog shows what the fog hides.',
      },
      {
        icon: <FlaskConical size={ICON} />,
        title: 'Play test',
        text: 'Saves, then opens a solo test room on this board.',
      },
      {
        icon: <Users size={ICON} />,
        title: 'Board details',
        text: 'The row under the name: player counts, points to win, and the expansions the board needs.',
      },
      {
        icon: <Layers size={ICON} />,
        title: 'Versions',
        text: 'The + beside the name copies this layout for other player counts. Each version has its own tab.',
      },
      {
        icon: <LayoutGrid size={ICON} />,
        title: 'All boards',
        text: 'Open, copy, or delete boards. Drag a board to move it to another category.',
      },
    ],
  },
];
