// THE OPERATION BAR (`in_664`, `dec_ui_unification`): the one place that says what is open, with its options and its apply and cancel. On a mouse it is a pill at the top; on a finger it is at the bottom, with undo and redo in it.
// The sketching tool that is on (`in_193`): a little pill at the top of the page with the tool's icon and a cross; the tool stays on until a right click or this cross puts it away. Once a figure has been made the cross becomes a check (the work is done, the check puts the tool away: it is not a cancel, `in_283`) and it flashes green, fading, at every figure and every operation that opens, to show it is there to press.
import { iconSvg } from "./icons.ts";
import { choiceRow, roundButton, onPress } from "./look.ts";
import type { Option } from "../interaction/options.ts";

export function createToolChip(host: HTMLElement, cancel: () => void, apply: () => void, pick: (o: Option) => void = () => {}, undo: () => void = () => {}, redo: () => void = () => {}) {
  const chip = document.createElement("div");
  chip.style.cssText = "position:fixed;z-index:7;top:12px;left:50%;transform:translateX(-50%);display:none;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;min-height:40px;max-width:calc(100vw - 16px);padding:4px 6px 4px 14px;border-radius:20px;background:#34363b;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);user-select:none;-webkit-user-select:none;touch-action:manipulation";
  const icon = document.createElement("span");
  icon.style.cssText = "display:inline-flex;width:20px;height:20px";
  const x = roundButton({ icon: "cross", size: 28, tone: "dark" });
  x.addEventListener("click", (e) => { e.stopPropagation(); cancel(); });
  const tick = roundButton({ icon: "check", size: 28, tone: "dark" });
  tick.addEventListener("click", (e) => { e.stopPropagation(); if (tick.dataset.mode === "done") cancel(); else apply(); });
  const words = document.createElement("span");
  words.style.cssText = "display:none;font:600 13px system-ui,sans-serif;white-space:nowrap";
  const options = document.createElement("span");
  options.style.cssText = "display:none;gap:6px;align-items:center";
  // undo and redo, for a finger: they are in the bar, which is at the bottom, where a thumb reaches (`in_664`)
  const round = (name: string, title: string, fire: () => void): HTMLElement => { const b = roundButton({ icon: name, size: 36, tone: "dark", title }); onPress(b, fire); return b; };
  const undoB = round("undo", "Undo", undo);
  const redoB = round("redo", "Redo", redo);
  chip.append(undoB, redoB, icon, words, options, tick, x);
  host.appendChild(chip);
  const tickBase = tick.style.background;
  /** green, fading out: "this is there to press" (`in_283`) */
  const flash = () => {
    tick.style.transition = "none";
    tick.style.background = "#2fbf71";
    void tick.offsetWidth; // (so the green is painted before it starts to fade)
    tick.style.transition = "background 1.6s ease-out";
    tick.style.background = tickBase;
  };
  let shown = "";
  let optionsShown = "";
  let madeSeen = 0;
  return {
    /** The tool that is on (its icon key and the words for the tooltip; `made` figures so far, `drawing` one half drawn), or an operation open that is applied with the check; or null. */
    update(tool: { kind: string; label: string; made?: number; drawing?: boolean; done?: boolean } | null, confirm: { kind: string; label: string; text?: string } | null = null, touch = false, opts: readonly Option[] = [], can: { undo: boolean; redo: boolean } = { undo: false, redo: false }): boolean {
      // a finger: at the bottom with undo and redo; else at the top
      chip.style.top = touch ? "auto" : "12px";
      chip.style.bottom = touch ? "40px" : "";
      undoB.style.display = redoB.style.display = touch ? "flex" : "none";
      undoB.style.opacity = can.undo ? "1" : "0.35";
      redoB.style.opacity = can.redo ? "1" : "0.35";
      const on = confirm ?? tool;
      chip.style.display = on || touch ? "flex" : "none";
      if (!on) { madeSeen = 0; shown = ""; optionsShown = ""; icon.style.display = "none"; tick.style.display = x.style.display = "none"; options.style.display = "none"; words.style.display = "none"; return touch; } // (a finger always has the bar: undo and redo are in it)
      icon.style.display = "inline-flex";
      const done = !confirm && !!tool?.done; // (the interaction layer says: a figure is made and nothing is half drawn, so the tool can be put away with the check)
      tick.style.display = confirm || done ? "inline-flex" : "none"; // (every operation has its check, on every device: a tap away from it still applies, like a right click, `in_664`)
      tick.dataset.mode = confirm ? "apply" : "done";
      x.style.display = confirm || !done ? "inline-flex" : "none"; // (an operation: apply or cancel; a tool: the check once there is something done, else the cross)
      if (!confirm && tool && (tool.made ?? 0) > madeSeen) flash();
      madeSeen = tool ? tool.made ?? 0 : 0;
      words.textContent = confirm?.text ?? "";
      words.style.display = confirm?.text ? "inline" : "none";
      // the options of the operation: the choices it has, the one Tab is on outlined
      const osig = JSON.stringify(confirm ? opts.map((o) => [o.id, o.on, o.focus, o.label]) : []);
      if (osig !== optionsShown) {
        optionsShown = osig;
        const list = confirm ? opts : [];
        options.style.display = list.length ? "inline-flex" : "none";
        choiceRow(options, list.map((o) => ({ id: o.group + ":" + o.id, text: o.radio || o.action ? o.label : `${o.on ? "✓" : "○"} ${o.label}`, title: o.title, on: o.on, focus: o.focus })), (id) => { const o = list.find((q) => q.group + ":" + q.id === id); if (o) pick(o); });
      }
      const key = `${confirm ? "c" : "t"}:${on.kind}:${confirm?.text ?? ""}:${done ? "done" : ""}:${touch ? "touch" : ""}`;
      if (key === shown) return true;
      if (confirm && !touch) flash();
      shown = key;
      icon.innerHTML = iconSvg(on.kind);
      if (confirm) {
        chip.title = `${confirm.label}: Enter or a right click${touch ? " (or a tap away from it)" : ""} applies, Esc cancels${opts.length ? ", Tab steps through its options, Shift+Enter flips a switch" : ""}`;
        tick.title = "Apply (Enter or right click)";
        x.title = "Cancel (Esc)";
      } else if (done) {
        chip.title = `${on.label}: stays on until the check or a right click`;
        tick.title = "Done: put the tool away (or right click)";
      } else {
        chip.title = `${on.label}: stays on until a right click or the cross`;
        x.title = tool?.drawing ? "Cancel this figure (Esc)" : "Stop sketching (or right click)";
      }
      return true;
    },
  };
}
