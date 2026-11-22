// What every dev check repeats, written once: a line per check, a tolerance compare, and the count of failures.
let failures = 0;
/** one line for a check: ok or FAIL, what was checked, and what was found; a failure is counted */
export const check = (label: string, ok: boolean, detail = ""): void => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
/** a failure found by code outside `check` */
export const fail = (): void => { failures++; };
export const failureCount = (): number => failures;
/** the same number, to a relative tolerance (1e-6 unless said) */
export const near = (a: number, b: number, t = 1e-6): boolean => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
