// The right-click menu (`in_133`, `in_143`): the operations as little round bubbles in the style of the constraint bubbles, laid in a ring around the click point. Each shows its icon, the
// words are in the tooltip; one that cannot start from what is selected is dimmed. A bubble with sub-items opens them as a new ring that unfolds from it (and the bubble itself turns into a ✕
// that closes them again); the rings are all the same size and share a centre. It displays what the interaction layer says and reports which was chosen.
import { iconSvg, iconKey } from "./icons.ts";

export interface RingItem { id: string; label: string; icon: string; enabled: boolean; why: string | null; children?: RingItem[] }
const SIZE = 36;
const GAP = 8;
const MS = 280; // the unfolding
const STAGGER = 22;
const BACK: RingItem = { id: "back", label: "Back", icon: "cross", enabled: true, why: null };

const depthN = (items: RingItem[]): number => Math.max(items.length + 1, ...items.map((i) => (i.children ? depthN(i.children) : 0)));

export function createRing(host: HTMLElement, onChoose: (id: string) => void) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;display:none;z-index:10;user-select:none;-webkit-user-select:none";
  host.appendChild(root);
  root.addEventListener("contextmenu", (e) => e.preventDefault());

  let C = { x: 0, y: 0, R: 0 };
  /** the rings opened so far: each is its items and the angle it starts from */
  let path: { items: RingItem[]; start: number }[] = [];
  let shown: HTMLElement[] = [];

  const pos = (a: number) => ({ left: Math.round(C.x + Math.cos(a) * C.R - SIZE / 2), top: Math.round(C.y + Math.sin(a) * C.R - SIZE / 2) });
  const bubble = (it: RingItem, at: { left: number; top: number }, from: { left: number; top: number } | null, k: number, go: () => void) => {
    const b = document.createElement("div");
    b.innerHTML = iconSvg(iconKey(it.icon));
    b.title = it.enabled || !it.why ? it.label : `${it.label}: ${it.why}`;
    const live = it.enabled;
    const start = from ?? at;
    b.style.cssText = `position:absolute;left:${start.left}px;top:${start.top}px;width:${SIZE}px;height:${SIZE}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#fff;border:1px solid ${(it.id === "back" || it.id === "exit") ? "#c0392b" : "#d6d7db"};color:${(it.id === "back" || it.id === "exit") ? "#c0392b" : "inherit"};box-shadow:0 1px 6px rgba(0,0,0,.14);cursor:${live ? "pointer" : "default"};opacity:${from ? 0 : live ? 1 : 0.38};transform:scale(${from ? 0.4 : 1})`;
    if (live) {
      b.addEventListener("pointerenter", () => { if (it.id !== "back") b.style.borderColor = "#1ab8b3"; });
      b.addEventListener("pointerleave", () => { b.style.borderColor = (it.id === "back" || it.id === "exit") ? "#c0392b" : "#d6d7db"; });
      b.addEventListener("pointerup", (e) => { e.stopPropagation(); go(); });
    }
    root.appendChild(b);
    if (from) {
      void b.offsetWidth; // (so the start is drawn before the move)
      b.style.transition = `left ${MS}ms cubic-bezier(.2,.8,.2,1) ${k * STAGGER}ms,top ${MS}ms cubic-bezier(.2,.8,.2,1) ${k * STAGGER}ms,opacity ${MS}ms ${k * STAGGER}ms,transform ${MS}ms cubic-bezier(.2,.8,.2,1) ${k * STAGGER}ms`;
      b.style.left = `${at.left}px`; b.style.top = `${at.top}px`; b.style.opacity = live ? "1" : "0.38"; b.style.transform = "scale(1)";
    }
    return b;
  };

  /** Draw the ring at `depth` of the path, unfolding from the bubble at `from` (null: appear in place). */
  const draw = (depth: number, from: { left: number; top: number } | null) => {
    const old = shown;
    old.forEach((b) => { b.style.pointerEvents = "none"; if (from) { b.style.transition = `left ${MS}ms,top ${MS}ms,opacity ${MS * 0.7}ms,transform ${MS}ms`; b.style.left = `${from.left}px`; b.style.top = `${from.top}px`; b.style.opacity = "0"; b.style.transform = "scale(.4)"; } });
    setTimeout(() => old.forEach((b) => b.remove()), from ? MS : 0);
    const { items, start } = path[depth]!;
    const slots = depth ? [BACK, ...items] : items;
    shown = slots.map((it, k) => {
      const a = start + (k / slots.length) * Math.PI * 2;
      const go = () => {
        if ((it.id === "back" || it.id === "exit")) { const at = pos(start); path.length = depth; draw(depth - 1, at); return; }
        if (it.children) {
          const idx = slots.indexOf(it);
          path.length = depth + 1;
          path.push({ items: it.children, start: start + (idx / slots.length) * Math.PI * 2 });
          draw(depth + 1, pos(start + (idx / slots.length) * Math.PI * 2));
        } else onChoose(it.id);
      };
      return bubble(it, pos(a), from, k, go);
    });
  };

  return {
    show(x: number, y: number, items: RingItem[]) {
      root.replaceChildren();
      shown = [];
      if (!items.length) return;
      const R = Math.max(SIZE + 14, ((SIZE + GAP) * depthN(items)) / (2 * Math.PI)); // far enough out that neighbours do not touch, the same for every ring
      // the whole ring is kept on the screen: the centre moves in from an edge
      const m = R + SIZE / 2 + 6;
      C = { x: Math.max(m, Math.min(window.innerWidth - m, x)), y: Math.max(m, Math.min(window.innerHeight - m, y)), R };
      path = [{ items, start: -Math.PI / 2 }];
      draw(0, null);
      root.style.display = "block";
    },
    hide() { root.style.display = "none"; },
    get open() { return root.style.display !== "none"; },
  };
}
