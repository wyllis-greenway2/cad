// The gear box (`in_685`): the numbers of a gear as a labelled panel that stands still on the left of the page, every number named, with its unit and a line that says what it is, instead of a row of bare numbers
// that followed the pointer and let it through. It displays what the interaction layer says (`Entry.panel`) and reports typing, Enter and Esc as the number bubble does.
import type { Entry } from "../interaction/entry.ts";
import { textButton } from "./look.ts";

export interface GearBoxHandlers { entry(field: number, text: string): void; enter(): void; cancel(): void }

export function createGearBox(host: HTMLElement, h: GearBoxHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:14px;top:84px;width:min(300px,calc(100vw - 28px));max-height:calc(100vh - 140px);overflow-y:auto;display:none;box-sizing:border-box;padding:12px 14px;background:#fff;border:1px solid #cfd0d4;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.14);font:13px system-ui,sans-serif;color:#2b2b2d;z-index:9;user-select:none;-webkit-user-select:none";
  host.appendChild(el);
  for (const t of ["pointerdown", "pointerup", "wheel", "contextmenu"]) el.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu") e.preventDefault(); });
  let sig = "";
  let inputs: HTMLInputElement[] = [];
  let hints: HTMLElement[] = [];
  let warn: HTMLElement | null = null;
  let suggest: HTMLElement | null = null;
  let info: HTMLElement | null = null;
  return {
    rect(): DOMRect | null { return el.style.display === "none" ? null : el.getBoundingClientRect(); },
    /** `entry`: the panel to show (null hides it). */
    update(entry: Entry | null) {
      if (!entry || !entry.panel) { el.style.display = "none"; sig = ""; inputs = []; return; }
      const now = JSON.stringify([entry.panel, entry.fields.map((f) => [f.label, f.unit ?? entry.unit])]);
      if (now !== sig) {
        sig = now;
        el.replaceChildren();
        hints = [];
        warn = document.createElement("div");
        warn.style.cssText = "display:none;margin:2px 0 6px;padding:6px 8px;border-radius:8px;background:#fde8e8;color:#b42318;font-size:12px;line-height:1.35";
        el.appendChild(warn);
        suggest = document.createElement("div");
        suggest.style.cssText = "display:none;margin:2px 0 6px;padding:6px 8px;border-radius:8px;background:#e6f6f5;color:#0b6b67;font-size:12px;line-height:1.35";
        el.appendChild(suggest);
        info = document.createElement("div");
        info.style.cssText = "display:none;margin:2px 0 6px;padding:6px 8px;border-radius:8px;background:#eef2fb;color:#2b3a67;font-size:12px;line-height:1.4";
        el.appendChild(info);
        const title = document.createElement("div");
        title.textContent = entry.panel;
        title.style.cssText = "font-weight:600;font-size:15px;margin-bottom:6px";
        el.appendChild(title);
        inputs = entry.fields.map((f, i) => {
          const row = document.createElement("div");
          row.style.cssText = "padding:6px 0;border-top:1px solid #f0f1f3";
          const line = document.createElement("div");
          line.style.cssText = "display:flex;align-items:center;gap:8px";
          const name = document.createElement("label");
          name.textContent = f.label;
          name.style.cssText = "flex:1;font-weight:600";
          const input = document.createElement("input");
          input.type = "text";
          input.inputMode = "decimal";
          input.autocomplete = "off";
          input.style.cssText = "width:84px;box-sizing:border-box;padding:6px 8px;border:1px solid #cfd0d4;border-radius:8px;font:600 14px system-ui,sans-serif;text-align:right;outline:none;user-select:text;-webkit-user-select:text";
          input.addEventListener("focus", () => { input.select(); input.style.borderColor = "#1ab8b3"; });
          input.addEventListener("blur", () => { input.style.borderColor = "#cfd0d4"; });
          input.addEventListener("input", () => h.entry(f.index ?? i, input.value));
          input.addEventListener("keydown", (ev) => {
            ev.stopPropagation(); // the keys typed here are this box's
            if (ev.key === "Enter") { ev.preventDefault(); h.enter(); input.blur(); } else if (ev.key === "Escape") { ev.preventDefault(); input.blur(); h.cancel(); }
          });
          name.addEventListener("click", () => input.focus());
          const unit = document.createElement("span");
          const u = f.unit ?? entry.unit;
          unit.textContent = u === "°" || u === "deg" ? "°" : "";
          unit.style.cssText = "width:10px;opacity:.65";
          line.append(name, input, unit);
          row.appendChild(line);
          { const hint = document.createElement("div"); hints[i] = hint; hint.textContent = f.hint ?? ""; hint.style.cssText = "font-size:11.5px;color:#777;margin-top:3px;line-height:1.35"; row.appendChild(hint); }
          el.appendChild(row);
          return input;
        });
        const note = document.createElement("div");
        note.textContent = entry.panel.startsWith("Planetary") ? "A sun, planets and a ring, each a body of its own, and an optional carrier. Select any of its gears and choose Edit gear to change the whole set." : entry.panel.includes("meshing") ? "Made to fit the gear it was started from: the module, pressure angle and spacing are taken from it." : "A partner that fits: select this gear, then Gear, Mesh gear (or Mesh rack).";
        note.style.cssText = "font-size:11.5px;color:#555;margin-top:8px;padding-top:8px;border-top:1px solid #f0f1f3;line-height:1.35";
        el.appendChild(note);
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:10px";
        bar.append(textButton("Cancel", { click: () => h.cancel() }), textButton("Make it", { tone: "primary", click: () => h.enter() }));
        el.appendChild(bar);
      }
      if (suggest) { suggest.textContent = entry.suggest ?? ""; suggest.style.display = entry.suggest ? "block" : "none"; } // (a click that makes it mesh with the gear beside it, `in_709`)
      if (info) { info.textContent = entry.info ?? ""; info.style.display = entry.info ? "block" : "none"; } // (a planetary set: the ratio for each part held)
      if (warn) { warn.textContent = entry.warn ?? ""; warn.style.display = entry.warn ? "block" : "none"; } // (numbers that make no gear: why, in red)
      entry.fields.forEach((f, i) => { // (a number just taken back to one that makes a gear flashes red, `in_690`)
        const input = inputs[i]!;
        if (hints[i] && hints[i]!.textContent !== (f.hint ?? "")) hints[i]!.textContent = f.hint ?? ""; // (the line for a bore's standard key follows the bore typed)
        if (document.activeElement !== input || f.bad) input.value = f.value;
        input.style.background = f.bad ? "#fde8e8" : "";
        if (f.bad) input.style.borderColor = "#e5484d"; else if (document.activeElement !== input) input.style.borderColor = "#cfd0d4";
      });
      el.style.display = "block";
    },
  };
}
