// What every dev check repeats, written once: a line per check, a tolerance compare, and the count of failures.
let failures = 0;
/** one line for a check: ok or FAIL, what was checked, and what was found; a failure is counted */
export const check = (label: string, ok: boolean, detail = ""): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`);
};
/** a failure found by code outside `check` */
export const fail = (): void => {
  failures++;
};
export const failureCount = (): number => failures;
/** the same number, to a relative tolerance (1e-6 unless said) */
export const near = (a: number, b: number, t = 1e-6): boolean => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
/** two fingerprints (or any text with numbers in it) are the same when the words are and every number is within a relative 1e-6: the kernel's sums differ in the 8th digit with the way a shape was built */
export const same = (a: string, b: string): boolean => {
  if (a === b) return true;
  const num = /-?\d+\.\d+(?:e[+-]?\d+)?/g,
    ta = a.split(num),
    tb = b.split(num),
    na = a.match(num) ?? [],
    nb = b.match(num) ?? [];
  return (
    ta.length === tb.length &&
    ta.every((s, i) => s === tb[i]) &&
    na.length === nb.length &&
    na.every((x, i) => near(Number(x), Number(nb[i]), 1e-6))
  );
};
