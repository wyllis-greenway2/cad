// What a tool is while it is armed (`dec_three_surfaces`, `in_1599`, `in_1602`): one small interface, the same for every tool, so the controller (`toolcontrol.ts`) knows nothing of any tool. A TASK says its sentence (what the person is asked, or told, now), goes on each frame
// (it may be done), COMMITS what is valid and throws away the rest (the right click), and CANCELS its draft (Esc). A tool of a kind that exists is a registry entry (`interaction/toolspec.ts`) and nothing else; a new KIND of tool is one factory here.
import { constraintAsk, constraintStatus, faceStatus, type ToolSpec } from "./interaction/toolspec.ts";
import type { Handle, NoticeOptions } from "./interaction/notices.ts";
import type { BodyPick, Selection } from "./selection.ts";
import type { Relation } from "./engine/solver.ts";
import type { Operation } from "./interaction/operation.ts";

export interface Task {
  /** the sentence now (null: none) */
  say(): string | null;
  /** each frame: whether it is still going, or done (and the tool is put away) */
  update(now: number): "going" | "done";
  /** the right click: keep what is valid, throw the rest away */
  commit(): void;
  /** Esc: throw the draft away; true: that was a draft of a tool that goes on (it stays armed), false: nothing of the kind, or a one-off: the tool is put away */
  cancel(): boolean;
  /** picks add to what is selected (a click selects without replacing) */
  additive?: boolean;
}
/** what the page lets the tasks do (each hook is one of its controllers) */
export interface ToolHost {
  notify(text: string, o?: NoticeOptions): Handle;
  selection: Selection;
  /** a drawing tool is armed: the view turns straight, the tool is on; how many places of its figure are down (null: no drawing tool is on); the figure under way is given up, then the tool put away */
  draw(kind: string): void;
  drawStep(): number | null;
  drawStop(): boolean;
  /** the Extrude tool: armed, an operation open (the thing being pulled), whether what is pulled is valid (a size above nothing), applied, given up, and the words for what is open */
  extrude: {
    show(op: Operation): void;
    start(): void;
    active(): boolean;
    open(): boolean;
    valid(): boolean;
    apply(): boolean;
    cancel(): boolean;
    words(): string | null;
  };
  plane(): void;
  /** what is picked on a body: a sketch on the face, or the operation a tool opens on it (`body:pull`, `body:round`, `body:chamfer`; null: none) */
  sketchFace(pick: BodyPick): void;
  bodyOp(action: string, pick: BodyPick): Promise<Operation | null>;
  /** the body moved and turned by the mover orb: begun on a body (false: it cannot be, and has said why), whether it is on, made (the steps), given up */
  mover: { start(body: string): boolean; on(): boolean; commit(): void; cancel(): void };
  /** the kinds of the parts selected in the sketch, and a relation put on them (false: the sketch said no, in words and red) */
  selectedKinds(): string[];
  relate(rel: Relation): boolean;
  /** the mover being turned to orient a plane: whether, keep it where it is, put it back */
  orient: { on(): boolean; keep(): boolean; cancel(): boolean };
  endGame(): void;
}

/** the operation open (a pull, an extrude, a round) is a draft that is valid or not: the right click makes it if it is valid, Esc throws it away */
const settle = (host: ToolHost, commit: boolean) => {
  if (host.extrude.open() && commit && host.extrude.valid()) host.extrude.apply();
  else host.extrude.cancel();
};

const draw = (spec: ToolSpec, host: ToolHost): Task => {
  host.draw(spec.arg);
  return {
    say: () => {
      const step = host.drawStep();
      return step === null ? null : spec.needs[Math.min(step, spec.needs.length - 1)]!.ask;
    },
    update: () => (host.drawStep() === null ? "done" : "going"),
    commit: () => {
      while (host.drawStop()) {
        /* the figure under way is given up, the tool put away */
      }
    },
    cancel: () => {
      if ((host.drawStep() ?? 0) > 0) {
        host.drawStop();
        return true;
      }
      while (host.drawStop()) {
        /* the tool put away */
      }
      return false;
    },
  };
};
/** the Extrude tool: the click that picks a closed shape opens the operation, which is then the draft */
const extrude = (spec: ToolSpec, host: ToolHost): Task => {
  host.extrude.start();
  let seen = false;
  return {
    say: () =>
      host.extrude.open()
        ? (host.extrude.words() ?? "Drag the arrow, or type a distance. Right click to finish.")
        : spec.needs[0]!.ask,
    update: () => {
      if (host.extrude.open()) {
        seen = true;
        return "going";
      }
      return seen || !host.extrude.active() ? "done" : "going";
    },
    commit: () => settle(host, true),
    cancel: () => {
      settle(host, false);
      return false;
    },
  };
};
/** a tool for what is picked on a body: it runs when it has what it needs (from what was already picked, or from the picks), and then the operation it opens is the draft */
const body = (spec: ToolSpec, host: ToolHost): Task => {
  let ran = false,
    since = 0,
    seen = false,
    over = false;
  const warn = "";
  const need = () => spec.needs[0]!.ask;
  const status = () => {
    const p = host.selection.body();
    return { pick: p, st: faceStatus(spec, p && { faces: p.faces.length, edges: p.edges.length }) };
  };
  return {
    additive: !!spec.needs[0]?.many,
    say: () =>
      ran
        ? host.extrude.open()
          ? (host.extrude.words() ?? "Type a size. Right click to finish.")
          : "Working…"
        : warn || need(),
    update: (now) => {
      if (ran) {
        if (host.extrude.open()) {
          seen = true;
          return "going";
        }
        if (!since) since = now;
        return seen || (now > 0 && now - since > 4000) ? "done" : "going";
      }
      const { pick, st } = status();
      if (st === "met" && pick) {
        ran = true;
        if (spec.arg === "body:sketch") {
          host.sketchFace(pick);
          return "done";
        }
        void host.bodyOp(spec.arg, pick).then((op) => {
          if (op && !over) host.extrude.show(op);
        });
        return "going";
      }
      if (st === "bad") {
        host.notify(`${need()}: that is not it`, { kind: "warn", ttl: 3000 });
        host.selection.clear();
      }
      return "going";
    },
    commit: () => {
      over = true;
      settle(host, true);
    },
    cancel: () => {
      over = true;
      settle(host, false);
      return false;
    },
  };
};
/** a body moved and turned: the orb stands on the body, the draft is where it has been taken; the right click makes it, Esc puts it back */
const move = (spec: ToolSpec, host: ToolHost): Task => {
  let began = false;
  return {
    say: () =>
      began
        ? "Drag the arrows to move and the curves to turn. Right click makes it, Esc puts it back."
        : spec.needs[0]!.ask,
    update: () => {
      if (!began) {
        const p = host.selection.body();
        if (p) {
          began = host.mover.start(p.body);
          host.selection.clear();
        }
        return "going";
      }
      return host.mover.on() ? "going" : "done";
    },
    commit: () => host.mover.commit(),
    cancel: () => {
      host.mover.cancel();
      return false;
    },
  };
};
/** a constraint: a relation put on what is selected when it fits; the tool goes on, asking for the next */
const constraint = (spec: ToolSpec, host: ToolHost): Task => {
  const rel = spec.arg as Relation;
  let ask = constraintAsk(rel, []);
  return {
    additive: true,
    say: () => ask,
    update: () => {
      const kinds = host.selectedKinds(),
        st = constraintStatus(rel, kinds);
      if (st === "met") {
        host.relate(rel);
        host.selection.clear();
        ask = constraintAsk(rel, []);
      } else if (st === "bad") {
        host.notify(`${constraintAsk(rel, [])}: that part does not fit`, { kind: "warn", ttl: 3000 });
        host.selection.clear();
        ask = constraintAsk(rel, []);
      } else ask = constraintAsk(rel, kinds);
      return "going";
    },
    commit: () => {
      /* what was made is made */
    },
    cancel: () => false,
  };
};
/** the mover turned to orient a plane (not a tool of the ring: the orb's own mode, but the same lifecycle) */
export const orient = (host: ToolHost): Task => ({
  say: () => "Turn the mover to orient the plane. Right click keeps it, Esc puts it back.",
  update: () => (host.orient.on() ? "going" : "done"),
  commit: () => {
    host.orient.keep();
  },
  cancel: () => {
    host.orient.cancel();
    return false;
  },
});

/** the one place that knows which kind of tool is which: a new kind of tool is a line here (a tool of a kind that is here is only a registry entry) */
const FACTORY: Record<ToolSpec["kind"], (spec: ToolSpec, host: ToolHost) => Task | null> = {
  draw,
  extrude,
  face: body,
  move,
  constraint,
  plane: (_spec, host) => {
    host.plane();
    return null;
  }, // (done at once: a plane placed)
};
export const taskFor = (spec: ToolSpec, host: ToolHost): Task | null => FACTORY[spec.kind](spec, host);
