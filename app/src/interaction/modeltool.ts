// The tool that places a gear assembly model (`dec_gear_models`): armed, the first click is the middle of the model on a surface, and a simple picture of it follows (its outlines in the plane, as a gear's does) while its numbers are set in the box:
// the overall size first (or the distance of the pointer from the middle, until a click sets it), the turn, and then its own numbers. A number typed is kept; the ones not typed come from the usual numbers grown or shrunk to the size. Pure.
import type { Tool, Preview } from "./tools.ts";
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane, localOf } from "../operation/part.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { modelFields, modelNumbers, modelCentre, modelExtent, modelProblem, modelOutline, modelBuild, modelTitle, modelAbout } from "../operation/modelkinds.ts";
import type { ModelKind, Nums } from "../operation/modelkinds.ts";
import { asCommand } from "../operation/modelparts.ts";
import type { Place, ModelBuild } from "../operation/modelparts.ts";
import type { Command } from "../operation/commands.ts";

/** What the tool holds: which model, the text typed in each field of the box (the overall size, the turn, then the model's numbers) and the field being typed in */
export interface ModelState { kind: ModelKind; typed: string[]; field: number; /** the box takes the keyboard when it opens */ focus?: true }
const LEAD = ["Size", "Turn"];
const modelLabels = (kind: ModelKind): string[] => [...LEAD, ...modelFields(kind).map((f) => f.label)];
export const armedModel = (kind: ModelKind): ModelState => ({ kind, typed: modelLabels(kind).map(() => ""), field: 0 });
export const modelTyped = (m: ModelState, field: number, text: string): ModelState => ({ ...m, field, typed: m.typed.map((x, i) => (i === field ? text : x)) });

const numOf = (s: string | undefined): number | undefined => { if (s === undefined || s === "" || s === "-" || s === "0.") return undefined; const n = Number(s); return Number.isFinite(n) ? n : undefined; };
/** the usual size of a model's box before the pointer has moved (mm, the way across): nothing, so the usual numbers are the numbers */
const MIN_SIZE = 6;

export interface ModelTarget { kind: ModelKind; nums: Nums; size: number; turn: number; place: Place; problem: string | null; middle: Vec3 }
/** The model the tool would make: its numbers, where it stands and why not, if it cannot be made. Null before the first click. */
export function modelTarget(scene: Scene, t: Tool): ModelTarget | null {
  const m = t.model, pl = t.plane ? (scene.parts[t.plane] as Plane | undefined) : undefined;
  if (!m || !pl || pl.kind !== "plane" || !t.points.length) return null;
  const middle = t.points[0]!, fields = modelFields(m.kind);
  const typed: Nums = {};
  fields.forEach((f, i) => { const v = numOf(m.typed[i + 2]); if (v !== undefined) typed[f.key] = v; });
  const [mx, my] = localOf(pl, middle), cursor = t.cursor ? localOf(pl, t.cursor) : null;
  const reach = cursor ? 2 * Math.hypot(cursor[0] - mx, cursor[1] - my) : 0; // (the pointer's distance from the middle, both ways)
  const size = numOf(m.typed[0]) ?? (reach > 1e-6 ? Math.max(MIN_SIZE, reach) : undefined);
  const nums = modelNumbers(m.kind, typed, size);
  const turn = ((numOf(m.typed[1]) ?? 0) * Math.PI) / 180;
  const [u, v, n] = [pl.u, pl.v, normalOfPlane(pl)];
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const ex: Vec3 = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s], ey: Vec3 = [-u[0] * s + v[0] * c, -u[1] * s + v[1] * c, -u[2] * s + v[2] * c];
  const [cx, cy] = modelCentre(m.kind, nums);
  const at: Vec3 = [middle[0] - ex[0] * cx - ey[0] * cy, middle[1] - ex[1] * cx - ey[1] * cy, middle[2] - ex[2] * cx - ey[2] * cy];
  return { kind: m.kind, nums, size: modelExtent(m.kind, nums), turn, place: { at, ex, ey, ez: n }, problem: modelProblem(m.kind, nums), middle };
}

/** The picture of the model: its outlines in the plane (in red when its numbers make no model) */
export function modelPreview(scene: Scene, t: Tool): Preview | null {
  const g = modelTarget(scene, t);
  if (!g) return null;
  const P = (x: number, y: number): Vec3 => [g.place.at[0] + g.place.ex[0] * x + g.place.ey[0] * y, g.place.at[1] + g.place.ex[1] * x + g.place.ey[1] * y, g.place.at[2] + g.place.ex[2] * x + g.place.ey[2] * y];
  const segments: [Vec3, Vec3][] = [];
  for (const line of modelOutline(g.kind, g.nums)) for (let i = 0; i + 1 < line.length; i++) segments.push([P(line[i]![0], line[i]![1]), P(line[i + 1]![0], line[i + 1]![1])]);
  return { segments, circle: null, cursor: t.cursor, ...(g.problem ? { red: true as const } : {}) };
}

/** The command that makes the model, or why not */
export function modelCommand(scene: Scene, t: Tool): Result<Command> {
  const g = modelBuilding(scene, t);
  if (!g.ok) return g;
  const c = asCommand(scene, g.value.build.steps);
  return c.ok ? ok(c.value) : c;
}
/** A model that is being built a part at a time (`dec_gear_models`): its title, its steps and parts, and how many parts are made */
export interface Building { title: string; build: ModelBuild; next: number }
/** The model the tool would make, with its parts, or why not */
export function modelBuilding(scene: Scene, t: Tool): Result<Building> {
  const g = modelTarget(scene, t);
  if (!g) return err("click where the model goes first");
  if (g.problem) return err(g.problem);
  const built = modelBuild(g.kind, g.nums, g.place);
  return built.ok ? ok({ title: modelTitle(g.kind), build: built.value, next: 0 }) : built;
}
/** The command that makes the next part of a model being built (from the scene as it is now), or why not */
export function nextPartCommand(scene: Scene, b: Building): Result<Command> {
  const part = b.build.parts[b.next];
  return part ? asCommand(scene, b.build.steps.slice(part.from, part.to)) : err("every part is made");
}
/** What the notice says while a part is being made: the model, the part and its place in the list */
export const buildingText = (b: Building): string => `${b.title}: ${b.build.parts[Math.max(0, b.next - 1)]?.label ?? ""} (${Math.min(b.next, b.build.parts.length)} of ${b.build.parts.length})`;

/** The title of the box and the fields it shows: each number as typed, else the number it has now */
export function modelEntry(scene: Scene, t: Tool): { panel: string; fields: { label: string; value: string; active: boolean; typed: boolean; hint: string; short?: string }[]; unit: string; note: string } | null {
  const m = t.model;
  if (!m) return null;
  const g = modelTarget(scene, t), fields = modelFields(m.kind), round = (v: number): string => String(Math.round(v * 100) / 100);
  const live = g ? [g.size, (g.turn * 180) / Math.PI, ...fields.map((f) => g.nums[f.key]!)] : [];
  const hints = ["the way across the longest side (mm); the pointer sets it until you click; what is not typed grows to fit", "degrees about the surface's normal", ...fields.map((f) => f.hint)];
  const labels = modelLabels(m.kind);
  return {
    panel: modelTitle(m.kind),
    fields: labels.map((label, i) => ({ label, value: m.typed[i] !== "" ? m.typed[i]! : live[i] !== undefined ? round(live[i]!) : "", active: m.field === i, typed: m.typed[i] !== "", hint: hints[i]! })),
    unit: "mm",
    note: g ? (g.problem ?? modelAbout(m.kind, g.nums)) : "click where the middle of it goes",
  };
}
