// Where the constraint and measure bubbles stand on the screen (`in_061`, `in_151`, `in_259`): each sits up and to the right of the spot it belongs to, clear of the drawn lines and corners, of the bubbles already put
// down, and of anything higher up that is in the way (`rects`); bubbles that fall on one spot are laid side by side. Pure: pixels in, pixels out, so it can be tested without a page.
// A bubble keeps the place it had while that place is still clear (`memory`): the search for a clear place used to start again every frame, so a bubble jumped between the places round its spot as the camera turned.

export const GAP = 4;
const CLUSTER_PX = 34; // bubbles closer than this on the screen are laid side by side
const OFF_X = 14;
const OFF_Y = 24;

export interface Want { id: string; /** where the thing it belongs to is on the page */ x: number; y: number; /** how wide the bubble is */ w: number }
export interface Obstacles {
  /** the drawn lines (a bubble keeps off them) */
  lines: [[number, number], [number, number]][];
  /** the drawn corners */
  dots: [number, number][];
  /** boxes of things that come before the bubbles (left, top, right, bottom): the ring of the menu, the number being typed */
  rects?: [number, number, number, number][];
}
/** Where each bubble went last time: its offset from where it belongs. */
/** [x, y, how many frames in a row its own place (up and to the right) has been clear while it stands elsewhere] */
export type Memory = Map<string, [number, number, number]>;
/** A bubble that gave way goes back to its own place once that has been clear for this many frames in a row (`in_264`): not at the first clear frame, or it would hop as a line sweeps past. */
const BACK_AFTER = 10;
/** `faded`: no clear place within reach, and it is still under something that comes first (it is shown faint and takes no clicks until a place clears, `in_260`) */
export interface Put { id: string; left: number; top: number; faded: boolean }

/** Does the segment a-c pass through the rectangle (Liang-Barsky clipping)? */
function crosses(a: [number, number], c: [number, number], r: [number, number, number, number]): boolean {
  let [t0, t1] = [0, 1];
  const [dx, dy] = [c[0] - a[0], c[1] - a[1]];
  for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[2] - a[0]], [-dy, a[1] - r[1]], [dy, r[3] - a[1]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/** The place of every bubble, in the order given; `memory` is read and updated. */
export function placeBubbles(want: readonly Want[], obs: Obstacles, memory: Memory): Put[] {
  const taken: [number, number, number, number][] = [];
  const boxes = obs.lines.map(([a, c]) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])] as [number, number, number, number]);
  /** How badly a box is in the way: a corner under it, a line through it, a bubble already there, something that comes first. 0 is clear. */
  const hits = (r: [number, number, number, number]) => {
    let n = 0;
    for (const [x, y] of obs.dots) if (x > r[0] - 4 && x < r[2] + 4 && y > r[1] - 4 && y < r[3] + 4) n += 2;
    const big: [number, number, number, number] = [r[0] - 3, r[1] - 3, r[2] + 3, r[3] + 3];
    for (let k = 0; k < obs.lines.length; k++) {
      const bx = boxes[k]!;
      if (bx[2] < big[0] || bx[0] > big[2] || bx[3] < big[1] || bx[1] > big[3]) continue; // (nowhere near)
      if (crosses(obs.lines[k]![0], obs.lines[k]![1], big)) n++;
    }
    for (const t of taken) if (r[0] < t[2] + 3 && r[2] > t[0] - 3 && r[1] < t[3] + 3 && r[3] > t[1] - 3) n += 3;
    for (const t of obs.rects ?? []) if (r[0] < t[2] + 3 && r[2] > t[0] - 3 && r[1] < t[3] + 3 && r[3] > t[1] - 3) n += 5; // (the ring and the number being typed come first: a bubble gives way to them)
    return n;
  };
  const out: Put[] = [];
  const used = new Set<number>();
  const seen = new Set<string>();
  want.forEach((p, i) => {
    if (used.has(i)) return;
    const group = [i];
    want.forEach((q, j) => { if (j !== i && !used.has(j) && Math.hypot(q.x - p.x, q.y - p.y) < CLUSTER_PX) group.push(j); });
    group.forEach((j) => used.add(j));
    const total = group.reduce((s, j) => s + want[j]!.w, 0) + GAP * (group.length - 1);
    const cx = group.reduce((s, j) => s + want[j]!.x, 0) / group.length;
    const cy = group.reduce((s, j) => s + want[j]!.y, 0) / group.length;
    const rectAt = (x: number, y: number): [number, number, number, number] => { const left0 = cx - total / 2 + x; return [left0, cy + y - 13, left0 + total, cy + y + 13]; };
    // the place it had last time (the first of the group that was somewhere), kept while it is still clear: it moves only when something comes to be in the way
    const home: [number, number] = [Math.round(Math.cos(Math.PI / 4) * (OFF_Y + 4)), -Math.round(Math.sin(Math.PI / 4) * (OFF_Y + 4))];
    const before = group.map((j) => memory.get(want[j]!.id)).find((m) => !!m);
    let [ox, oy] = before ?? [OFF_X, -OFF_Y];
    let worst = before ? hits(rectAt(before[0], before[1])) : Infinity;
    let clear = 0;
    if (before && (before[0] !== home[0] || before[1] !== home[1])) {
      // it is somewhere else because something was in the way: back to its own place once that is clear for a while
      clear = hits(rectAt(home[0], home[1])) === 0 ? before[2] + 1 : 0;
      if (clear >= BACK_AFTER) { [ox, oy] = home; worst = 0; clear = 0; }
    }
    if (worst > 0) {
      // the spot beside the bubbles' own that touches the least: up and to the right first, then round, then further out (a candidate must be clearer than the place it has, to be moved to)
      search: for (const R of [OFF_Y + 4, 48, 72]) {
        for (const deg of [45, 135, 0, 90, 315, 225, 180, 270]) {
          const x = Math.round(Math.cos((deg * Math.PI) / 180) * R);
          const y = -Math.round(Math.sin((deg * Math.PI) / 180) * R);
          const n = hits(rectAt(x, y));
          if (n < worst) { worst = n; [ox, oy] = [x, y]; }
          if (n === 0) break search;
        }
      }
    }
    const r = rectAt(ox, oy);
    const faded = (obs.rects ?? []).some((t) => r[0] < t[2] + 3 && r[2] > t[0] - 3 && r[1] < t[3] + 3 && r[3] > t[1] - 3);
    taken.push(r);
    let left = cx - total / 2;
    group.forEach((j) => {
      const q = want[j]!;
      memory.set(q.id, [ox, oy, clear]);
      seen.add(q.id);
      out.push({ id: q.id, left: left + ox, top: cy + oy - 13, faded });
      left += q.w + GAP;
    });
  });
  for (const id of [...memory.keys()]) if (!seen.has(id)) memory.delete(id); // (a bubble that is gone forgets where it was)
  return out;
}

/** The height of one step of a column of numbers (a bubble and a gap), px. */
const STACK_STEP = 38;
/**
 * How far down (px; up when negative) the bubble at `index` of a column of `count` stands from where the column begins, `y` px from the top of a page `height` px high (`in_320`, `in_327`):
 * a column goes down, but when it would run off the bottom and there is room above, it goes up.
 */
export function stackOffset(y: number, index: number, count: number, height: number): number {
  const down = y + (count - 1) * STACK_STEP + 30 > height; // (the last bubble's bottom is past the page)
  const room = y - (count - 1) * STACK_STEP >= 0; // (and the column fits above)
  return (down && room ? 0 - index : index) * STACK_STEP;
}

const distToSegment = (p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
/**
 * Where a round mark of `radius` px that belongs at `at` stands so that it does not cover the lines `segs` (the handles of the helper, `in_334`) or the discs `discs` (the drag icons of a finger, `in_336`): where it is when it is clear, else the nearest of the places round it
 * (a ring of eight directions, then a wider one) that is; where it is if none is. The mark keeps hold of its face by staying near it.
 */
export function clearOfLines(at: readonly [number, number], segs: readonly (readonly [readonly [number, number], readonly [number, number]])[], radius: number, discs: readonly (readonly [number, number, number])[] = []): [number, number] {
  const clear = (p: readonly [number, number]) => segs.every(([a, b]) => distToSegment(p, a, b) >= radius + 3) && discs.every(([x, y, r]) => Math.hypot(p[0] - x, p[1] - y) >= radius + r); // (`discs`: the drag icons of a finger, which a mark must not stand on)
  if (clear(at)) return [at[0], at[1]];
  for (const k of [1.9, 2.8]) {
    for (let i = 0; i < 8; i++) { // (above first, then round)
      const t = -Math.PI / 2 + (i / 8) * Math.PI * 2;
      const q: [number, number] = [at[0] + Math.cos(t) * radius * k, at[1] + Math.sin(t) * radius * k];
      if (clear(q)) return q;
    }
  }
  return [at[0], at[1]];
}
