// Independent bodies (`dec_independent_bodies`, `in_270`): the final shape is a compound of solids; each solid that stands alone is a body, and a body keeps its name through the history. A body is found again after
// each operation by a marker, a point inside it (the middle of its box, kept up to date): the solid that holds a body's marker is that body, a solid with no marker is a new body (named by the operation that made it), and a
// marker with no solid of its own any more (two bodies joined, one cut away) is gone. Pure geometry on plain numbers and replicad shapes; nothing here leaves the kernel folder.
import { getOC } from "replicad";

// The exact box of a solid takes a tenth of a second for a loft of a thousand faces: kept by the solid's own identity (the same shape, found again in a later result, has the same box), and by a quick box round it, so that
// another solid with the same identity number is never taken for it (`in_446`)
const boxes = new Map();
function roughKey(s) {
  const oc = getOC();
  const b = new oc.Bnd_Box();
  try { oc.BRepBndLib.Add(s.wrapped, b, false); const [a, z] = [b.CornerMin(), b.CornerMax()]; const k = [a.X(), a.Y(), a.Z(), z.X(), z.Y(), z.Z()].map((v) => Math.round(v * 1e6)).join(","); a.delete(); z.delete(); return k; } finally { b.delete(); }
}
/** What tells one solid from another and the same solid found again: its identity number and a quick box (as the exact box is kept below): for what is worked out of a body once and kept (`dec_per_body_checks`). */
export const solidKey = (s) => `${s.hashCode}|${roughKey(s)}`;
export const box = (s) => {
  const key = `${s.hashCode}|${roughKey(s)}`;
  const kept = boxes.get(key);
  if (kept) return { min: [...kept.min], max: [...kept.max] };
  // the exact box of a solid of many faces is far the dearer (a 100 tooth worm wheel: about 3 s, each time one is next to another body; a quick box round it, a little roomier, is a few milliseconds): a body of more than 300 faces is held by the
  // quick box, which is all a marker needs (`in_857`)
  const many = s.faces.length > 300;
  const made = many ? quickBox(s) : (() => { const b = s.boundingBox.bounds; return { min: [...b[0]], max: [...b[1]] }; })();
  boxes.set(key, made);
  while (boxes.size > 400) boxes.delete(boxes.keys().next().value);
  return { min: [...made.min], max: [...made.max] };
};
/** A box round a solid that is quick to find (a little roomier than the exact one for freeform faces). */
function quickBox(s) {
  const oc = getOC();
  const b = new oc.Bnd_Box();
  try { oc.BRepBndLib.Add(s.wrapped, b, false); const [a, z] = [b.CornerMin(), b.CornerMax()]; const out = { min: [a.X(), a.Y(), a.Z()], max: [z.X(), z.Y(), z.Z()] }; a.delete(); z.delete(); return out; } finally { b.delete(); }
}
const centre = (b) => [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
const inside = (b, p, t = 1e-3) => [0, 1, 2].every((i) => p[i] >= b.min[i] - t && p[i] <= b.max[i] + t);

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The index of the box that holds the point, skipping the ones in `claimed`; of several (a body inside the box of another: parts a cut made), the one whose middle is nearest it, as `trackBodies` takes it (`in_298`: the first that held it was the larger body, which moved in place of the smaller). */
const boxHolding = (boxes, p, claimed = new Set()) => {
  let i = -1;
  boxes.forEach((b, k) => { if (!claimed.has(k) && inside(b, p) && (i < 0 || gap(centre(b), p) < gap(centre(boxes[i]), p))) i = k; });
  return i;
};

/** The solids of a shape (a compound of bodies, or a single solid). */
export const lumpsOf = (shape) => shape.solids;

/** Where a marker goes when an operation moves, turns or scales the bodies it names (`only`: one body's id, else all of them). */
export function moveMarkers(markers, tf) {
  if (tf.mode === "reshape") return markers.map((m) => (tf.only && m.id !== tf.only ? m : { ...m, at: tf.at })); // (the body's shape changed: it is found by its new middle)
  const go = (p) => {
    if (tf.mode === "move") { if (tf.vec) return [0, 1, 2].map((i) => p[i] + tf.vec[i]); const q = [...p]; q[tf.axis] += tf.v; return q; }
    const d = [0, 1, 2].map((i) => p[i] - tf.pivot[i]);
    if (tf.mode === "scale") return [0, 1, 2].map((i) => tf.pivot[i] + d[i] * tf.v);
    // a turn of v degrees about the axis through the pivot (the right-hand rule)
    const a = (tf.v * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    if (tf.dir) { // about any axis (Rodrigues): the part along the axis stays, the rest turns
      const l = Math.hypot(...tf.dir) || 1, k = tf.dir.map((x) => x / l);
      const kd = k[0] * d[0] + k[1] * d[1] + k[2] * d[2];
      const cr = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];
      return [0, 1, 2].map((m) => tf.pivot[m] + d[m] * c + cr[m] * s + k[m] * kd * (1 - c));
    }
    const [i, j] = tf.axis === 0 ? [1, 2] : tf.axis === 1 ? [2, 0] : [0, 1];
    const e = [...d];
    e[i] = d[i] * c - d[j] * s;
    e[j] = d[i] * s + d[j] * c;
    return [0, 1, 2].map((k) => tf.pivot[k] + e[k]);
  };
  return markers.map((m) => (tf.only && m.id !== tf.only ? m : { ...m, at: go(m.at) }));
}

/**
 * The bodies of `shape` after an operation made it: `prev` are the markers of what it was made from (already moved, for a move). Returns the markers of this shape in creation order, each with `lump`, the
 * index of its solid in `lumpsOf(shape)`.
 */
export function trackBodies(prev, shape, opId) {
  const lumps = lumpsOf(shape);
  if (!lumps.length) return [];
  if (lumps.length === 1) return [{ id: prev[0]?.id ?? opId, at: centre(quickBox(lumps[0])), lump: 0 }]; // (the marker only has to lie in the body's box: a quick box serves, the exact one of a body of freeform faces takes a third of a second, `dec_speed_rules`)
  const boxes = lumps.map(box);
  const claimed = new Set();
  const out = [];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const m of prev) {
    // the solid whose box holds the marker; of several (bodies that overlap), the one whose middle is nearest it
    let i = -1;
    boxes.forEach((b, k) => { if (!claimed.has(k) && inside(b, m.at) && (i < 0 || dist(centre(b), m.at) < dist(centre(boxes[i]), m.at))) i = k; });
    if (i >= 0) { claimed.add(i); out.push({ id: m.id, at: centre(boxes[i]), lump: i }); }
  }
  let born = 0;
  lumps.forEach((_, k) => { if (!claimed.has(k)) out.push({ id: born++ ? `${opId}.${born - 1}` : opId, at: centre(boxes[k]), lump: k }); });
  return out;
}

/** The solid of `shape` that holds this point (a face or an edge of a body is in its box), with the others, or null when there is only one body or none holds it. */
export function lumpAt(shape, at) {
  const lumps = lumpsOf(shape);
  if (lumps.length < 2) return null;
  const i = boxHolding(lumps.map(box), at);
  return i < 0 ? null : { lump: lumps[i], rest: lumps.filter((_, k) => k !== i) };
}
/** The solid of a body by its name (its marker), with the others. */
export function lumpOf(shape, markers, id) {
  const m = markers.find((x) => x.id === id);
  return m ? lumpAt(shape, m.at) : null;
}

/** The solids of the bodies named by `ids` (in that order), and the solids of the others; null for a name that is not a body of this shape. */
export function lumpsByName(shape, markers, ids) {
  const lumps = lumpsOf(shape);
  const boxes = lumps.map(box);
  const claimed = new Set();
  const picked = [];
  for (const id of ids) {
    const m = markers.find((x) => x.id === id);
    const i = m ? boxHolding(boxes, m.at, claimed) : -1;
    if (i < 0) return null;
    claimed.add(i);
    picked.push(lumps[i]);
  }
  return { picked, rest: lumps.filter((_, k) => !claimed.has(k)) };
}
