// The building blocks of the gear assemblies that come as models (`dec_gear_models`): planes at a height, discs and outlines drawn on them and extruded or turned, and gears made with the gear tool and meshed. A model is a list of steps
// (`PartSteps`, as for a fastener: each step is made from the scene the ones before it leave) that the interface runs as ONE command, so it is one step to undo. Pure: numbers in, steps out.
import type { Ref } from "../shared/ref.ts";
import { drawnRef, worldRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import { nextId, figureParams } from "./scene.ts";
import type { Command } from "./commands.ts";
import { apply } from "./commands.ts";
import type { Result } from "../shared/result.ts";
import { ok } from "../shared/result.ts";
import { drawChain, drawCircle } from "./build.ts";
import type { GearSpec } from "./gear.ts";
import type { PartSteps } from "./fasteners.ts";
import { meshWith } from "./mesh.ts";
import type { GearRecord } from "./gearscene.ts";

/** A flat shape on a plane, its points as (x, y) about the plane's origin: a circle, or a closed outline with an optional bulge for each side (the arcs) */
export type Shape = { circle: [number, number]; r: number } | { outline: [number, number][]; bulges?: number[] };
export const disc = (x: number, y: number, r: number): Shape => ({ circle: [x, y], r });
export const outline = (pts: [number, number][], bulges?: number[]): Shape => ({ outline: pts, ...(bulges ? { bulges } : {}) });
/** a rectangle from its corners */
export const box = (x0: number, y0: number, x1: number, y1: number): Shape => outline([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

/** a plane that is made by a step: its name is known once the step has run */
export interface PlaneHolder { ref: Ref; /** the height of a horizontal plane (the plane's own point is at this height); a plane standing upright has 0 */ z: number; /** a point (x, y) of the plane as a point of the model */ to3: (x: number, y: number) => Vec3 }
/** a gear that is made by a step: its name is known once the step has run */
export interface GearHolder { id: string; plane: Ref; at: Vec3; spec: GearSpec; turn: number }

const ground: Ref = worldRef("XY");

/** Where a model stands: the point its middle goes to, and the directions of its x, y and z (the plane's two directions, turned, and its normal): every point and direction of a model is made in its own frame and put here */
export interface Place { at: Vec3; ex: Vec3; ey: Vec3; ez: Vec3 }
const AT_ORIGIN: Place = { at: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] };
const isHome = (p: Place): boolean => p === AT_ORIGIN || (p.at.every((v) => v === 0) && p.ex[0] === 1 && p.ex[1] === 0 && p.ex[2] === 0 && p.ey[0] === 0 && p.ey[1] === 1 && p.ey[2] === 0 && p.ez[0] === 0 && p.ez[1] === 0 && p.ez[2] === 1);
const dirIn = (p: Place, v: Vec3): Vec3 => [p.ex[0] * v[0] + p.ey[0] * v[1] + p.ez[0] * v[2], p.ex[1] * v[0] + p.ey[1] * v[1] + p.ez[1] * v[2], p.ex[2] * v[0] + p.ey[2] * v[1] + p.ez[2] * v[2]];
const pointIn = (p: Place, v: Vec3): Vec3 => { const d = dirIn(p, v); return [p.at[0] + d[0], p.at[1] + d[1], p.at[2] + d[2]]; };

/** The steps of a model, built up one call at a time. Heights are along the ground plane's normal (up). */
/** A model as its steps, and the parts they make one after another: each with its name (the steps from `from` up to `to`), so a model can be built one part at a time and say which */
export interface ModelBuild { steps: PartSteps; parts: { label: string; from: number; to: number }[] }

export class Builder {
  readonly steps: PartSteps = [];
  private readonly marks: { label: string; at: number }[] = [];
  /** the steps that follow make a part called `label` (the planes the model stands on, made before the first, go with the first) */
  part(label: string): void { this.marks.push({ label, at: this.steps.length }); }
  build(): ModelBuild {
    const parts = this.marks.map((m, i) => ({ label: m.label, from: i === 0 ? 0 : m.at, to: i + 1 < this.marks.length ? this.marks[i + 1]!.at : this.steps.length }));
    return { steps: this.steps, parts };
  }
  private readonly place: Place;
  constructor(place: Place = AT_ORIGIN) { this.place = place; }
  /** a plane `z` mm above the ground plane (the ground plane itself for 0) */
  plane(z: number): PlaneHolder {
    const h: PlaneHolder = { ref: ground, z, to3: (x, y) => [x, y, z] };
    if (z === 0 && isHome(this.place)) return h;
    const [at, u, v] = [pointIn(this.place, [0, 0, z]), dirIn(this.place, [1, 0, 0]), dirIn(this.place, [0, 1, 0])];
    this.steps.push((s) => {
      const ref = drawnRef(`${nextId(s, "e")}.pl`);
      h.ref = ref;
      return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at, u, v } } as Command;
    });
    return h;
  }
  /** a plane through the point `at` with the directions `u` and `v` (an upright plane to draw a section of a turned body on) */
  frame(at: Vec3, u: Vec3, v: Vec3): PlaneHolder {
    const h: PlaneHolder = { ref: ground, z: 0, to3: (x, y) => [at[0] + u[0] * x + v[0] * y, at[1] + u[1] * x + v[1] * y, at[2] + u[2] * x + v[2] * y] };
    const [at2, u2, v2] = [pointIn(this.place, at), dirIn(this.place, u), dirIn(this.place, v)];
    this.steps.push((s) => {
      const ref = drawnRef(`${nextId(s, "e")}.pl`);
      h.ref = ref;
      return { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: at2, u: u2, v: v2 } } as Command;
    });
    return h;
  }
  /** draw a shape on a plane; the refs of its sides (or its circle) come back when the step has run, through `out` */
  private draw(pl: PlaneHolder, sh: Shape, out: { refs: Ref[] }): void {
    this.steps.push((s) => {
      if ("circle" in sh) { const r = drawCircle(s, pl.ref, pointIn(this.place, pl.to3(sh.circle[0], sh.circle[1])), sh.r); out.refs = [r.circle]; return r.command; }
      const r = drawChain(s, pl.ref, sh.outline.map(([x, y]) => pointIn(this.place, pl.to3(x, y))), true, sh.bulges ? { bulges: sh.bulges } : {});
      out.refs = r.lines;
      return r.command;
    });
  }
  /**
   * A body: `outer` extruded `depth` mm from the plane (down for a negative depth) with `holes` through it, and each of `also` (a shape with its own holes and depth) joined to it. `mode`: "new" (a body of its own, the default), "add" (joined to
   * the bodies it touches) or "cut".
   */
  extrude(pl: PlaneHolder, outer: Shape, holes: Shape[], depth: number, opt: { mode?: "new" | "add" | "cut"; also?: { outer: Shape; holes?: Shape[]; depth: number }[] } = {}): void {
    const figs = [{ outer, holes, depth }, ...(opt.also ?? []).map((a) => ({ outer: a.outer, holes: a.holes ?? [], depth: a.depth }))];
    const refs = figs.map(() => ({ outer: { refs: [] as Ref[] }, holes: [] as { refs: Ref[] }[] }));
    figs.forEach((f, i) => { this.draw(pl, f.outer, refs[i]!.outer); f.holes.forEach((h, j) => { refs[i]!.holes[j] = { refs: [] }; this.draw(pl, h, refs[i]!.holes[j]!); }); });
    this.steps.push((s) => {
      const f = refs.map((r) => ({ outer: r.outer.refs, holes: r.holes.map((h) => h.refs) }));
      const params: Record<string, string | number> = { depth, ...figureParams(f), ...(opt.mode && opt.mode !== "new" ? { mode: opt.mode } : {}) };
      if (figs.length > 1) params.alsoDepth = figs.slice(1).map((x) => x.depth).join("|");
      return { type: "addStep", step: { id: nextId(s, "s"), type: "extrude", parts: f[0]!.outer, params } } as Command;
    });
  }
  /**
   * A body turned about a line: the closed outline `profile` (points (x, y) of the plane `pl`, which holds the axis; `bulges` the arcs of its sides) turned a full turn about the line through `axisAt` in the direction `axisDir` (both points / directions of the model).
   */
  turn(pl: PlaneHolder, profile: [number, number][], bulges: number[] | undefined, axisAt: Vec3, axisDir: Vec3): void {
    const out = { refs: [] as Ref[] };
    this.draw(pl, outline(profile, bulges), out);
    const [A, D] = [pointIn(this.place, axisAt), dirIn(this.place, axisDir)];
    this.steps.push((s) => ({ type: "addStep", step: { id: nextId(s, "s"), type: "revolve", parts: out.refs, params: { ...figureParams([{ outer: out.refs, holes: [] }]), angle: 360, advance: 0, ax: A[0], ay: A[1], az: A[2], dx: D[0], dy: D[1], dz: D[2] } } }) as Command);
  }
  /** a gear made with the gear tool on a plane (it keeps its numbers: it can be edited and meshed as any gear); `partner`: the gear it meshes with, whose place (and the tooth phase) this gear's `at` and `turn` came from */
  gear(pl: PlaneHolder, at: Vec3, spec: GearSpec, turn = 0, partner?: GearHolder): GearHolder {
    const h: GearHolder = { id: "", plane: pl.ref, at, spec, turn };
    const frame = spec.bevel?.frame;
    const placed: GearSpec = frame ? { ...spec, bevel: { ...spec.bevel!, frame: [dirIn(this.place, frame[0]), dirIn(this.place, frame[1])] } } : spec; // (a bevel gear that stands across: its directions turn with the model)
    const where = pointIn(this.place, at);
    this.steps.push((s) => {
      h.id = nextId(s, "g");
      h.plane = pl.ref;
      return { type: "gear", id: h.id, plane: pl.ref, at: where, spec: placed, ...(turn ? { turn } : {}), ...(partner ? { meshWith: partner.id } : {}) } as Command;
    });
    return h;
  }
}

/** Where the gear that meshes with `g` stands (its centre `where` radians round from the plane's x axis), or why not */
export function meshedWith(g: GearHolder, teeth: number, where: number): { at: Vec3; turn: number; spec: GearSpec } | string {
  const rec: GearRecord = { id: g.id || "g_000", plane: g.plane, at: g.at, spec: g.spec, ...(g.turn ? { turn: g.turn } : {}) };
  const r = meshWith(rec, [1, 0, 0], [0, 1, 0], { teeth, width: g.spec.width }, where);
  return r.ok ? r.value : r.error;
}

/**
 * The steps as ONE command: each is made from the scene the ones before it leave (its names come from the scene's counter), found here by applying them without the kernel, so the kernel is asked once and the model is one step to undo
 * (`addpart.ts` does the same for a fastener).
 */
export function asCommand(sc: Scene, steps: PartSteps): Result<Command> {
  const commands: Command[] = [];
  let at = sc;
  for (const make of steps) {
    const c = make(at);
    const next = apply(at, c);
    if (!next.ok) return next;
    commands.push(c);
    at = next.value;
  }
  return ok({ type: "batch", commands });
}
