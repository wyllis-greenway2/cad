// The manufacturing contract (`dec_manufacturing_contract`, `inv_manufacturing_boundary`): types only, and the version. Imports nothing outside this folder.
export * from "./part.ts";
export * from "./params.ts";
export * from "./findings.ts";
export * from "./toolpath.ts";
export * from "./definitions.ts";
export * from "./route.ts";

/** Whole number. A change that would break a route or a stored plan raises it; a plan or route written for another version says so and is not run blindly. */
export const CONTRACT_VERSION = 1;
