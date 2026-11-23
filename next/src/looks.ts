// The looks of a body: three, made here and nowhere else (`q_lean_ui`, `dec_view_looks`). Whatever shows a body (the model, a section, a preview, a body behind a plane) asks for one of them and sets no colour or opacity of its own.
//   solid       the default grey, lit
//   seeThrough  the dark nearly clear look (the wireframe body, a body behind the sketch plane, the stand-in of a preview)
//   a mark      a colour laid over either: pick (teal: selected or pointed at), clash (red), tie (amber)
// A section is Solid clipped by a plane; the hatch is the cut's own drawing (cutdraw.ts), not a look.
import { settings } from "./settings.ts";

export type Base = "solid" | "seeThrough";
export type Mark = "pick" | "clash" | "tie";
export interface Look { base: Base; mark?: Mark }
/** What a look comes to, as plain numbers (the screen turns it into a material; the checks read it). */
export interface Surface { color: number; opacity: number; transparent: boolean; depthWrite: boolean; edge: number; edgeOpacity: number }

export const SOLID: Look = { base: "solid" };
export const SEE_THROUGH: Look = { base: "seeThrough" };

const channel = (c: number, s: number) => (c >> s) & 255;
/** `a` taken `t` of the way to `b` (colours as 0xRRGGBB). */
export function mix(a: number, b: number, t: number): number {
  const m = (s: number) => Math.round(channel(a, s) + (channel(b, s) - channel(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export function surfaceOf(look: Look): Surface {
  const L = settings.looks, base = L[look.base];
  const edgeOpacity = look.base === "seeThrough" ? L.seeThrough.edgeOpacity : 1;
  let color = base.color, edge = base.edge, opacity = base.opacity;
  if (look.mark) {
    const m = L.marks[look.mark];
    if (look.base === "solid") { color = mix(color, m.color, m.strength); edge = mix(edge, m.color, 0.8); }
    else { color = m.color; edge = m.color; opacity = Math.max(opacity, 0.3); } // (a see-through body marked takes the colour itself, still clear)
  }
  return { color, opacity, transparent: opacity < 1, depthWrite: opacity >= 1, edge, edgeOpacity: look.mark && look.base === "seeThrough" ? 0.9 : edgeOpacity };
}
/** Two looks that come to the same surface need no change of material. */
export const sameLook = (a: Look, b: Look): boolean => a.base === b.base && a.mark === b.mark;
