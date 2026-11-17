import { lengthText } from "../shared/units.ts";
// The rows of the ⋯ list, always all there and dimmed when one cannot be used (`in_661`): the lists, save, open, import, export, share, and the settings page (the view, the mouse and the keyboard are there, `dec_settings_page`).
export interface AppRow { id: string; label: string; enabled: boolean; why: string | null }
export const appRows = (build = "", can: { export?: boolean; /** a body is selected, so a material can be tagged on it (`in_597`) */ material?: boolean; /** there is a flat drawing to cut with a laser (`in_662`) */ laser?: boolean; /** the person's laser table has rows to look at (`in_666`) */ laserTable?: boolean; /** drawn lines are selected, so the laser route can mark them (`in_603`) */ laserLayers?: boolean; /** how many mates are no longer true (`in_315`) */ matesOff?: number; /** the kernel's answers are kept between sessions (`dec_description_cache`): a row to forget them */ clearAnswers?: boolean } = {}, allConstraints = false, clearance = 0): AppRow[] => [
  { id: "mate:reapply", label: "Reapply mates", enabled: !!can.matesOff, why: "every mate is true as it is" }, // (always there, dimmed when it cannot be used, `in_661`)
  { id: "bodies", label: "Bodies", enabled: true, why: null },
  { id: "history", label: "History", enabled: true, why: null },
  { id: "groups", label: "Groups", enabled: true, why: null },
  { id: "save", label: "Save", enabled: true, why: null },
  { id: "open", label: "Open…", enabled: true, why: null },
  { id: "import", label: "Import…", enabled: true, why: null },
  { id: "addPart", label: "Add part…", enabled: true, why: null }, // (the fasteners: a hex nut and a countersunk screw, `dec_parts_interface`)
  { id: "material", label: "Material…", enabled: can.material ?? true, why: "select a body first" },
  { id: "export", label: "Export…", enabled: can.export ?? true, why: "nothing to export yet: make a body, or draw something" },
  { id: "laser", label: "Laser cut…", enabled: can.laser ?? true, why: "draw something, or select a sketch first" },
  { id: "laserLayers", label: "Laser layers…", enabled: can.laserLayers ?? true, why: "select lines or a figure of the drawing first" },
  ...(can.laserTable ? [{ id: "laserTable", label: "Laser table…", enabled: true, why: null }] : []),
  { id: "clearAnswers", label: "Clear cache", enabled: !!can.clearAnswers, why: "no kept answers in this page" },
  { id: "share", label: "Share state", enabled: true, why: null },
  { id: "constraints", label: allConstraints ? "All constraints" : "Key constraints", enabled: true, why: null },
  { id: "hard:clearance", label: `Clearance ${lengthText(clearance)}`, enabled: true, why: null },
  { id: "settings", label: "Settings…", enabled: true, why: null }, // (the options of the view, the mouse and the keyboard, and the number system are on their own page, `in_661`)
  { id: "build", label: build ? `Build ${build}` : "Build", enabled: false, why: "which version of the app this page is running" },
];
export type ScrollMode = "auto" | "pan" | "zoom";
export const isScrollMode = (s: string | null): s is ScrollMode => s === "auto" || s === "pan" || s === "zoom";
