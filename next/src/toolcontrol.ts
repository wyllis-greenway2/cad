// The tools, run the one way (`dec_three_surfaces`, `in_1598`, `in_1599`): one controller for what is armed. A menu item arms a tool (`arm`); a badge follows the pointer (drawn from `armed()`); what the tool needs is asked, in order, in a persistent notice and met first from what
// is already selected, then by picks; a tool that has what it needs runs; a right click (`finish`) commits what is valid, throws away what is not and disarms; Esc (`cancel`) throws the draft away, then disarms. The controller decides nothing about drawing, solving or making: each tool kind
// hands that to the page's controllers through the host. It draws nothing itself: its sentences are notices.
import { toolOf, constraintAsk, constraintStatus, faceStatus, type ToolSpec } from "./interaction/toolspec.ts";
import type { Handle, NoticeOptions } from "./interaction/notices.ts";
import type { BodyPick } from "./selection.ts";
import type { Selection } from "./selection.ts";
import type { Relation } from "./engine/solver.ts";

export interface ToolHost {
  notify(text: string, o?: NoticeOptions): Handle;
  selection: Selection;
  /** a drawing tool is armed: the view turns straight, the tool is on; how many places of its figure are down (null: no drawing tool is on); the figure under way is given up, then the tool put away */
  draw(kind: string): void;
  drawStep(): number | null;
  drawStop(): boolean;
  /** the Extrude tool: armed, an operation open (the thing being pulled), whether what is pulled is valid (a size above nothing), applied, given up, and the words for what is open */
  extrude: { start(): void; active(): boolean; open(): boolean; valid(): boolean; apply(): boolean; cancel(): boolean; words(): string | null };
  plane(): void;
  /** what is picked on a body is done with: `body:sketch`, `body:pull`, `body:round`, `body:chamfer` */
  face(action: string, pick: BodyPick): void;
  /** the kinds of the parts selected in the sketch, and a relation put on them (false: the sketch said no, in words and red) */
  selectedKinds(): string[];
  relate(rel: Relation): boolean;
  /** the mover being turned to orient a plane: whether, keep it where it is, put it back */
  orient: { on(): boolean; keep(): boolean; cancel(): boolean };
  endGame(): void;
}

export function createToolControl(host: ToolHost) {
  let armed: ToolSpec | null = null, prompt: Handle | null = null, ran = 0 /* when a body tool ran (ms), 0: not yet */, sawOp = false, last = "";
  const say = (text: string) => { if (text === last && prompt) return; last = text; if (prompt) prompt.set(text); else prompt = host.notify(text, { persistent: true }); };
  const hush = () => { prompt?.clear(); prompt = null; last = ""; };
  const disarm = () => { armed = null; ran = 0; sawOp = false; hush(); };
  /** a constraint or a body tool with what it needs already selected runs at once */
  function tryRun(now: number): void {
    if (!armed) return;
    if (armed.kind === "constraint") {
      const rel = armed.arg as Relation, kinds = host.selectedKinds(), st = constraintStatus(rel, kinds);
      if (st === "met") { host.relate(rel); host.selection.clear(); say(constraintAsk(rel, [])); }
      else if (st === "bad") { host.notify(`${constraintAsk(rel, [])}: that part does not fit`, { kind: "warn", ttl: 3000 }); host.selection.clear(); say(constraintAsk(rel, [])); }
      else say(constraintAsk(rel, kinds));
    } else if (armed.kind === "face" && !ran) {
      const pick = host.selection.body(), st = faceStatus(armed, pick && { faces: pick.faces.length, edges: pick.edges.length });
      if (st === "met" && pick) { ran = now || 1; host.face(armed.arg, pick); if (armed.arg === "body:sketch") disarm(); else say("Working…"); }
      else if (st === "bad") { host.notify(`${armed.needs[0]!.ask}: that is not it`, { kind: "warn", ttl: 3000 }); host.selection.clear(); say(armed.needs[0]!.ask); }
      else say(armed.needs[0]!.ask);
    }
  }
  return {
    armed: (): ToolSpec | null => armed,
    /** picks add to what is selected (a click selects without replacing) for the tools that take several */
    additive: (): boolean => !!armed && (armed.kind === "constraint" || (armed.kind === "face" && !!armed.needs[0]?.many)),
    /** a menu item chosen (or a suggestion that is a tool) */
    arm(id: string): void {
      const spec = toolOf(id); if (!spec) return;
      host.endGame(); this.disarm(); armed = spec;
      if (spec.kind === "draw") { host.draw(spec.arg); say(spec.needs[0]!.ask); }
      else if (spec.kind === "extrude") { host.extrude.start(); say(spec.needs[0]!.ask); }
      else if (spec.kind === "plane") { armed = null; host.plane(); }
      else tryRun(0); // (what is already selected is used first: a constraint or a face tool with what it needs runs at once)
    },
    /** a face tool or a constraint, with its pick made or not yet: said, or run */
    update(now: number): void {
      if (host.orient.on()) { say("Turn the mover to orient the plane. Right click keeps it, Esc puts it back."); return; }
      if (!armed) { if (host.extrude.open()) say(host.extrude.words() ?? "Working…"); else if (prompt) hush(); return; }
      if (armed.kind === "draw") {
        const step = host.drawStep();
        if (step === null) { disarm(); return; }
        say(armed.needs[Math.min(step, armed.needs.length - 1)]!.ask);
      } else if (armed.kind === "extrude") {
        if (host.extrude.open()) { sawOp = true; say(host.extrude.words() ?? "Drag the arrow, or type a distance. Right click to finish."); }
        else if (sawOp || (!host.extrude.active())) { disarm(); }
        else say(armed.needs[0]!.ask);
      } else if (armed.kind === "face") {
        if (ran) { if (host.extrude.open()) { sawOp = true; say(host.extrude.words() ?? "Type a size. Right click to finish."); } else if (sawOp || now - ran > 4000) disarm(); }
        else tryRun(now);
      } else tryRun(now);
    },
    /** A right click: what is valid is kept, what is not is thrown away, and the tool is put away. Returns whether there was something to finish (false: the menu may open). */
    finish(): boolean {
      if (host.orient.on()) { host.orient.keep(); hush(); return true; }
      const under = armed !== null || host.extrude.active();
      if (!under) return false;
      if (host.extrude.open()) { if (host.extrude.valid()) host.extrude.apply(); else host.extrude.cancel(); }
      else host.extrude.cancel();
      if (armed?.kind === "draw") while (host.drawStop()) { /* the figure under way is given up, the tool put away */ }
      disarm(); return true;
    },
    /** Esc: the draft is thrown away, valid or not; with none, the tool is put away. Returns whether it did something. */
    cancel(): boolean {
      if (host.orient.on()) { host.orient.cancel(); hush(); return true; }
      if (host.extrude.open()) { host.extrude.cancel(); if (armed?.kind !== "draw") disarm(); return true; }
      if (armed?.kind === "draw") { if ((host.drawStep() ?? 0) > 0) { host.drawStop(); return true; } while (host.drawStop()) { /* the tool put away */ } disarm(); return true; }
      if (armed || host.extrude.active()) { host.extrude.cancel(); disarm(); return true; }
      return false;
    },
    disarm(): void { disarm(); },
  };
}
export type ToolControl = ReturnType<typeof createToolControl>;
