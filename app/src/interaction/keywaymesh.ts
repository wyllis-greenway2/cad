// Mesh for the keyway maker (`dec_keyway_maker`, `in_1289`), as a gear is meshed: a keyed hole that is selected gets the shaft that fits it, a shaft the hub that fits it. Either is made from scratch (a shaft, or a hub: a disc with a
// keyed bore) or, with a click on the geometry that is there, cut in: the keyed shaft's keyway into a round shaft, the keyed hole into a round body. Pure.
import type { Scene } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { worldRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Tool } from "./tools.ts";
import { armModel } from "./tools.ts";
import { modelFields } from "../operation/modelkinds.ts";
import type { ModelKind } from "../operation/modelkinds.ts";
import type { KeywayRecord } from "../operation/modelkeyway.ts";
import { ISO14 } from "../operation/splines.ts";
import { bodyOfPart } from "../operation/roundbody.ts";

/** the keyed hole or shaft that is on the body the part `ref` belongs to (the latest made), if the keyway maker made one */
export function keywayOf(scene: Scene, ref: Ref): KeywayRecord | null {
  const body = bodyOfPart(scene, ref);
  const id = body ? (scene.parts[body] as { id?: string } | undefined)?.id : undefined;
  if (!id) return null;
  const all = (scene.keyways ?? []).filter((k) => k.host === id);
  return all[all.length - 1] ?? null;
}
const text = (v: number): string => String(Math.round(v * 1000) / 1000);
/** the box's texts for the shape of a record (the same key, flat or spline) and the play of a fit */
function shapeTyped(rec: KeywayRecord, role: "hole" | "shaft"): Record<string, string> {
  const n = rec.nums;
  return { kind: String(n.kind), ...(n.kind === 0 ? { key: text(n.key), ...(role === "hole" && n.keyDepth > 0 ? { keyDepth: text(n.keyDepth) } : {}) } : {}), ...(n.kind === 1 ? { flat: text(n.flat) } : {}), ...(n.kind === 2 ? { series: String(n.series), size: text(n.size) } : {}), play: "0.1" };
}
/** a box's texts: the Size first, then each of the model's numbers by its key */
function typedFor(kind: ModelKind, size: string, values: Record<string, string>): string[] {
  return [size, ...modelFields(kind).map((f) => values[f.key] ?? "")];
}
const along = (rec: KeywayRecord, s: number): Vec3 => [rec.at[0] + rec.dir[0] * s, rec.at[1] + rec.dir[1] * s, rec.at[2] + rec.dir[2] * s];

/** The tool that makes the part that fits the record: a shaft for a hole, a hub for a shaft; placed on the same axis, in the middle of what it fits */
export function meshTool(rec: KeywayRecord): Tool {
  const hole = rec.role === "hole", kind: ModelKind = hole ? "keyshaft" : "keyhub", mid = (rec.span[0] + rec.span[1]) / 2, run = rec.span[1] - rec.span[0];
  const centre = along(rec, mid), n = rec.nums;
  const base = armModel(kind);
  const dia = n.kind === 2 ? (ISO14.find((r) => r.d === n.size && r.series === (n.series === 0 ? "light" : "medium"))?.D ?? n.size) : n.bore;
  const values: Record<string, string> = { ...shapeTyped(rec, hole ? "hole" : "shaft"), bore: text(n.bore) };
  let size: string;
  if (hole) { const len = Math.round(run + 20); Object.assign(values, { len: String(len), off: text(-len / 2) }); size = String(len); } // (the shaft reaches ten mm out of each side of the hub)
  else { const outer = Math.round(Math.max(1.8 * dia, dia + 12)), thick = Math.max(2, Math.min(15, Math.round(run / 2))); Object.assign(values, { outer: String(outer), thick: String(thick) }); size = String(outer); } // (a hub: a ring of a usual thickness)
  return { ...base, plane: worldRef("XY"), points: [centre], cursor: centre, sized: true, fill: { center: centre, normal: rec.dir, u: rec.ex }, model: { ...base.model!, typed: typedFor(kind, size, values), meshed: rec.id } };
}

/** What a click on a round body that is there turns the meshing tool into: the keyway cut into it (a shaft's, for the keyed hole's meshing; a hole's, for the shaft's). `fill`: what `cutFillOf` read of the body. Null when the tool is not a meshing tool. */
export function meshConvert(tool: Tool, rec: KeywayRecord, fill: { center: Vec3; normal: Vec3; cut: NonNullable<NonNullable<Tool["fill"]>["cut"]> }): Tool | null {
  if (!tool.model?.meshed) return null;
  const toShaft = tool.model.kind === "keyshaft", kind: ModelKind = toShaft ? "keyfit" : "keyhole", base = armModel(kind);
  const values = shapeTyped(rec, toShaft ? "shaft" : "hole");
  if (!toShaft && rec.nums.kind === 0) delete values.keyDepth;
  return { ...base, plane: worldRef("XY"), points: [fill.center], cursor: fill.center, sized: true, fill: { center: fill.center, normal: fill.normal, u: rec.ex, cut: fill.cut }, model: { ...base.model!, typed: typedFor(kind, "", values), meshed: rec.id } };
}
