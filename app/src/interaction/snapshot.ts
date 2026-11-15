// A snapshot of everything needed to see what the human sees (`in_200`): the project (so it can be opened again), the camera, the selection, what tool or operation is on, what the pointer is over, what the kernel
// made or complained about, and the last things the human did. Pure: the page adds what only it knows (the window, the device, the build) and saves it to a file.
import type { Intent } from "../shared/input.ts";
import type { AppState } from "./control/state.ts";
import { scene as sceneOf, selection as selectionOf } from "./session.ts";
import { toText } from "../operation/file.ts";
import { settings } from "../shared/settings.ts";
import { candidatesAt } from "./picking.ts";
import { pickOpts } from "./control/state.ts";
import { projector, eyeDistance, mixOf } from "./camera.ts";
import { compileTimings } from "../compiler/compile.ts";
import type { CompileOutcome } from "../compiler/compile.ts";

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const camSummary = (c: AppState["cam"]) => ({ target: c.target.map(r4), distance: r4(c.distance), azimuth: r4(c.azimuth), elevation: r4(c.elevation), straight: c.straight, mix: c.mix === undefined ? 1 : r4(c.mix), eyeDistance: r4(eyeDistance(c)), perspective: r4(mixOf(c)) });

/** One line of the log of what the human did: the intent, shortened (and the camera after it, for the intents that move the view). */
export function logEntry(i: Intent, s: AppState, t: number): Record<string, unknown> {
  const move = ["orbit", "pan", "zoom", "look", "home", "dragEnd"].includes(i.type);
  return { t: Math.round(t), ...Object.fromEntries(Object.entries(i).map(([k, v]) => [k, typeof v === "number" ? r4(v) : v])), ...(move ? { cam: camSummary(s.cam) } : {}) };
}

export interface Extras { intents: unknown[]; viewport: { w: number; h: number; dpr: number }; device: string; userAgent: string; build: string; scrollMode: string; at: string; pointer: { x: number; y: number } | null; /** where the time went (`in_216`) */ timing?: Record<string, unknown> }

/** Where the kernel's time went for the last answer, and how the app's compiles have gone since the page began: what to read when a change is slow (`in_441`). */
export function profileOf(k: CompileOutcome["kernel"]): Record<string, unknown> {
  const r = (v: number) => Math.round(v * 10) / 10;
  const ops = k?.ops ?? [];
  const made = ops.filter((o) => !o.cached);
  return {
    compile: compileTimings(),
    kernel: k ? {
      totalMs: r(k.totalMs), stale: !!k.stale, ...(k.fromCache ? { fromCache: true } : {}), perf: k.perf ? Object.fromEntries(Object.entries(k.perf).map(([n, v]) => [n, r(v)])) : null,
      ops: { total: ops.length, kept: ops.length - made.length, madeMs: r(made.reduce((a, o) => a + o.ms, 0)) },
      slowest: [...made].sort((a, b) => b.ms - a.ms).slice(0, 8).filter((o) => o.ms >= 1).map((o) => ({ id: o.id, type: o.type, ms: r(o.ms), ...(o.checkMs ? { checkMs: o.checkMs } : {}), ...(o.markMs ? { markMs: o.markMs } : {}), ...(o.stages ? { stages: o.stages } : {}), ...(o.error ? { error: true } : {}) })),
      describe: k.describe ?? null,
    } : null,
  };
}

export function snapshotOf(s: AppState, extras: Extras): Record<string, unknown> {
  const sc = sceneOf(s.session);
  const outcome = s.session.outcome;
  const kinds: Record<string, number> = {};
  for (const p of Object.values(sc.parts)) { const k = `${p.origin}/${p.kind}`; kinds[k] = (kinds[k] ?? 0) + 1; }
  const k = outcome.kernel;
  const under = extras.pointer ? candidatesAt(sc, projector(s.cam, extras.viewport.w, extras.viewport.h).view(extras.pointer.x, extras.pointer.y), pickOpts(s)).slice(0, 8).map((c) => `${c.kind}:${c.ref}`) : [];
  return {
    what: "cad state snapshot (in_200): open `project` as a file to get the model back",
    at: extras.at, build: extras.build, viewport: extras.viewport, device: extras.device, userAgent: extras.userAgent, scrollMode: extras.scrollMode,
    camera: camSummary(s.cam),
    selection: [...selectionOf(s.session)],
    hover: s.session.hover ?? null,
    underPointer: under,
    world: s.world, paneHover: s.paneHover, orthoDebt: r4(s.orthoDebt), mixT0: s.mixT0,
    tool: s.tool ? { kind: s.tool.kind, plane: s.tool.plane, points: s.tool.points, cursor: s.tool.cursor, hints: s.tool.hints?.map((h) => h.kind) ?? [] } : null,
    op: s.op ? { kind: s.op.kind, typed: s.op.typed, value: s.op.value, axis: s.op.axis, parts: s.op.parts, made: s.op.made, auto: s.op.auto } : null,
    repeat: !!s.repeat, panel: s.panel, menuOpen: !!s.menu, animating: !!s.anim, resume: s.resume, focus: s.focus,
    message: s.session.message, conflict: s.session.conflict, lagging: s.session.lagging,
    kernel: { errors: outcome.errors, volume: k?.volume ?? null, bbox: k?.bbox ?? null, faces: k?.faces?.length ?? null, edges: k?.edges?.length ?? null, totalMs: k ? Math.round(k.totalMs) : null, perf: k?.perf ? Object.fromEntries(Object.entries(k.perf).map(([n, v]) => [n, Math.round(v)])) : null },
    timing: extras.timing ?? null,
    profile: profileOf(outcome.kernel), // (where the time of the last compile went: the steps made and the ones found as they were, the slowest, how the bodies were described, `in_441`)
    scene: { partsByKind: kinds, relations: sc.relations.length, steps: sc.steps.map((st) => `${st.id}:${st.type}`), counter: sc.counter },
    history: { commands: s.session.history.commands.length, cursor: s.session.history.cursor },
    settings: { view: settings.view, input: settings.input, pick: settings.pick, sketch: settings.sketch },
    intents: extras.intents,
    project: JSON.parse(toText(s.session.history)),
  };
}
