// The one door into the manufacturing modules (`inv_manufacturing_boundary`): the rest of the app imports from here and from nowhere deeper. Today that is the contract and the shared Emit stage; the registry of routes will be added here.
export * from "./contract/index.ts";
export { writeGcode } from "./core/gcode.ts";
