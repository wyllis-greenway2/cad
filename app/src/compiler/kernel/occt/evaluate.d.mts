import type { ExportQuality, ExportResult, KernelGraph, KernelResult, StepResult } from "../adapter.ts";
export const KERNEL_NAME: string;
export function init(options?: object): Promise<unknown>;
export function evaluate(graph: KernelGraph, tess?: { tolerance: number; angular: number }): KernelResult;
export function exportMesh(graph: KernelGraph, quality: ExportQuality): ExportResult;
export function exportStep(graph: KernelGraph, bodies?: string[], unit?: "in", schema?: "ap203" | "ap214" | "ap242" | "brep"): Promise<StepResult>;
export function heapBytes(): number;
