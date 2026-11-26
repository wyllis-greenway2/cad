// Notices: the one way the page tells a person something (`dec_three_surfaces`, `in_1598`, `in_1600`). Every message goes through one `notify(text, options)`; there is nothing else that says a sentence (the tooltips are the words of an item, not a message).
//   persistent: it belongs to something that is going on (a tool's prompt, "Making...", an engine's problem) and stays until its owner clears it (the handle)
//   temporary: it reports what happened (saved, a refusal's words) and goes after `ttl` ms, fading in the last moments; the same words said again begin again, they are not stacked
// At most `max` stand at once: when there are more, the oldest temporary ones go first. Pure but for the list it keeps; the clock is given, so it can be checked.
export type NoticeKind = "info" | "warn" | "error";
export interface NoticeOptions {
  kind?: NoticeKind;
  persistent?: boolean;
  /** ms, for a temporary one (default 5000) */ ttl?: number;
}
export interface Notice {
  id: number;
  text: string;
  kind: NoticeKind;
  persistent: boolean;
  /** when a temporary one goes (ms on the clock; Infinity: it stays) */ until: number;
}
export interface Handle {
  clear(): void;
  /** change the words of a notice that is still there (a prompt that goes on to the next thing to ask) */ set(
    text: string,
  ): void;
}
export const FADE_MS = 500;

export function createNotices(max = 3, clock: () => number = () => performance.now()) {
  let list: Notice[] = [],
    next = 1;
  const live = (now: number) => (list = list.filter((n) => now < n.until));
  return {
    notify(text: string, o: NoticeOptions = {}): Handle {
      const now = clock(),
        persistent = !!o.persistent,
        until = persistent ? Infinity : now + (o.ttl ?? 5000),
        kind = o.kind ?? "info";
      live(now);
      const same = !persistent ? list.find((n) => !n.persistent && n.text === text && n.kind === kind) : undefined;
      const n: Notice = same ? Object.assign(same, { until }) : { id: next++, text, kind, persistent, until };
      if (!same) list.push(n);
      while (list.length > max) {
        const old = list.find((x) => !x.persistent);
        if (!old) break;
        list = list.filter((x) => x !== old);
      }
      return {
        clear: () => {
          list = list.filter((x) => x !== n);
        },
        set: (t: string) => {
          if (list.includes(n)) n.text = t;
        },
      };
    },
    /** what stands now, in the order it is drawn (the oldest first), with how much of each is left to see (1 until a temporary one begins to fade) */
    visible(now: number = clock()): (Notice & { fade: number })[] {
      return live(now).map((n) => ({ ...n, fade: n.persistent ? 1 : Math.min(1, (n.until - now) / FADE_MS) }));
    },
    /** every notice goes (a new model) */
    clearAll(): void {
      list = [];
    },
  };
}
export type Notices = ReturnType<typeof createNotices>;
