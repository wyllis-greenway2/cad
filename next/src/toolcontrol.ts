// The tools, run the one way (`dec_three_surfaces`, `in_1598`, `in_1599`, `in_1602`): one controller for what is armed, which knows nothing of any tool. A menu item arms a tool (`arm`): its task (`tasks.ts`) says what is asked or told, in a persistent notice, goes on each frame and says when it
// is done; a right click (`finish`) commits what is valid, throws away what is not and disarms; Esc (`cancel`) throws the draft away, then disarms; a badge follows the pointer (drawn from `armed()`). The mover's orient is the same lifecycle (`orient`), without a tool. It draws nothing:
// its sentences are notices.
import { toolOf, type ToolSpec } from "./interaction/toolspec.ts";
import type { Handle } from "./interaction/notices.ts";
import { orient, taskFor, type Task, type ToolHost } from "./tasks.ts";

export type { ToolHost } from "./tasks.ts";
export function createToolControl(host: ToolHost) {
  let armed: ToolSpec | null = null, task: Task | null = null, prompt: Handle | null = null, last = "";
  const say = (text: string | null) => { if (!text) { prompt?.clear(); prompt = null; last = ""; return; } if (text === last && prompt) return; last = text; if (prompt) prompt.set(text); else prompt = host.notify(text, { persistent: true }); };
  const disarm = () => { armed = null; task = null; say(null); };
  /** the task going now: the armed tool's, or the orient of the mover when no tool is armed */
  const current = (): Task | null => task ?? (host.orient.on() ? orient(host) : null);
  return {
    armed: (): ToolSpec | null => armed,
    additive: (): boolean => !!task?.additive,
    /** a menu item chosen (or a suggestion that is a tool): what is already selected is used first, so a tool with what it needs runs at once */
    arm(id: string): void {
      const spec = toolOf(id); if (!spec) return;
      host.endGame(); disarm(); armed = spec; task = taskFor(spec, host);
      if (!task) { armed = null; return; } // (done at once)
      this.update(0);
    },
    /** each frame */
    update(now: number): void {
      const t = current(); if (!t) { say(null); return; }
      const r = t.update(now);
      if (r === "done") { if (task) disarm(); else say(null); return; }
      say(t.say());
    },
    /** A right click: what is valid is kept, what is not is thrown away, and the tool is put away. Returns whether there was something to finish (false: the ring may open). */
    finish(): boolean { const t = current(); if (!t) return false; t.commit(); disarm(); return true; },
    /** Esc: the draft is thrown away, valid or not; with none, the tool is put away. Returns whether it did something. */
    cancel(): boolean { const t = current(); if (!t) return false; if (!t.cancel()) disarm(); return true; },
    disarm,
  };
}
export type ToolControl = ReturnType<typeof createToolControl>;
