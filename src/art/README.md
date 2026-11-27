# Art versions

All board and card illustrations live here, one folder per version. Components
import from `src/art` and never draw art themselves.
- `v1/` is the original art. `v2/` adds piece halos and card colors matched to the tiles.
  `v3/` drops the halos for pieces shaded in their own color. `v4/` refines those pieces (eaves,
  chimney, one outline tone, no shadow); `v5/` adds a mountain chalet style (room setting
  `pieceStyle`). `v6/` models settlements and cities in 3D and draws them in perspective
  (`projection.ts` is the camera, `solids.tsx` the shapes, `pieces.tsx` the pieces); roads are flat.
  `v7/` drops the classic chimneys, makes each city one joined building whose halves share a depth,
  draws cities larger next to settlements, and adds sea maps in `v7/sea/`: one file per tile (ocean, land, gold, jungle, volcano, iceberg) with
  its colors at the top, plus ships, the pirate, and markers. Versions before v7 borrow v7's sea art.
  `v8/` redraws the jungle as dense olive palms and broadleaf canopy, gold as a rocky river gorge
  with a waterfall, and the volcano as a raised basalt cone seen from above at an angle.
  Its crater stays visible above the number token. Other illustrations are preserved from v7.
  `v9/` gives the jungle flat tropical tree silhouettes, fills the gold gorge's sandy surround
  with grass and places its waterfall at the top, and simplifies volcano texture with plain white
  eruption numbers. The raised crater and its space above the number token are preserved.
  `v10/` thins and lightens the volcano's inner crater wall, exposing more of the lava lake.
  `v11/` drops the iceberg tile's pale tint, so its water matches the sea tiles around it.
  `v12/` adds the fog tile (`sea/fog.tsx`; older versions borrow it), draws ships a tenth smaller
  without the dashed wake, and draws classic settlements and cities a tenth larger.
  `v13/` separates forest, wheat, and clay features from their ground so the icon can draw them
  upright on a tilted island. The game tiles retain the same illustrations as v12.
  `v14/` adds Cartographers (`cartographers.tsx`): the lodestone moor tile, card, and icon, relay
  stations, survey ships, and charted numbers. Versions before v14 borrow it (`CARTOGRAPHERS` in index.ts).
  `v15/` redraws the relay station's hut as a small 3D gabled house (the settlement's solids) with no ground
  shadow, its flag on a taller post beside it.
  Survey ships left the game on 2026-11-18 ([archive](../../docs/archive/survey-ships.md)); their drawings stay here.
  `v16/` adds the survey ship's target marker (a small compass rose in the seat's color) and the seam
  down a split tile; older versions borrow both.
  `v17/` gives each building style its own design in `pieces/` (add one to `DESIGNS` in `pieces/index.tsx`).
  Classic and chalet look the same as v16. It adds the Korean style (`korean.ts`), built from palettes of named
  materials, `roofs.ts` (curved roofs from a few numbers), and `timber.ts` (platforms and halls). A design's
  settlement and city share one camera.
  `v19/` adds the megacity (`pieces/megacity.ts`): three buildings in each piece style (Cartographers).
  `v20/` adds the Christmas scenery, winter resource tiles, and gingerbread buildings.
  `v21/` preserves plain Christmas and adds **Christmas Candy**: two candy compositions for each of
  the five base resources (`christmas/candy-tiles.tsx`, shared sweets in `candies.tsx`). The editor's
  Candy art picker saves per-resource A/B votes on this device. The separate room setting
  `christmasCandy` shares Christmas decorations and buildings. `christmas/train.tsx` draws an
  extruded locomotive and candy flatcars on offset rails; `rail-geometry.ts` rounds their bends.
  `v22/` keeps one candy design per resource (the A/B picks, refined): brighter ground with its own
  small snow pockets per terrain (`christmas/candy-ground.tsx`), snowcapped chocolate-kiss mountains,
  uneven bunches of twisted Twizzlers (`twizzlers.tsx`), snow at the cane pairs' feet, gold bells on the
  gumdrops (`candy-bells.tsx`), one run of the page garland lying across the forest floor
  (`candy-garland.tsx`), and lights wound around some Twizzler bunches. `CandyRailways` takes optional
  `roads` and draws a level crossing (road deck over the rails, crossbuck signs) wherever one meets the rails. The editor's Candy art dialog now
  previews the five tiles; v21 keeps the A/B options.
  `v23/` adds Christmas Candy cards: card faces and small icons for the five resources
  (`christmas/candy-cards.tsx`, the same sweets as the tiles), and the start station's sign is a
  little locomotive holding up the train's number (`4/10` when unset). `CandyRailways` now takes
  `tracks` (`designTracks(design)` in the editor; the game passes its board's trains, parked, with
  the loaded cards on the flatcars).
- Review the candy hexes (v22 above the v21 picks) with the train beside roads and buildings:
  `npx playwright test tests/candy-art.spec.ts` writes `test-results/christmas-candy-review.png`.
  `tests/candy-editor.spec.ts` checks authoring, save/reload, votes, animation, and five widths;
  the Christmas Candy cases in `tests/phone.spec.ts` exercise actual touch input.
- Review the sea art large: `npx playwright test tests/sea-art.spec.ts` writes `test-results/sea-art.png`.
  It also writes `sea-art-details.png` and `sea-art-phone.png` with forest comparisons and number tokens.
- Review Cartographers art: `npx playwright test tests/cartographers-art.spec.ts` writes
  `test-results/cartographers-art.png` and `cartographers-art-phone.png`.
- Compare piece art side by side: `npx playwright test tests/art-compare.spec.ts` writes
  `test-results/art-compare.png` (edit the list at the top of that file).
- `index.ts` picks the active version. That one import line is the only thing to change.
- `types.ts` is the contract every version implements (`satisfies ArtPack`), so an old
  version still type-checks and can be switched back on at any time.

## Make a new version

```sh
npm run art:new        # copies the active version to the next vN and switches to it
```

Edit the new folder, keeping older folders untouched.

## Roll back

Change the import in `index.ts` from `./vN` to an older folder, then run `npm run check`.

The home-screen icons and favicon are composed separately, one folder per version in `app-icons/vN/`
(`v1/` also keeps the icons it rendered), using the active art version's real tiles and pieces.
`app-icon.tsx` picks the active icon version, like `index.ts` does for the art. Run `npm run icons` to regenerate `public/icons/*.png` and
`public/favicon.svg`; `tests/install.spec.ts` reviews them at home-screen sizes and with launcher crops.
The saved `app-icons/v1/` includes the previous source, favicon, and all four PNGs. The active `v2/`
uses a tighter crop, upright terrain from v13, wheat in front, and a reflection matched to the sun's
width at the horizon. To restore the saved design, point `app-icon.tsx` at `./app-icons/v1` and regenerate.
