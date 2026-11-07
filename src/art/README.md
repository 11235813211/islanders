# Art versions

All board and card illustrations live here, one folder per version. Components
import from `src/art` and never draw art themselves.
- `v1/` is the original art. `v2/` adds piece halos and card colors matched to the tiles.
  `v3/` drops the halos for pieces shaded in their own color. `v4/` refines those pieces (eaves,
  chimney, one outline tone, no shadow); `v5/` is a Swiss chalet take on the same construction.
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

The favicon (`public/favicon.svg`) is separate from these versions.
