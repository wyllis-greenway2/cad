// What the UI layer may use. The UI sits directly above the interaction layer (`inv_layer_adjacency`), so everything it needs from below comes through here.
export type { Scene } from "../operation/scene.ts";
export type { Part, Plane, Outline, PointerView } from "../operation/part.ts";
export type { Ref } from "../shared/ref.ts";
export type { Vec3 } from "../math/vec.ts";
export type { Command } from "../operation/commands.ts";
export { outlineOf, pointOf, normalOfPlane, depthOf } from "../operation/part.ts";
export { lookup, nextId } from "../operation/scene.ts";
export { drawRectangle, drawCircle } from "../operation/build.ts";
export { settings } from "../shared/settings.ts";
export { kernel, initKernelWeb } from "../compiler/kernel/web.ts";
export { cornerName } from "../compiler/body.ts";
export { entryOf, previewFor } from "./entry.ts";
export type { Entry } from "./entry.ts";
export { badgesFor, focusParts, suggestMeasure, anchorOf } from "./badges.ts";
export type { Badge, Suggestion } from "./badges.ts";
export { gridFor } from "./grid.ts";
export type { Grid } from "./grid.ts";
export { consumed } from "../operation/ownership.ts";
