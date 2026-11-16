// The one door into the manufacturing modules (`inv_manufacturing_boundary`): the rest of the app imports from here and from nowhere deeper. The contract, the registry of routes (the cut point for adding and removing one) and the shared Emit stage.
export * from "./contract/index.ts";
export { createRegistry, runRoute, defaultSettings, checkSettings, whyBadParams } from "./registry.ts";
export type { Registry, Outcome } from "./registry.ts";
export { writeGcode } from "./core/gcode.ts";
