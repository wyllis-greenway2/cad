// The rows the menu always ends with, whatever is selected: save, open, and the scroll mode (what a scroll does: a trackpad pans and a wheel zooms, or always one).
export interface AppRow { id: string; label: string; enabled: boolean; why: string | null }
export type ScrollMode = "auto" | "pan" | "zoom";

const NEXT: Record<ScrollMode, ScrollMode> = { auto: "pan", pan: "zoom", zoom: "auto" };
const LABEL: Record<ScrollMode, string> = { auto: "Scroll: trackpad pans, wheel zooms", pan: "Scroll: always pans", zoom: "Scroll: always zooms" };

export const appRows = (mode: ScrollMode, build = ""): AppRow[] => [
  { id: "bodies", label: "Bodies", enabled: true, why: null },
  { id: "history", label: "History", enabled: true, why: null },
  { id: "save", label: "Save", enabled: true, why: null },
  { id: "open", label: "Open…", enabled: true, why: null },
  { id: "scrollMode", label: LABEL[mode], enabled: true, why: null },
  ...(build ? [{ id: "build", label: `Build ${build}`, enabled: false, why: "which version of the app this page is running" }] : []),
];
export const nextScrollMode = (mode: ScrollMode): ScrollMode => NEXT[mode];
export const isScrollMode = (s: string | null): s is ScrollMode => s === "auto" || s === "pan" || s === "zoom";
