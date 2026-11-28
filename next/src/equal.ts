// Is this the same as that? For telling whether a drawing's input changed since the last picture, without building a string of it.
/**
 * Plain data (numbers, strings, arrays, objects) is the same when it holds the same things; anything that is the very same object is the same without looking inside (so a list that
 * is kept between pictures costs nothing to compare); a typed array (a mesh's numbers) is the same only if it is the same one.
 */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || ArrayBuffer.isView(a) || ArrayBuffer.isView(b))
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
  const ka = Object.keys(a),
    kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every((k) => k in b && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}
