// Types for the 2D constraint solver (solver.mjs is the prototype's, kept as it is; `dec_constraint_solver_small`).
export interface System {
  points: Record<string, [number, number]>;
  scalars?: Record<string, number>;
}
/** One constraint: `type` selects the residual (see solver.mjs), the other keys name points or values; `w` < 1 makes it a soft preference. */
export interface SolverConstraint {
  id: string;
  type: string;
  w?: number;
  [key: string]: unknown;
}
export interface SolveResult {
  status: "ok" | "conflict";
  points: Record<string, [number, number]>;
  scalars: Record<string, number>;
  dof: number | null;
  redundant: string[];
  conflicts: string[];
  residual: number;
  iterations: number;
}
export function solve(system: System, constraints: SolverConstraint[], opts?: object): SolveResult;
