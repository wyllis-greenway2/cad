// The part of `interpreter.mjs` that tests reach (`test/perbody.test.ts`, `test/prismkept.test.ts`): the kernel's own check that a shape is a valid solid (or a compound of valid solids), and the counts and the reset of what it keeps.
export function isValidSolid(shape: unknown): boolean;
export const kernelStats: { prismsBuilt: number; prismsReused: number; partialBooleans: number; booleansKept: number };
export function clearKernelCaches(): void;
