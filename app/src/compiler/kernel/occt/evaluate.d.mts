import type { ExportQuality, ExportResult, KernelGraph, KernelResult } from "../adapter.ts";
export const KERNEL_NAME: string;
export function init(options?: object): Promise<unknown>;
export function evaluate(graph: KernelGraph, tess?: { tolerance: number; angular: number }): KernelResult;
export function exportMesh(graph: KernelGraph, quality: ExportQuality): ExportResult;
