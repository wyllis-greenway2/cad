// The marks of the mates on the model (`in_316`): a small round mark where two mated bodies meet. Teal when the mate is true, amber with a bang when it is not (a click puts it back), grey with a query when a body or a face of it is gone.
// It only draws and reports a click: where each mark stands and what it says come from the interaction layer.
import { iconSvg } from "./icons.ts";

export interface MateMark { id: string; at: [number, number]; state: "ok" | "off" | "lost"; text: string }

const LOOK = {
  ok: "background:#fff;border:2px solid #1ab8b3;color:#0e8f8b",
  off: "background:#ffb347;border:2px solid #d9822b;color:#5b3200",
  lost: "background:#e4e5e8;border:2px solid #9a9ca3;color:#5d5f66",
} as const;

export function createMateMarks(host: HTMLElement, click: (id: string, state: MateMark["state"]) => void) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:5";
  host.appendChild(root);
  const els = new Map<string, HTMLElement>();
  return {
    update(marks: MateMark[]) {
      const live = new Set(marks.map((m) => m.id));
      for (const [id, el] of els) if (!live.has(id)) { el.remove(); els.delete(id); }
      for (const m of marks) {
        let el = els.get(m.id);
        if (!el) {
          el = document.createElement("div");
          el.addEventListener("pointerdown", (e) => e.stopPropagation()); // (the page's input must not take the press as a tap or a drag of its own)
          el.addEventListener("click", (e) => { e.stopPropagation(); click(m.id, (el as HTMLElement).dataset.state as MateMark["state"]); });
          root.appendChild(el);
          els.set(m.id, el);
        }
        if (el.dataset.state !== m.state) {
          el.dataset.state = m.state;
          el.style.cssText = `position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:13px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.25);font:700 14px system-ui,sans-serif;${LOOK[m.state]}`;
          el.innerHTML = m.state === "ok" ? iconSvg("mate") : m.state === "off" ? "!" : "?";
        }
        el.title = m.text;
        el.style.transform = `translate(${Math.round(m.at[0])}px, ${Math.round(m.at[1])}px)`;
      }
    },
  };
}
