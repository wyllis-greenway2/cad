// The rows the menu always ends with, whatever is selected: save, open, and the scroll mode (what a scroll does: a trackpad pans and a wheel zooms, or always one).
export interface AppRow { id: string; label: string; enabled: boolean; why: string | null }
export type ScrollMode = "auto" | "pan" | "zoom";

const NEXT: Record<ScrollMode, ScrollMode> = { auto: "pan", pan: "zoom", zoom: "auto" };
const LABEL: Record<ScrollMode, string> = { auto: "Scroll auto", pan: "Scroll pans", zoom: "Scroll zooms" }; // (the rows are one or two words, `in_541`)

/** How much of a trackpad's scroll the view pans by (`in_303`): trackpads and their system settings differ a lot, so it is the user's choice. */
const PAN_LEVELS = [{ name: "low", scale: 0.15 }, { name: "medium", scale: 0.3 }, { name: "high", scale: 0.5 }] as const;
export const nextPanScale = (scale: number): number => { const i = PAN_LEVELS.findIndex((l) => Math.abs(l.scale - scale) < 1e-9); return PAN_LEVELS[(i + 1) % PAN_LEVELS.length]!.scale; };
const panName = (scale: number): string => PAN_LEVELS.reduce((a, l) => (Math.abs(l.scale - scale) < Math.abs(a.scale - scale) ? l : a)).name;

export const appRows = (mode: ScrollMode, build = "", can: { export?: boolean; /** how many mates are no longer true (`in_315`) */ matesOff?: number; /** the kernel's answers are kept between sessions (`dec_description_cache`): a row to forget them */ clearAnswers?: boolean } = {}, allConstraints = false, panScale = 0.3, outlines = true, clearance = 0): AppRow[] => [
  ...(can.matesOff ? [{ id: "mate:reapply", label: "Reapply mates", enabled: true, why: null }] : []),
  { id: "bodies", label: "Bodies", enabled: true, why: null },
  { id: "history", label: "History", enabled: true, why: null },
  { id: "groups", label: "Groups", enabled: true, why: null },
  { id: "save", label: "Save", enabled: true, why: null },
  { id: "open", label: "Open…", enabled: true, why: null },
  { id: "import", label: "Import…", enabled: true, why: null },
  { id: "export", label: "Export…", enabled: can.export ?? true, why: "nothing to export yet: make a body, or draw something" },
  ...(can.clearAnswers ? [{ id: "clearAnswers", label: "Clear cache", enabled: true, why: null }] : []),
  { id: "share", label: "Share state", enabled: true, why: null },
  { id: "constraints", label: allConstraints ? "All constraints" : "Key constraints", enabled: true, why: null },
  { id: "hard:clearance", label: `Clearance ${clearance}`, enabled: true, why: null },
  { id: "outlines", label: outlines ? "✓ Edge lines" : "Edge lines", enabled: true, why: null },
  { id: "panSpeed", label: `Pan ${panName(panScale)}`, enabled: true, why: null },
  { id: "scrollMode", label: LABEL[mode], enabled: true, why: null },
  ...(build ? [{ id: "build", label: `Build ${build}`, enabled: false, why: "which version of the app this page is running" }] : []),
];
export const nextScrollMode = (mode: ScrollMode): ScrollMode => NEXT[mode];
export const isScrollMode = (s: string | null): s is ScrollMode => s === "auto" || s === "pan" || s === "zoom";
