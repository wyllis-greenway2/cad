// Which outline segments move with a dragged body when the mesh holds several (`in_273`, `in_275`). Pure: numbers in, numbers out.
// A segment is the dragged body's when both its ends are corners of the dragged body's triangles and not both are corners of the other bodies' triangles: two bodies that overlap draw their own outlines,
// and a body's edge that happens to lie inside the dragged body's box stays where it is.

const key = (a: ArrayLike<number>, i: number) => `${Math.round(a[i]! * 1e3)},${Math.round(a[i + 1]! * 1e3)},${Math.round(a[i + 2]! * 1e3)}`;

/** `segments`: x y z of both ends, one segment after another; `vertices`: the mesh's corners; `moving` and `rest`: index lists (corner numbers) of the dragged body's triangles and of the others'. */
export function ownSegments(segments: ArrayLike<number>, vertices: ArrayLike<number>, moving: ArrayLike<number>, rest: ArrayLike<number>): { go: number[]; stay: number[] } {
  const keys = (index: ArrayLike<number>): Set<string> => { const k = new Set<string>(); for (let i = 0; i < index.length; i++) k.add(key(vertices, 3 * index[i]!)); return k; };
  const mine = keys(moving);
  const others = keys(rest);
  const go: number[] = [];
  const stay: number[] = [];
  for (let i = 0; i + 1 < segments.length / 3; i += 2) {
    const [ka, kb] = [key(segments, 3 * i), key(segments, 3 * (i + 1))];
    const own = mine.has(ka) && mine.has(kb) && !(others.has(ka) && others.has(kb));
    const target = own ? go : stay;
    for (let k = 0; k < 6; k++) target.push(segments[3 * i + k]!);
  }
  return { go, stay };
}
