// Every number and color of the Christmas look, in one place to tweak. Animation speeds are in
// seconds; counts are per tile. Set a count to 0 to turn that effect off.

export const CHRISTMAS = {
  /** Snow falling over mountain tiles. */
  mountainSnow: {
    flakes: 16,
    /** Seconds for one flake to fall through the tile (each flake varies around this). */
    fall: 6.5,
    /** Sideways drift of a falling flake, in board units. */
    drift: 9,
    size: [1.1, 2.3] as [number, number],
    color: '#ffffff',
  },
  /** A light snowfall over other tiles. 0 for none. */
  lightSnow: {
    flakes: 4,
    fall: 9,
    drift: 6,
    size: [0.9, 1.6] as [number, number],
    color: '#ffffff',
  },
  /** Wind and blowing snow over fields. */
  fieldWind: {
    /** White streaks of wind sweeping across. */
    gusts: 3,
    /** Seconds for one gust to cross the tile. */
    gust: 4.2,
    /** Snowflakes carried sideways by the wind. */
    flakes: 10,
    blow: 3.6,
    size: [1, 1.9] as [number, number],
  },
  /** A string of lights swooping over the hills. */
  hillLights: {
    /** Bulbs along the string. */
    bulbs: 11,
    colors: ['#ff4d4d', '#ffd23f', '#3fd28b', '#4db8ff', '#ff8adf'],
    /** Seconds for one slow twinkle; bulbs start at different times. */
    twinkle: 2.8,
    /** How dim a bulb gets at the bottom of its twinkle (1 = never dims). */
    dimmest: 0.5,
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
  forest: { baubles: ['#e8323c', '#ffd23f', '#4db8ff'], star: '#ffd23f' },
  northPole: {
    pole: '#e2333b',
    ice: '#e9f6fb',
    workshop: '#b3202e',
    roof: '#ffffff',
    light: '#ffd66e',
  },
  /** Santa's flight: seconds to fly from the North Pole to the building. */
  sleigh: { flight: 2.6, hold: 1.4 },
  /** Card faces: holly in a corner and snow along the top. */
  cards: { holly: '#1f7a3a', berry: '#d7263d', snow: '#ffffff' },
} as const;
