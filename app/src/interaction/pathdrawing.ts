// The picture in the path repeat's dialog (`dec_path_repeat`): the path drawn as a line, with a dot at each place the copies stand (the first, the figure itself, filled; a corner, a ring). Inline SVG made here from numbers, never from
// what a person typed. The plane's own two directions: x to the right, y up.
import type { Path, Pt, Placed } from "../operation/pathrepeat.ts";
import type { Result } from "../shared/result.ts";

const r2 = (n: number): string => String(Math.round(n * 100) / 100);
/** The path (null draws nothing but a hint), the places as points, and, when the path was offset, the path moved (drawn dashed) so the offset can be seen. */
export function pathPicture(path: Path | null, places: readonly { at: Pt; corner: boolean }[], moved: Result<Placed> | null, px = 360, py = 220): string {
  const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${py}" width="${px}" height="${py}" aria-hidden="true"/>`;
  if (!path) return empty;
  const pts: Pt[] = [];
  const sample = (segs: Path["segs"]): void => { for (const s of segs) { pts.push(s.a, s.b); if (Math.abs(s.bulge) > 1e-9) pts.push([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], ...arcPoints(s)); } };
  sample(path.segs);
  if (moved?.ok) sample(moved.value.path.segs);
  pts.push(...places.map((p) => p.at));
  const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const pad = 0.08 * Math.max(x1 - x0, y1 - y0, 1);
  const [w, h] = [x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  const k = Math.min(px / w, py / h);
  const [ox, oy] = [(px - w * k) / 2 - (x0 - pad) * k, (py - h * k) / 2 + (y1 + pad) * k]; // (y up: the picture's y is turned over)
  const X = (p: Pt): string => `${r2(ox + p[0] * k)} ${r2(oy - p[1] * k)}`;
  const draw = (segs: Path["segs"], dash: boolean): string => segs.map((s) => {
    const c = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const arc = Math.abs(s.bulge) > 1e-9 && c > 1e-9;
    const th = -4 * Math.atan(2 * s.bulge);
    const r = arc ? (c / (2 * Math.abs(Math.sin(th / 2)))) * k : 0;
    return `<path d="M${X(s.a)}${arc ? `A${r2(r)} ${r2(r)} 0 ${Math.abs(th) > Math.PI ? 1 : 0} ${th > 0 ? 0 : 1} ${X(s.b)}` : `L${X(s.b)}`}" fill="none" stroke="currentColor" stroke-width="${dash ? 1.2 : 2}" ${dash ? 'stroke-dasharray="5 4" opacity=".6"' : ""} stroke-linecap="round"/>`;
  }).join("");
  const dots = places.map((p, i) => { const [cx, cy] = X(p.at).split(" "); return `<circle cx="${cx}" cy="${cy}" r="${i === 0 ? 6 : 4.5}" fill="${i === 0 ? "#1f7a7a" : "#fff"}" stroke="${p.corner ? "#c0392b" : "#1f7a7a"}" stroke-width="${p.corner ? 2.4 : 1.8}"/>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${py}" width="${px}" height="${py}" aria-hidden="true" style="color:#33363d">${draw(path.segs, false)}${moved?.ok ? draw(moved.value.path.segs, true) : ""}${dots}</svg>`;
}
/** A few points along an arc side, for the picture's frame (the sagitta point is the one that matters). */
function arcPoints(s: Path["segs"][number]): Pt[] {
  const c: Pt = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
  return [[(s.a[0] + s.b[0]) / 2 - c[1] * s.bulge, (s.a[1] + s.b[1]) / 2 + c[0] * s.bulge]];
}
