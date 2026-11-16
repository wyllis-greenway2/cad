// The mark of a hard body (`in_476`, `in_489`): a small round badge with the hard icon over the middle of the top of the body, shown only while the body is violated (red: it is bumping into another hard body, or an earlier change put it into one), as a constraint is; pressing it makes the body soft again. Page elements over the picture, not parts of the model.
import { iconSvg } from "./icons.ts";
import type { Vec3 } from "../interaction/api.ts";

export function createHardMarks(host: HTMLElement, run: (id: string) => void) {
  const pool = new Map<string, HTMLDivElement>();
  const make = (ref: string): HTMLDivElement => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-30px 0 0 -11px;box-sizing:border-box;border-radius:11px;background:rgba(255,255,255,.92);border:1px solid #8a8f98;color:#2b2b2d;display:none;align-items:center;justify-content:center;cursor:pointer;z-index:5;opacity:.8;box-shadow:0 1px 2px rgba(0,0,0,.18)";
    el.innerHTML = iconSvg("hard");
    el.title = "Hard body: it will not go into other hard bodies; tap to make it soft";
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("pointerenter", () => { el.style.opacity = "1"; });
    el.addEventListener("pointerleave", () => { el.style.opacity = ".8"; });
    el.addEventListener("click", (e) => { e.stopPropagation(); run(`body:hard:${ref}`); });
    host.appendChild(el);
    return el;
  };
  return {
    /** The page position of each mark (null: it is not in view). */
    update(marks: { ref: string; at: Vec3; overlaps?: string; bumps?: string }[], screen: (q: Vec3) => [number, number] | null): void {
      const seen = new Set<string>();
      for (const m of marks) {
        const p = screen(m.at);
        if (!p) continue;
        seen.add(m.ref);
        const el = pool.get(m.ref) ?? make(m.ref);
        pool.set(m.ref, el);
        el.style.display = "flex";
        el.style.background = m.overlaps || m.bumps ? "rgba(255,226,226,.96)" : "rgba(255,255,255,.92)";
        el.style.borderColor = m.overlaps || m.bumps ? "#c0392b" : "#8a8f98";
        el.title = m.overlaps ? `Hard body: it overlaps ${m.overlaps} (an earlier change put them together)` : m.bumps ? `Hard body: it is against ${m.bumps} (hard bodies do not go into each other); tap to make it soft` : "Hard body: it will not go into other hard bodies; tap to make it soft";
        el.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px)`;
      }
      for (const [ref, el] of pool) if (!seen.has(ref)) { el.remove(); pool.delete(ref); }
    },
  };
}
