import { type BoardDesign, type BoardVersion, VERSION_FIELDS } from '../../../shared/maps';

/**
 * A board's versions for other player counts. The editor shows one at a time as a whole design:
 * the version's own layout (tiles, harbors, starts, players, points) on the shared settings.
 */

/** The design as the editor shows it for `version` (null: the main layout). */
export function showVersion(design: BoardDesign, version: number | null): BoardDesign {
  const own = version === null ? undefined : design.versions?.[version];
  return own ? { ...design, ...own } : design;
}

const layoutOf = (shown: BoardDesign): BoardVersion =>
  Object.fromEntries(VERSION_FIELDS.map(k => [k, shown[k]]).filter(([, v]) => v !== undefined)) as BoardVersion;

/** Put an edited view back: layout fields into the version, everything else into the shared design. */
export function mergeShown(design: BoardDesign, version: number | null, shown: BoardDesign): BoardDesign {
  if (version === null || !design.versions?.[version]) return { ...shown, versions: design.versions };
  const shared = { ...shown };
  for (const k of VERSION_FIELDS) (shared as Record<string, unknown>)[k] = design[k];
  const versions = design.versions.map((v, i) => (i === version ? layoutOf(shown) : v));
  return { ...shared, versions };
}

/** Apply an edit to the version being shown. */
export function editVersion(
  design: BoardDesign,
  version: number | null,
  change: (shown: BoardDesign) => BoardDesign,
): BoardDesign {
  return mergeShown(design, version, change(showVersion(design, version)));
}

/** A new version copied from the one shown, for the next player counts up (or the whole range when full). */
export function addVersion(design: BoardDesign, from: BoardDesign): BoardDesign {
  const taken = Math.max(design.players.max, ...(design.versions ?? []).map(v => v.players.max));
  const min = Math.min(6, taken + 1);
  const copy = structuredClone(layoutOf(from));
  copy.players = { min, max: 6 };
  return { ...design, versions: [...(design.versions ?? []), copy] };
}

/** Drop one version. */
export function removeVersion(design: BoardDesign, version: number): BoardDesign {
  const versions = (design.versions ?? []).filter((_, i) => i !== version);
  const { versions: _old, ...rest } = design;
  return versions.length ? { ...rest, versions } : rest;
}
