/**
 * A deep copy of plain data (objects, arrays, primitives), as game states and views are: they are
 * stored and sent as JSON. Several times faster than structuredClone on many small objects, which
 * made it the largest cost of every move.
 */
export function copyData<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = copyData(value[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const key in value) out[key] = copyData((value as Record<string, unknown>)[key]);
  return out as T;
}

/**
 * A copy of plain data with one player id swapped for another everywhere it appears (as a value or
 * an object key). Player ids are random, so a text replacement over the JSON touches nothing else.
 */
export function renameId<T>(value: T, from: string, to: string): T {
  return JSON.parse(JSON.stringify(value).replaceAll(JSON.stringify(from), JSON.stringify(to))) as T;
}
