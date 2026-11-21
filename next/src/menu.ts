// The right-click ring: round buttons round the pointer (prototype: the ring menu). It closes on Esc, on a click outside it and after one item is chosen.
// Also the cut plane's small bubble of options and its Orient handles, which are the same kind of thing: a few buttons near a point.
import { settings } from "./settings.ts";

export interface MenuItem { id: string; label: string; enabled?: boolean; note?: string }

const css = () => {
  const P = settings.planes, u = settings.ui;
  return `.cadring{position:fixed;z-index:20;width:0;height:0}
    .cadring button,.cadbubble button{font:600 12px ${u.font};color:${u.text};background:#fff;border:1px solid #cfd0d4;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.14)}
    .cadring button{position:absolute;width:${P.ringButtonPx}px;height:${P.ringButtonPx}px;margin:-${P.ringButtonPx / 2}px 0 0 -${P.ringButtonPx / 2}px;border-radius:50%;padding:2px;line-height:1.15}
    .cadring button:hover:not(:disabled){background:rgb(${u.tealRgb.join(",")});color:#fff;border-color:transparent}
    .cadring button:disabled,.cadbubble button:disabled{opacity:.4;cursor:default}
    .cadring .hub{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#9a9ea6}
    .cadbubble{position:fixed;z-index:12;display:none;gap:4px;flex-wrap:wrap;max-width:220px;transform:translate(10px,10px);font-family:${u.font}}
    .cadbubble button{border-radius:14px;padding:4px 10px}
    .cadbubble button.on{background:rgb(${u.tealRgb.join(",")});color:#fff;border-color:transparent}
    .cadhandle{position:fixed;z-index:11;display:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgb(${u.tealRgb.join(",")});border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab;touch-action:none}`;
};

export function createMenu(host: HTMLElement, choose: (id: string) => void) {
  const style = document.createElement("style"); style.textContent = css(); document.head.appendChild(style);
  let el: HTMLElement | null = null;
  const close = () => { el?.remove(); el = null; document.removeEventListener("pointerdown", outside, true); };
  const outside = (e: Event) => { if (el && !el.contains(e.target as Node)) close(); };
  return {
    isOpen: () => el !== null,
    close,
    open(x: number, y: number, items: MenuItem[]) {
      close();
      const R = Math.max(settings.planes.ringRadiusPx, (items.length * settings.planes.ringButtonPx * 1.1) / (2 * Math.PI)), pad = R + settings.planes.ringButtonPx / 2 + 4;
      const cx = Math.min(Math.max(x, pad), innerWidth - pad), cy = Math.min(Math.max(y, pad), innerHeight - pad);
      el = document.createElement("div"); el.className = "cadring"; el.style.left = `${cx}px`; el.style.top = `${cy}px`;
      el.innerHTML = '<div class="hub"></div>';
      items.forEach((it, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / items.length, b = document.createElement("button");
        b.textContent = it.label; b.disabled = it.enabled === false; if (it.note) b.title = it.note;
        b.style.left = `${Math.cos(a) * R}px`; b.style.top = `${Math.sin(a) * R}px`;
        b.addEventListener("click", (e) => { e.stopPropagation(); close(); choose(it.id); });
        el!.appendChild(b);
      });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      host.appendChild(el);
      setTimeout(() => document.addEventListener("pointerdown", outside, true));
    },
  };
}

export interface CutView { id: string; anchor: [number, number] | null; handle: [number, number] | null; on: boolean; temp: boolean; orienting: boolean }
export function createCutUi(host: HTMLElement, on: { toggle(id: string): void; orient(id: string): void; away(id: string): void; sketch(id: string): void; across(id: string, axis: 0 | 1 | 2 | "camera"): void; drag(id: string, dx: number, dy: number): void }) {
  const bubble = document.createElement("div"); bubble.className = "cadbubble"; host.appendChild(bubble);
  const handle = document.createElement("div"); handle.className = "cadhandle"; handle.title = "Drag to move the plane along its normal"; host.appendChild(handle);
  for (const el of [bubble, handle]) el.addEventListener("pointerdown", (e) => e.stopPropagation());
  let id = "", built = "";
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    let lx = e.clientX, ly = e.clientY;
    const move = (m: PointerEvent) => { on.drag(id, m.clientX - lx, m.clientY - ly); lx = m.clientX; ly = m.clientY; };
    const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
  });
  const button = (label: string, fn: () => void, lit = false) => { const b = document.createElement("button"); b.textContent = label; b.className = lit ? "on" : ""; b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); bubble.appendChild(b); };
  return {
    update(v: CutView | null) {
      if (!v || !v.anchor) { bubble.style.display = "none"; handle.style.display = "none"; built = ""; return; }
      id = v.id;
      const sig = `${v.id}${v.on}${v.temp}${v.orienting}`;
      if (sig !== built) {
        built = sig; bubble.innerHTML = "";
        button(v.on ? "On" : "Off", () => on.toggle(v.id), v.on);
        if (!v.temp) {
          button("Orient", () => on.orient(v.id), v.orienting); button("Put away", () => on.away(v.id)); button("Sketch here", () => on.sketch(v.id));
          if (v.orienting) { for (const [l, a] of [["X", 0], ["Y", 1], ["Z", 2]] as const) button(`Across ${l}`, () => on.across(v.id, a)); button("Face camera", () => on.across(v.id, "camera")); }
        }
      }
      bubble.style.display = "flex"; bubble.style.left = `${v.anchor[0]}px`; bubble.style.top = `${v.anchor[1]}px`;
      if (v.orienting && v.handle) { handle.style.display = "block"; handle.style.left = `${v.handle[0]}px`; handle.style.top = `${v.handle[1]}px`; } else handle.style.display = "none";
    },
  };
}
