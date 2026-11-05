// The one place the app gets a kernel from. To switch kernels, change this file (and the worker entry), nothing else.
import type { Kernel } from "./adapter.ts";
import { KERNEL_NAME, init, evaluate } from "./occt/evaluate.mjs";

export const kernel: Kernel = { name: KERNEL_NAME, init, evaluate };
