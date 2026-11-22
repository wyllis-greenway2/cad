// A drawing of sketching as SVG, in the old project's look (`style.ts`): to see what the layer says, and to show a screen designer what the data means. Not the screen: a screen draws these same items its own way.
import { COLOUR, OPACITY, type Tone, WEIGHT } from "./style.ts";
import type { Guide } from "./hold.ts";
import type { Pt } from "./refs.ts";

export type Item =
  | { t: "line"; a: Pt; b: Pt; tone: Tone; w?: number; dashed?: boolean; opacity?: number }
  | { t: "circle"; c: Pt; r: number; tone: Tone; w?: number; dashed?: boolean; fill?: number; opacity?: number }
  | { t: "ball"; p: Pt; tone: Tone; r?: number }
  | { t: "text"; p: Pt; s: string; tone?: Tone; size?: number; anchor?: "start" | "middle" | "end" }
  | { t: "chip"; p: Pt; s: string; tone: Tone; flash?: boolean }
  | { t: "cursor"; p: Pt };
export interface View { box: [number, number, number, number]; w: number; h: number }
export const fromGuide = (g: Guide): Item[] => g.kind === "ball" ? g.points.map((p) => ({ t: "ball", p, tone: g.tone }) as Item) : g.kind === "ring" ? [{ t: "circle", c: g.points[0]!, r: g.r!, tone: g.tone, dashed: true, w: WEIGHT.guide }] : [{ t: "line", a: g.points[0]!, b: g.points[g.points.length - 1]!, tone: g.tone, dashed: g.kind === "dashed", w: g.kind === "dashed" ? WEIGHT.guide : WEIGHT.figure }];
export function svg(view: View, items: Item[], title = ""): string {
  const [x0, y0, x1, y1] = view.box, sx = view.w / (x1 - x0), sy = view.h / (y1 - y0), s = Math.min(sx, sy), X = (x: number) => ((x - x0) * s).toFixed(2), Y = (y: number) => ((y1 - y) * s).toFixed(2), dash = (WEIGHT.dash * 4 * Math.max(view.w, view.h)).toFixed(1);
  const col = (t: Tone) => COLOUR[t], out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${view.w}" height="${view.h}" viewBox="0 0 ${view.w} ${view.h}" font-family="system-ui, sans-serif">`, `<rect width="100%" height="100%" fill="${COLOUR.ground}"/>`];
  if (title) out.push(`<text x="10" y="18" font-size="12" fill="${COLOUR.note}">${title}</text>`);
  for (const it of items) {
    if (it.t === "line") out.push(`<line x1="${X(it.a[0])}" y1="${Y(it.a[1])}" x2="${X(it.b[0])}" y2="${Y(it.b[1])}" stroke="${col(it.tone)}" stroke-width="${it.w ?? WEIGHT.figure}" stroke-linecap="round"${it.dashed ? ` stroke-dasharray="${dash} ${(Number(dash) * WEIGHT.gap).toFixed(1)}"` : ""}${it.opacity !== undefined ? ` opacity="${it.opacity}"` : ""}/>`);
    else if (it.t === "circle") out.push(`<circle cx="${X(it.c[0])}" cy="${Y(it.c[1])}" r="${(it.r * s).toFixed(2)}" fill="${it.fill ? col(it.tone) : "none"}"${it.fill ? ` fill-opacity="${it.fill}"` : ""} stroke="${col(it.tone)}" stroke-width="${it.w ?? WEIGHT.figure}"${it.dashed ? ` stroke-dasharray="${dash} ${(Number(dash) * WEIGHT.gap).toFixed(1)}"` : ""}${it.opacity !== undefined ? ` opacity="${it.opacity}"` : ""}/>`);
    else if (it.t === "ball") out.push(`<circle cx="${X(it.p[0])}" cy="${Y(it.p[1])}" r="${it.r ?? 4.5}" fill="${col(it.tone)}"/>`);
    else if (it.t === "cursor") out.push(`<g stroke="${COLOUR.axis}" stroke-width="1.2"><line x1="${X(it.p[0])}" y1="${Number(Y(it.p[1])) - 7}" x2="${X(it.p[0])}" y2="${Number(Y(it.p[1])) + 7}"/><line x1="${Number(X(it.p[0])) - 7}" y1="${Y(it.p[1])}" x2="${Number(X(it.p[0])) + 7}" y2="${Y(it.p[1])}"/></g>`);
    else if (it.t === "text") out.push(`<text x="${X(it.p[0])}" y="${Y(it.p[1])}" font-size="${it.size ?? 11}" fill="${col(it.tone ?? "note")}" text-anchor="${it.anchor ?? "start"}">${it.s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
    else if (it.t === "chip") { const w = it.s.length * 6.4 + 14; out.push(`<g><rect x="${Number(X(it.p[0])) - w / 2}" y="${Number(Y(it.p[1])) - 10}" width="${w}" height="20" rx="10" fill="${COLOUR.ground}" stroke="${col(it.tone)}" stroke-width="${it.flash ? 2.5 : 1.5}">${it.flash ? `<animate attributeName="opacity" values="1;0.35;1" dur="0.9s" repeatCount="indefinite"/>` : ""}</rect><text x="${X(it.p[0])}" y="${Number(Y(it.p[1])) + 4}" font-size="11" text-anchor="middle" fill="${col(it.tone)}">${it.s}</text></g>`); }
  }
  out.push("</svg>"); return out.join("\n");
}
export { OPACITY };
