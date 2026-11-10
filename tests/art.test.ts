import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { art as previous } from '../src/art/v12';
import { art as current } from '../src/art/v13';

// Sharing upright features with the install icon must not change the existing game tiles.
it.each(['wood', 'wheat', 'brick'] as const)('keeps the %s tile identical after extracting its features', terrain => {
  const props = { uid: 'art-review', terrain };
  const before = renderToStaticMarkup(createElement(previous.HexTile, props));
  const after = renderToStaticMarkup(createElement(current.HexTile, props));
  expect(after).toBe(before);
});
