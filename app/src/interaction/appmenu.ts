import { lengthText } from "../shared/units.ts";
// The rows of the ⋯ list, always all there and dimmed when one cannot be used (`in_661`): the lists, import, export, Fabricate, and the settings page (the view, the mouse and the keyboard are there, `dec_settings_page`).
export interface AppRow { id: string; label: string; enabled: boolean; why: string | null }
export const appRows = (build = "", can: { undo?: boolean; redo?: boolean; export?: boolean; /** the kernel's answers are kept between sessions (`dec_description_cache`): a row to forget them */ clearAnswers?: boolean } = {}): AppRow[] => [
  { id: "undo", label: "Undo", enabled: can.undo ?? true, why: "nothing to undo" }, // (they are here and not in the ring, `in_1281`)
  { id: "redo", label: "Redo", enabled: can.redo ?? true, why: "nothing to redo" },
  { id: "bodies", label: "Bodies", enabled: true, why: null },
  { id: "history", label: "History", enabled: true, why: null },
  { id: "groups", label: "Groups", enabled: true, why: null },
  { id: "import", label: "Import…", enabled: true, why: null }, // (every file coming in, a project too; Open is gone, `in_1083`)
  { id: "export", label: "Export…", enabled: can.export ?? true, why: "nothing to export yet" }, // (every file going out, a project first; Save and Share state are gone, `in_1083`)
  { id: "fabricate", label: "Fabricate", enabled: true, why: null }, // (a list of its own: the laser, `in_1083`)
  { id: "clearAnswers", label: "Clear cache", enabled: !!can.clearAnswers, why: "no kept answers in this page" },
  { id: "settings", label: "Settings…", enabled: true, why: null }, // (the options of the view, the mouse and the keyboard, and the number system are on their own page, `in_661`)
  { id: "build", label: build ? `Build ${build}` : "Build", enabled: false, why: "which version of the app this page is running" },
];
/** The list under Fabricate in the ⋯ list: what is made from a drawing with a laser, and the clearance of the whole model (`in_1083`, `in_1097`; the material and the fastener tool are in the ring, Shape, Fabricate). */
export const fabricateRows = (can: { laser?: boolean; laserLayers?: boolean; laserTable?: boolean } = {}, clearance = 0): AppRow[] => [
  { id: "laser", label: "Laser cut…", enabled: can.laser ?? true, why: "draw something, or select a sketch first" },
  { id: "laserLayers", label: "Laser layers…", enabled: can.laserLayers ?? true, why: "select lines or a figure of the drawing first" },
  ...(can.laserTable ? [{ id: "laserTable", label: "Laser table…", enabled: true, why: null }] : []),
  { id: "hard:clearance", label: `Clearance ${lengthText(clearance)}`, enabled: true, why: null }, // (the gap of the whole model for parts that fit one another, stepped through a few small values on each press: Fabricate, `in_1097`)
];
export type ScrollMode = "auto" | "pan" | "zoom";
export const isScrollMode = (s: string | null): s is ScrollMode => s === "auto" || s === "pan" || s === "zoom";
