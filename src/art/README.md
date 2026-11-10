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
- Review the sea art large: `npx playwright test tests/sea-art.spec.ts` writes `test-results/sea-art.png`.
  It also writes `sea-art-details.png` and `sea-art-phone.png` with forest comparisons and number tokens.
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
