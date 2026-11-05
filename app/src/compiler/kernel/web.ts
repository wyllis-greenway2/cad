// The browser entry for the kernel (kept apart from index.ts so tests in Node never load the bundler-only URL import).
import { kernel } from "./index.ts";
import { initWeb } from "./occt/web.mjs";

export { kernel };
export const initKernelWeb = initWeb;
