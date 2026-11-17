// Drawings of the hardware for the pickers (`dec_parts_interface`, `in_811`): small line drawings of a part (its side view and its top view) and of a hole's cross-section, made from the real dimensions so a picture is of the size it
// says. Pure: numbers in, an SVG string out (inline, drawn in the text colour, made here and never from what a person typed).
import type { FastenerFamily, FastenerSize, ReceiverKind, ClearanceFit } from "../operation/fasteners.ts";
import { nutDims, washerDims, countersunkDims, socketHeadDims, countersunkProfile, socketHeadProfile, hexagon, receiverProfile, clearanceHole, nutTrap } from "../operation/fasteners.ts";

type Pt = readonly [number, number];
const r2 = (n: number): string => String(Math.round(n * 100) / 100);
const path = (pts: readonly Pt[], close = true): string => `M${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L")}${close ? "Z" : ""}`;
const STROKE = 'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"';
const FILL = 'fill="currentColor" fill-opacity=".08"';
const svgOf = (w: number, h: number, body: string, px: number, py: number): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(-w / 2)} ${r2(-h / 2)} ${r2(w)} ${r2(h)}" width="${px}" height="${py}" fill="none" aria-hidden="true" style="color:#33363d">${body}</svg>`;
/** A shape of mm coordinates (y down) moved by `dx`, `dy`. */
const at = (pts: readonly Pt[], dx: number, dy: number): Pt[] => pts.map(([x, y]) => [x + dx, y + dy] as const);
const GAP = 0.45; // (the space between two views, as a share of the biggest size)

/** The views of a part, side by side: the side view and, to its right, the top view. `length` is the screw's. Returns the SVG at `px` x `py` pixels. */
export function partDrawing(family: FastenerFamily, size: FastenerSize, length: number, smooth: boolean, px = 150, py = 96): string {
  const d = Number(size.slice(1));
  let side: Pt[][] = []; // (closed outlines of the side view, y down, the origin on the axis at the top of the part)
  let top: Pt[][] = []; // (the top view: outlines about the origin)
  let extra = "";
  let topW = 0;
  if (family === "nut") {
    const n = nutDims(size);
    const [w, t] = [n.acrossCorners.min, n.thickness.max];
    side = [[[-w / 2, 0], [w / 2, 0], [w / 2, t], [-w / 2, t]]];
    top = [hexagon(n.acrossFlats.max).map(([x, y]) => [y, x] as const)];
    extra = `<circle cx="X" cy="Y" r="${r2(d / 2)}" ${STROKE} ${FILL}/>`; topW = w;
  } else if (family === "washer") {
    const w = washerDims(size);
    const [R, t] = [w.outside.nom / 2, w.thickness.nom];
    side = [[[-R, 0], [R, 0], [R, t], [-R, t]]];
    extra = `<circle cx="X" cy="Y" r="${r2(R)}" ${STROKE} ${FILL}/><circle cx="X" cy="Y" r="${r2(w.inside.nom / 2)}" ${STROKE}/>`; topW = 2 * R;
  } else {
    const prof = family === "countersunk" ? countersunkProfile(size, length) : socketHeadProfile(size, length, smooth);
    const left = prof.map(([x, z]) => [-x, -z] as const);
    const right = prof.map(([x, z]) => [x, -z] as const);
    side = [[...right.slice(1), ...left.slice(1).reverse()]];
    const R = prof[1]![0];
    const s = family === "countersunk" ? countersunkDims(size).socket.acrossFlats : socketHeadDims(size).socket.acrossFlats;
    extra = `<circle cx="X" cy="Y" r="${r2(R)}" ${STROKE} ${FILL}/>`;
    top = [hexagon(s).map(([x, y]) => [y, x] as const)]; topW = 2 * R;
  }
  const boxes = side.flat();
  const [sx0, sx1] = [Math.min(...boxes.map((p) => p[0])), Math.max(...boxes.map((p) => p[0]))];
  const [sy0, sy1] = [Math.min(...boxes.map((p) => p[1])), Math.max(...boxes.map((p) => p[1]))];
  const gap = GAP * Math.max(sx1 - sx0, sy1 - sy0, topW);
  const totalW = sx1 - sx0 + gap + topW;
  const totalH = Math.max(sy1 - sy0, topW);
  const pad = 0.1 * Math.max(totalW, totalH);
  const [W, H] = [totalW + 2 * pad, totalH + 2 * pad];
  const [ox, oy] = [-totalW / 2 - sx0, -(sy1 - sy0) / 2 - sy0]; // (the side view starts at the left, centred up and down)
  const cx = -totalW / 2 + (sx1 - sx0) + gap + topW / 2; // (the top view's centre)
  const body = side.map((o) => `<path d="${path(at(o, ox, oy))}" ${STROKE} ${FILL}/>`).join("")
    + extra.replace(/X/g, r2(cx)).replace(/Y/g, "0")
    + top.map((o) => `<path d="${path(at(o, cx, 0))}" ${STROKE} ${FILL}/>`).join("");
  return svgOf(W, H, body, px, py);
}

/** The cross-section of a hole in a block: the block's cut face with the receiver's outline taken out of it (a mirrored profile about the axis), at the real size. */
export function receiverDrawing(kind: ReceiverKind, size: FastenerSize, fit: ClearanceFit, px = 120, py = 96): string {
  const depth = kind === "nutPocket" ? 10 : 12;
  const prof = receiverProfile(kind, size, fit, depth); // (x out from the axis, y up, the face at 0, a half a mm above it)
  const trap = nutTrap(size);
  const widest = Math.max(...prof.map((p) => p[0]), clearanceHole(size, "coarse") / 2, kind === "nutPocket" ? trap.acrossFlats / 2 : 0);
  const half = Math.max(widest * 1.7, 5);
  const bottom = depth;
  // the hole as a closed outline (y down): a round receiver's profile mirrored about the axis; a nut pocket is the pocket's rectangle over the hole through
  let hole: Pt[];
  if (kind === "nutPocket") {
    const [a, r, m] = [trap.acrossFlats / 2, clearanceHole(size, fit) / 2, trap.depth];
    hole = [[-a, -0.5], [a, -0.5], [a, m], [r, m], [r, bottom], [-r, bottom], [-r, m], [-a, m]];
  } else {
    hole = [...prof.map(([x, y]) => [x, -y] as const), ...[...prof].reverse().map(([x, y]) => [-x, -y] as const)].filter((p, i, all) => i === 0 || all[i - 1]![0] !== p[0] || all[i - 1]![1] !== p[1]);
  }
  const block = `M${r2(-half)} 0L${r2(half)} 0L${r2(half)} ${bottom}L${r2(-half)} ${bottom}Z`;
  const [W, H] = [2 * half * 1.2, bottom * 1.5];
  return svgOf(W, H, `<g transform="translate(0 ${r2(-bottom / 2)})"><path d="${block}${path(hole)}" fill-rule="evenodd" ${STROKE} fill="currentColor" fill-opacity=".14"/></g>`, px, py); // (drawn from the face down: moved up so the picture is centred in its box)
}
