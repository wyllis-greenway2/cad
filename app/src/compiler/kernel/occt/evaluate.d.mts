import type { KernelGraph, KernelResult } from "../adapter.ts";
export const KERNEL_NAME: string;
export function init(options?: object): Promise<unknown>;
export function evaluate(graph: KernelGraph, tess?: { tolerance: number; angular: number }): KernelResult;
