// The gear box (`in_685`): the numbers of a gear as a labelled panel that stands still on the left of the page, every number named, with its unit and a line that says what it is, instead of a row of bare numbers
// that followed the pointer and let it through. It displays what the interaction layer says (`Entry.panel`) and reports typing, Enter and Esc as the number bubble does.
import type { Entry } from "../interaction/entry.ts";
import { panelShell, noteBox, setNote, panelTitle, panelRow, numberInput, panelButtons } from "./panelkit.ts";

export interface GearBoxHandlers { entry(field: number, text: string): void; enter(): void; cancel(): void }

export function createGearBox(host: HTMLElement, h: GearBoxHandlers) {
  const el = panelShell(host);
  let sig = "";
  let inputs: HTMLInputElement[] = [];
  let hints: HTMLElement[] = [];
  let warn: HTMLElement | null = null;
  let suggest: HTMLElement | null = null;
  let info: HTMLElement | null = null;
  let focusedFor = "";
  return {
    rect(): DOMRect | null { return el.style.display === "none" ? null : el.getBoundingClientRect(); },
    /** `entry`: the panel to show (null hides it). */
    update(entry: Entry | null) {
      if (!entry || !entry.panel) { el.style.display = "none"; sig = ""; focusedFor = ""; inputs = []; return; }
      const now = JSON.stringify([entry.panel, !!entry.kept, entry.fields.map((f) => [f.label, f.unit ?? entry.unit])]);
      if (now !== sig) {
        sig = now;
        el.replaceChildren();
        hints = [];
        warn = noteBox("warn");
        el.appendChild(warn);
        suggest = noteBox("suggest");
        el.appendChild(suggest);
        el.appendChild(panelTitle(entry.panel));
        info = noteBox("info");
        el.appendChild(info);
        inputs = entry.fields.map((f, i) => {
          const input = numberInput({ onInput: (t) => h.entry(f.index ?? i, t), onEnter: () => h.enter(), onEscape: () => h.cancel() });
          const u = f.unit ?? entry.unit;
          const row = panelRow(f.label, input, u === "°" || u === "deg" ? "°" : "");
          hints[i] = row.hint;
          row.hint.textContent = f.hint ?? "";
          el.appendChild(row.el);
          return input;
        });
        const note = document.createElement("div");
        note.textContent = entry.panel.startsWith("Planetary") ? "A sun, planets and a ring, each a body of its own, and an optional carrier. Select any of its gears and choose Edit gear to change the whole set." : entry.panel.includes("meshing") ? "Made to fit the gear it was started from: the module, pressure angle and spacing are taken from it." : "A partner that fits: select this gear, then Gear, Mesh gear (or Mesh rack).";
        note.style.cssText = "font-size:11.5px;color:#555;margin-top:8px;padding-top:8px;border-top:1px solid #f0f1f3;line-height:1.35";
        el.appendChild(note);
        el.appendChild(panelButtons({ label: entry.kept ? "Done" : "Cancel", click: () => h.cancel() }, { label: entry.kept ? "Apply" : "Make it", click: () => h.enter() }));
      }
      if (suggest) setNote(suggest, entry.suggest); // (a click that makes it mesh with the gear beside it, `in_709`)
      if (info) setNote(info, entry.info); // (a planetary set: the ratio for each part held)
      if (warn) setNote(warn, entry.warn); // (numbers that make no gear: why, in red)
      entry.fields.forEach((f, i) => { // (a number just taken back to one that makes a gear flashes red, `in_690`)
        const input = inputs[i]!;
        if (hints[i] && hints[i]!.textContent !== (f.hint ?? "")) hints[i]!.textContent = f.hint ?? ""; // (the line for a bore's standard key follows the bore typed)
        if (document.activeElement !== input || f.bad) input.value = f.value;
        input.style.background = f.bad ? "#fde8e8" : "";
        if (f.bad) input.style.borderColor = "#e5484d"; else if (document.activeElement !== input) input.style.borderColor = "#cfd0d4";
      });
      el.style.display = "block";
      if (entry.focus && focusedFor !== sig) { // (the box was opened on a number, as the Helix item of a gear's icon does: it takes the keyboard there and scrolls to it, `in_771`)
        focusedFor = sig;
        const at = Math.max(0, entry.fields.findIndex((f) => f.active));
        const input = inputs[at];
        if (input) { input.focus(); input.select(); input.scrollIntoView({ block: "center" }); }
      }
    },
  };
}
