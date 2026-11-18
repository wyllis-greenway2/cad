// A copy of the project kept in the browser as it is worked (`in_910`, `q_limits_and_failures`): a page that crashes (the kernel's memory above 4 GB killed the tab after 46 s) or is closed by mistake lost everything not saved to a file.
// Two places: the copy of this session (written a moment after each change) and the copy of the session before it (found when the page was opened, kept until another session has something of its own to put there): so a crash, then a
// reload that is only looked at, then another reload, still has the work. A copy that does not fit in the browser's storage is not kept and the person is told once.
import type { Result } from "../shared/result.ts";

export interface KeptCopy { text: string; savedAt: number; steps: number }
interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const NOW_KEY = "cad.autosave", PREV_KEY = "cad.autosave.prev";

const read = (s: Store, key: string): KeptCopy | null => {
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<KeptCopy>;
    return typeof j.text === "string" && typeof j.savedAt === "number" && typeof j.steps === "number" ? { text: j.text, savedAt: j.savedAt, steps: j.steps } : null;
  } catch { return null; }
};

export function createAutosave(store: Store | null, opts: { delayMs?: number; now?: () => number; later?: (f: () => void, ms: number) => unknown; cancel?: (h: unknown) => void } = {}) {
  const delay = opts.delayMs ?? 1500, now = opts.now ?? Date.now;
  const later = opts.later ?? ((f, ms) => setTimeout(f, ms)), cancel = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  // the copy of the session before this one moves to its own place when there is something in it
  if (store) { const before = read(store, NOW_KEY); if (before && before.steps > 0) { try { store.setItem(PREV_KEY, JSON.stringify(before)); } catch { /* (full: the old one stays) */ } } try { store.removeItem(NOW_KEY); } catch { /* (no storage) */ } }
  let pending: { text: () => string; steps: number } | null = null;
  let timer: unknown = null;
  let full = false;
  const write = (): Result<true> => {
    const p = pending; pending = null; timer = null;
    if (!store || !p || p.steps === 0) return { ok: true, value: true };
    try { store.setItem(NOW_KEY, JSON.stringify({ text: p.text(), savedAt: now(), steps: p.steps } satisfies KeptCopy)); full = false; return { ok: true, value: true }; }
    catch (e) { const first = !full; full = true; return { ok: false, error: first ? "this project is too big to keep a copy of in the browser: save it to a file" : "" }; }
  };
  return {
    /** The project as it is, to be kept a moment from now (`text` is asked for then, not now: a long project takes a few milliseconds to write down). Says what went wrong, once. */
    remember(text: () => string, steps: number, tell: (why: string) => void = () => {}): void {
      pending = { text, steps };
      if (timer !== null) cancel(timer);
      timer = later(() => { const r = write(); if (!r.ok && r.error) tell(r.error); }, delay);
    },
    /** Write what is waiting at once (the page is being closed or hidden). */
    flush(): void { if (timer !== null) cancel(timer); if (pending) write(); },
    /** What the session before this one had when the page was opened, if it had anything. */
    previous: (): KeptCopy | null => (store ? read(store, PREV_KEY) : null),
    forgetPrevious(): void { try { store?.removeItem(PREV_KEY); } catch { /* (no storage) */ } },
  };
}
