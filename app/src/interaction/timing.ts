// Where the time goes (`in_216`): the last few samples of each named piece of work (making the frame, drawing it, ...) summed up for the shared state file, so a slow thing is measured and not guessed at.
export interface Timing {
  add(name: string, ms: number): void;
  summary(): Record<string, { n: number; avgMs: number; p95Ms: number; maxMs: number }>;
}
const KEEP = 120;
export function createTiming(): Timing {
  const samples = new Map<string, number[]>();
  return {
    add(name, ms) {
      const list = samples.get(name) ?? [];
      list.push(ms);
      if (list.length > KEEP) list.shift();
      samples.set(name, list);
    },
    summary() {
      const out: Record<string, { n: number; avgMs: number; p95Ms: number; maxMs: number }> = {};
      const r = (v: number) => Math.round(v * 10) / 10;
      for (const [name, list] of samples) {
        const sorted = [...list].sort((a, b) => a - b);
        out[name] = { n: list.length, avgMs: r(list.reduce((a, b) => a + b, 0) / list.length), p95Ms: r(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!), maxMs: r(sorted[sorted.length - 1]!) };
      }
      return out;
    },
  };
}
