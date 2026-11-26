// The notices on the page (`dec_three_surfaces`): one stack of small pills at the bottom, the oldest on top. It draws what `interaction/notices.ts` says and takes no clicks (it is never in the way of the pointer).
import type { Notice } from "./interaction/notices.ts";
import { settings } from "./settings.ts";

const TONE = {
  info: { bg: "pill", fg: "pillText" },
  warn: { bg: "#8a5a00", fg: "#fff" },
  error: { bg: "#a63b3b", fg: "#fff" },
} as const;
export function createNoticeStack(host: HTMLElement) {
  const el = document.createElement("div");
  el.dataset.notices = "";
  el.style.cssText =
    "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:9;pointer-events:none;max-width:70vw";
  host.appendChild(el);
  const rows = new Map<number, HTMLElement>();
  return {
    /** each picture: what stands now */
    show(items: readonly (Notice & { fade: number })[]): void {
      const seen = new Set<number>();
      for (const n of items) {
        seen.add(n.id);
        let r = rows.get(n.id);
        if (!r) {
          r = document.createElement("div");
          r.dataset.notice = n.kind;
          rows.set(n.id, r);
        }
        const t = TONE[n.kind],
          bg = t.bg === "pill" ? settings.ui.pill : t.bg,
          fg = t.fg === "pillText" ? settings.ui.pillText : t.fg;
        if (r.textContent !== n.text) r.textContent = n.text;
        r.dataset.persistent = String(n.persistent);
        r.dataset.notice = n.kind;
        r.style.cssText = `padding:7px 14px;border-radius:15px;background:${bg};color:${fg};font:13px ${settings.ui.font};text-align:center;opacity:${n.fade}`;
        el.append(r); // (appended again in order, so the oldest is on top)
      }
      for (const [id, r] of rows)
        if (!seen.has(id)) {
          r.remove();
          rows.delete(id);
        }
    },
  };
}
