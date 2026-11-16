// THE ONE RENDERER OF NOTICES (`in_547`, `dec_ui_unification`): draws the list `interaction/notice.ts` describes. Each kind has its place and look, but they are made here, by one code, and a notice with a button
// reports it the same way whichever kind it is. Nothing else in the page puts words on the screen for the person (a dialog and the settings page are pages, not notices).
import { PILL, choiceRow } from "./look.ts";
import type { Notice, NoticeAction } from "../interaction/notice.ts";
import type { Intent } from "../shared/input.ts";

export interface NoticeContext {
  /** a point of the scene as a place on the page */
  onPage: (p: NonNullable<Notice["at"]>) => [number, number] | null;
  /** the box of a constraint's bubble on the page, when it is shown */
  bubble: (id: string) => DOMRect | null;
  touch: boolean;
  now: number;
}

export function createNotices(host: HTMLElement, status: HTMLElement, send: (i: Intent) => void, delayMs = 350) {
  // the refusal: a pill with its words and the button that goes through
  const refusal = document.createElement("div");
  refusal.style.cssText = PILL + ";top:64px;left:50%;transform:translateX(-50%);max-width:92vw";
  const rText = document.createElement("span");
  rText.style.cssText = "overflow:hidden;text-overflow:ellipsis";
  const rButtons = document.createElement("span");
  refusal.append(rText, rButtons);
  refusal.addEventListener("pointerenter", () => hold?.());
  refusal.addEventListener("pointermove", () => hold?.());
  refusal.addEventListener("pointerdown", (e) => e.stopPropagation());
  host.appendChild(refusal);
  let hold: (() => void) | null = null;
  // the help on an arrow: it only draws, the pointer passes through it
  const help = document.createElement("div");
  help.style.cssText = "position:fixed;left:0;top:0;display:none;padding:4px 10px;border-radius:13px;background:#1a2b2b;color:#fff;font:12.5px system-ui,sans-serif;white-space:nowrap;pointer-events:none;z-index:9;box-shadow:0 1px 6px rgba(0,0,0,.25)";
  host.appendChild(help);
  // the working sign: it shows only after a short wait, so quick answers do not flash it
  const busy = document.createElement("div");
  busy.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:6px 14px;border-radius:16px;background:#fff;border:1px solid #d6d7db;box-shadow:0 1px 8px rgba(0,0,0,.15);font:13px system-ui,sans-serif;color:#2b2b2d;pointer-events:none;z-index:9";
  const spin = document.createElement("div");
  spin.style.cssText = "width:14px;height:14px;border-radius:50%;border:2px solid #cfd0d4;border-top-color:#1ab8b3";
  const bText = document.createTextNode("Working…");
  busy.append(spin, bText);
  host.appendChild(busy);
  let since: number | null = null;
  let refusalShown = "";
  let helpShown = "";

  return {
    /** The words of the bottom line when nothing else is to say (the page's own: while it loads). */
    say(text: string): void { status.textContent = text; },
    /** The box the help fills while shown (what the constraint bubbles give way to, `in_261`). */
    helpRect(): DOMRect | null { return help.style.display === "none" ? null : help.getBoundingClientRect(); },
    /** Draw the notices. Returns true while one wants more frames (the working sign turns). */
    update(list: readonly Notice[], ctx: NoticeContext): boolean {
      const of = (k: Notice["kind"]) => list.find((n) => n.kind === k);
      // status: the bottom line, above the operation bar of a finger and clear of the X Y Z buttons
      status.textContent = of("status")?.text ?? "";
      status.style.bottom = ctx.touch ? "108px" : "";
      status.style.right = ctx.touch ? "64px" : "";
      // refusal
      const r = of("refusal");
      if (!r) { refusal.style.display = "none"; refusalShown = ""; hold = null; }
      else {
        const bubble = r.beside ? ctx.bubble(r.beside) : null;
        if (bubble) { // beside the constraint that stopped it: to its right (to its left at the edge of the page)
          const w = refusal.offsetWidth || 260;
          const left = bubble.right + 8 + w > window.innerWidth ? Math.max(4, bubble.left - 8 - w) : bubble.right + 8;
          Object.assign(refusal.style, { top: `${Math.max(4, Math.round(bubble.top + bubble.height / 2 - 18))}px`, left: `${Math.round(left)}px`, transform: "none" });
        } else Object.assign(refusal.style, { top: "64px", left: "50%", transform: "translateX(-50%)" });
        const act: NoticeAction | undefined = r.action;
        hold = act?.hold ? () => send(act.hold!) : null;
        const sig = JSON.stringify([r.text, act?.label]);
        if (sig !== refusalShown) {
          refusalShown = sig;
          refusal.style.display = "flex";
          rText.textContent = r.text;
          choiceRow(rButtons, act ? [{ id: "go", text: act.label, title: act.title, on: true }] : [], () => send(act!.intent));
        }
      }
      // help
      const h = of("help");
      const at = h?.at ? ctx.onPage(h.at) : null;
      if (!h || !at) help.style.display = "none";
      else {
        if (helpShown !== h.text) { helpShown = h.text; help.textContent = h.text; }
        help.style.display = "block";
        help.style.transform = `translate(${Math.round(at[0] + 12)}px, ${Math.round(at[1] - 34)}px)`;
      }
      // busy
      const b = of("busy");
      if (!b) { since = null; busy.style.display = "none"; return false; }
      since ??= ctx.now;
      const show = ctx.now - since >= delayMs;
      busy.style.display = show ? "flex" : "none";
      bText.textContent = b.text;
      if (show) spin.style.transform = `rotate(${Math.round(((ctx.now - since) / 4) % 360)}deg)`;
      return true;
    },
  };
}
