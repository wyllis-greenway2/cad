// The rows the menu always ends with, whatever is selected: save, open, and the scroll mode (what a scroll does: a trackpad pans and a wheel zooms, or always one).
export interface AppRow { id: string; label: string; enabled: boolean; why: string | null }
export type ScrollMode = "auto" | "pan" | "zoom";

const NEXT: Record<ScrollMode, ScrollMode> = { auto: "pan", pan: "zoom", zoom: "auto" };
const LABEL: Record<ScrollMode, string> = { auto: "Scroll: trackpad pans, wheel zooms", pan: "Scroll: always pans", zoom: "Scroll: always zooms" };

/** How much of a trackpad's scroll the view pans by (`in_303`): trackpads and their system settings differ a lot, so it is the user's choice. */
const PAN_LEVELS = [{ name: "low", scale: 0.15 }, { name: "medium", scale: 0.3 }, { name: "high", scale: 0.5 }] as const;
export const nextPanScale = (scale: number): number => { const i = PAN_LEVELS.findIndex((l) => Math.abs(l.scale - scale) < 1e-9); return PAN_LEVELS[(i + 1) % PAN_LEVELS.length]!.scale; };
const panName = (scale: number): string => PAN_LEVELS.reduce((a, l) => (Math.abs(l.scale - scale) < Math.abs(a.scale - scale) ? l : a)).name;

export const appRows = (mode: ScrollMode, build = "", can: { undo: boolean; redo: boolean; exportStl?: boolean; exportBody?: boolean; /** how many mates are no longer true (`in_315`) */ matesOff?: number; /** the tape measure is on (`in_338`) */ tape?: boolean } = { undo: true, redo: true }, allConstraints = false, multiSelect = false, panScale = 0.3): AppRow[] => [
  { id: "undo", label: "Undo", enabled: can.undo, why: "nothing to undo" },
  { id: "redo", label: "Redo", enabled: can.redo, why: "nothing to redo" },
  ...(can.matesOff ? [{ id: "mate:reapply", label: `Put the ${can.matesOff === 1 ? "mate" : `${can.matesOff} mates`} that ${can.matesOff === 1 ? "is" : "are"} no longer true back`, enabled: true, why: null }] : []),
  { id: "tape:measure", label: can.tape ? "Tape measure: on (tap to put away)" : "Tape measure", enabled: true, why: null },
  { id: "bodies", label: "Bodies", enabled: true, why: null },
  { id: "history", label: "History", enabled: true, why: null },
  { id: "groups", label: "Groups", enabled: true, why: null },
  { id: "save", label: "Save", enabled: true, why: null },
  { id: "open", label: "Open…", enabled: true, why: null },
  { id: "exportStl", label: "Export STL…", enabled: can.exportStl ?? true, why: "nothing to export yet: make a body" },
  ...(can.exportBody ? [{ id: "exportBody", label: "Export the selected body as STL…", enabled: true, why: null }] : []),
  { id: "share", label: "Share state (a file to send for a bug report)", enabled: true, why: null },
  { id: "constraints", label: allConstraints ? "Constraints: all shown" : "Constraints: only the ones that can change the body", enabled: true, why: null },
  { id: "multiselect", label: multiSelect ? "Select several: on (a tap adds or takes out)" : "Select several: off", enabled: true, why: null },
  { id: "panSpeed", label: `Trackpad pan: ${panName(panScale)} (tap to change)`, enabled: true, why: null },
  { id: "scrollMode", label: LABEL[mode], enabled: true, why: null },
  ...(build ? [{ id: "build", label: `Build ${build}`, enabled: false, why: "which version of the app this page is running" }] : []),
];
export const nextScrollMode = (mode: ScrollMode): ScrollMode => NEXT[mode];
export const isScrollMode = (s: string | null): s is ScrollMode => s === "auto" || s === "pan" || s === "zoom";
