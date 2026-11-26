// Every number and color of the Christmas look, in one place to tweak. Tiles are still; a tile
// plays its motion once when it pays out on a roll. Times are in seconds; counts are per tile.

export const CHRISTMAS = {
  /** Snowflakes: still ones on the tiles, and ones that fall on a mountain when it pays out. */
  flakes: {
    color: '#ffffff',
    /** A pale blue edge so flakes show on snow. */
    edge: '#9cc4dc',
    glint: '#fffbe0',
    /** Across, in board units (each flake varies between these). */
    size: [4, 7] as [number, number],
    /** Still flakes on each tile kind (fields have none: just wind). */
    still: { wood: 2, sheep: 2, wheat: 0, brick: 2, ore: 4, desert: 3 },
    /** Flakes that fall on a mountain that pays out. */
    falling: 12,
    /** Seconds for one flake to fall through the tile. */
    fall: 2.6,
    /** Sideways drift of a falling flake, in board units. */
    drift: 9,
  },
  /** Wind over fields: still white streaks that sweep across when the field pays out. */
  fieldWind: {
    gusts: 3,
    /** Seconds for one gust to cross the tile. */
    gust: 2.4,
  },
  /** A string of lights swooping over the hills. */
  hillLights: {
    /** How far the wire dips between bulbs (board units); small keeps it taut. */
    sag: 1,
    colors: ['#ff4d4d', '#ffd23f', '#3fd28b', '#4db8ff', '#ff8adf'],
    /** Seconds for one twinkle when the hill pays out. */
    twinkle: 0.45,
    /** How dim a bulb gets at the bottom of its twinkle (1 = never dims). */
    dimmest: 0.35,
    wire: '#2f3b2c',
  },
  /** Reindeer grazing on pasture tiles. */
  reindeer: {
    fur: '#9a6538',
    furDark: '#6e4423',
    belly: '#e9d1ae',
    antler: '#e8d3a8',
    nose: '#2b1a12',
    /** One reindeer on each pasture gets the red nose. */
    rudolph: '#ff3b30',
    scarf: '#d7263d',
  },
  /** Ground colors under the snow; each tile keeps its own hue so it still reads. */
  snow: { light: '#ffffff', shade: '#dfeaf2', blue: '#c4d8e6' },
  /** Fields: warm snow on the gold, so the tile stays a field. */
  fields: { snow: '#fff8e8', furrow: '#fff0c4' },
  /** The desert frozen through. */
  frozen: { ground: '#d5eaf4', drift: '#e6f3f9', pond: '#9fcde3', pondLight: '#c4e4f2', shard: '#bfe3f3' },
  polarBear: { fur: '#fbfbf8', shade: '#e3ecf1', line: '#a9bccb', ear: '#e8bcbc', scarf: '#2f8f4e' },
  /** The Grinch, peeking from behind one mountain per board. */
  grinch: { size: 0.68, fur: '#8cc63f', furDark: '#5e8f22', brow: '#2f4a12', eye: '#ffe14d', pupil: '#c62828' },
  forest: { baubles: ['#e8323c', '#ffd23f', '#4db8ff'], star: '#ffd23f' },
  northPole: {
    pole: '#e2333b',
    ice: '#e9f6fb',
    workshop: '#b3202e',
    roof: '#ffffff',
    light: '#ffd66e',
  },
  /** Santa's flight: seconds to fly from the North Pole to the building, to stay, and its size on the board. */
  sleigh: { flight: 2.6, hold: 1.4, scale: 1 },
  /** Card faces: holly in a corner and snow along the top. */
  cards: { holly: '#1f7a3a', berry: '#d7263d', snow: '#ffffff' },
} as const;
