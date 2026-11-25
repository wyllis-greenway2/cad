// The operation bar (`dec_ui_unification` step 2, `q_lean_ui`, `in_1578`): the old app's one pill at the top for whatever is open, in its look (`app/src/ui/toolchip.ts`): a dark rounded pill; for an operation its words, its kinds as chips, a check that applies it and a cross
// that gives it up; for sketching the tool's icon, a cross that puts the figure or the tool away, and "Exit sketch" that leaves sketching. The same pill for every operation and tool, on every device.
import { iconSvg } from "./icons.ts";
import type { OpOption } from "./interaction/operation.ts";

export interface PillState { title: string | null; options?: readonly OpOption[]; /** an operation: the check applies it */ apply?: boolean; /** sketching: the tool's icon, and "Exit sketch" */ sketch?: { icon: string | null } }
export function createOpBar(host: HTMLElement, on: { apply(): void; cancel(): void; option?(id: string): void; exit?(): void }) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);display:none;align-items:center;justify-content:center;gap:6px;min-height:40px;max-width:calc(100vw - 16px);padding:4px 6px 4px 14px;border-radius:20px;background:#34363b;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);font:600 13px system-ui,sans-serif;z-index:9;user-select:none;-webkit-user-select:none;touch-action:manipulation";
  el.addEventListener("pointerdown", (e) => e.stopPropagation()); el.addEventListener("contextmenu", (e) => e.preventDefault());
  host.appendChild(el);
  const round = (icon: string, title: string, bg: string, f: () => void) => {
    const b = document.createElement("div"); b.innerHTML = iconSvg(icon); b.title = title; b.dataset.op = icon;
    b.style.cssText = `display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border-radius:50%;background:${bg};color:#fff;cursor:pointer`;
    b.addEventListener("click", (e) => { e.stopPropagation(); f(); }); return b;
  };
  let sig = "";
  return {
    /** What is open, or null: the pill goes away. */
    show(st: PillState | null): void {
      const s = JSON.stringify(st); if (s === sig) return; sig = s;
      if (!st || (st.title === null && !st.sketch)) { el.style.display = "none"; return; }
      el.style.display = "flex";
      const kids: HTMLElement[] = [];
      if (st.sketch?.icon) { const i = document.createElement("span"); i.innerHTML = iconSvg(st.sketch.icon); i.style.cssText = "display:inline-flex;width:20px;height:20px"; kids.push(i); }
      if (st.title) { const w = document.createElement("span"); w.textContent = st.title; w.style.whiteSpace = "nowrap"; kids.push(w); }
      for (const o of st.options ?? []) {
        const c = document.createElement("div"); c.textContent = o.label; c.dataset.option = o.id; c.title = o.enabled ? o.label : o.why ?? "";
        c.style.cssText = `padding:3px 9px;border-radius:13px;font-size:12px;border:1px solid ${o.on ? "#1ab8b3" : "rgba(255,255,255,.35)"};background:${o.on ? "#1ab8b3" : "transparent"};color:#fff;${o.enabled ? "cursor:pointer" : "opacity:.4"}`;
        if (o.enabled) c.addEventListener("click", (e) => { e.stopPropagation(); on.option?.(o.id); });
        kids.push(c);
      }
      if (st.apply) kids.push(round("check", "Apply (Enter)", "#1ab8b3", on.apply));
      kids.push(round("cross", st.sketch ? "Put the figure or the tool away (Esc)" : "Cancel (Esc)", "rgba(255,255,255,.14)", on.cancel));
      if (st.sketch) { const x = document.createElement("button"); x.type = "button"; x.textContent = "Exit sketch"; x.title = "Exit sketch"; x.dataset.op = "exit"; x.style.cssText = "border:0;border-radius:14px;padding:5px 12px;font:600 13px system-ui,sans-serif;background:#2f3136;color:#fff;cursor:pointer;white-space:nowrap"; x.addEventListener("click", (e) => { e.stopPropagation(); on.exit?.(); }); kids.push(x); }
      el.replaceChildren(...kids);
    },
  };
}
