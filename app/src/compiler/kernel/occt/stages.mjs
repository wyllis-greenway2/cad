// Where the time of the step being made goes, by stage (ms): kept for the profile of a slow change (`in_443`). `compile` begins the stages of a step and takes them at its end; a few stages inside the step are timed by `stage`.
// When nobody has begun (a boolean made outside a step) `stage` only runs what it is given.
let current = null;
export const beginStages = () => { current = {}; };
export function endStages() { const done = current ?? {}; current = null; return done; }
export function stage(name, fn) {
  if (!current) return fn();
  const t = performance.now();
  try { return fn(); } finally { current[name] = (current[name] ?? 0) + (performance.now() - t); }
}
