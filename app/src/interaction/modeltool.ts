// The tool that places a gear assembly model (`dec_gear_models`): armed, the first click is the middle of the model on a surface, and a simple picture of it follows (its outlines in the plane, as a gear's does) while its numbers are set in the box:
// the overall size first (or the distance of the pointer from the middle, until a click sets it), the turn, and then its own numbers. A number typed is kept; the ones not typed come from the usual numbers grown or shrunk to the size. Pure.
import type { Tool, Preview } from "./tools.ts";
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane, localOf } from "../operation/part.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { modelFields, modelNumbers, modelStart, modelCentre, modelExtent, modelProblem, modelOutline, modelBuild, modelTitle, modelAbout } from "../operation/modelkinds.ts";
import type { ModelKind, Nums } from "../operation/modelkinds.ts";
import { asCommand } from "../operation/modelparts.ts";
import type { Place, ModelBuild } from "../operation/modelparts.ts";
import type { Command } from "../operation/commands.ts";
import { playPlan } from "../operation/modelplay.ts";
import type { PlayPlan, ModelPlay } from "../operation/modelplay.ts";

/** The plane a model that fills a round object stands in: through its centre, across its axis (a stand-in made from the circle, not a part of the scene) */
function fillPlane(f: { center: Vec3; normal: Vec3 }): Plane {
  const n = normalizeV(f.normal), a: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalizeV(crossV(a, n)), v = crossV(n, u);
  return { ref: "fill" as Plane["ref"], kind: "plane", origin: "drawn", plane: null, movable: false, at: f.center, u, v } as Plane;
}
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalizeV = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** What the tool holds: which model, the text typed in each field of the box (the overall size, the turn, then the model's numbers) and the field being typed in */
export interface ModelState { kind: ModelKind; typed: string[]; field: number; /** the box takes the keyboard when it opens */ focus?: true }
const LEAD = ["Size", "Turn"];
const modelLabels = (kind: ModelKind): string[] => [...LEAD, ...modelFields(kind).map((f) => f.label)];
export const armedModel = (kind: ModelKind): ModelState => ({ kind, typed: modelLabels(kind).map(() => ""), field: 0 });
export const modelTyped = (m: ModelState, field: number, text: string): ModelState => ({ ...m, field, typed: m.typed.map((x, i) => (i === field ? text : x)) });

const numOf = (s: string | undefined): number | undefined => { if (s === undefined || s === "" || s === "-" || s === "0.") return undefined; const n = Number(s); return Number.isFinite(n) ? n : undefined; };
/** the least size the pointer sets, as a share of the usual size of the model (a model much smaller than that is a point on the screen, and its teeth and rooms do not fit) */
const MIN_SHARE = 0.25;

export interface ModelTarget { kind: ModelKind; nums: Nums; size: number; turn: number; place: Place; problem: string | null; middle: Vec3 }
/** The model the tool would make: its numbers, where it stands and why not, if it cannot be made. Null before the first click. */
export function modelTarget(scene: Scene, t: Tool): ModelTarget | null {
  const m = t.model, pl0 = t.plane ? (scene.parts[t.plane] as Plane | undefined) : undefined;
  const pl = t.fill && m ? fillPlane(t.fill) : pl0;
  if (!m || !pl || pl.kind !== "plane" || !t.points.length) return null;
  const middle = t.points[0]!, fields = modelFields(m.kind);
  const typed: Nums = {};
  fields.forEach((f, i) => { const v = numOf(m.typed[i + 2]); if (v !== undefined) typed[f.key] = v; });
  const [mx, my] = localOf(pl, middle), cursor = t.cursor ? localOf(pl, t.cursor) : null;
  const reach = cursor ? 2 * Math.hypot(cursor[0] - mx, cursor[1] - my) : 0; // (the pointer's distance from the middle, both ways)
  const size = numOf(m.typed[0]) ?? (reach > 1e-6 ? Math.max(MIN_SHARE * modelExtent(m.kind, modelStart(m.kind)), reach) : undefined);
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
export interface Building { title: string; build: ModelBuild; next: number; /** how the model moves when played, and the body each part made (found as the parts are made) */ play: PlayPlan; ids: Record<string, { step?: string; gear?: string }> }
/** The model the tool would make, with its parts, or why not */
export function modelBuilding(scene: Scene, t: Tool): Result<Building> {
  const g = modelTarget(scene, t);
  if (!g) return err("click where the model goes first");
  if (g.problem) return err(g.problem);
  const built = modelBuild(g.kind, g.nums, g.place);
  return built.ok ? ok({ title: modelTitle(g.kind), build: built.value, next: 0, play: playPlan(g.kind, g.nums, g.place), ids: {} }) : built;
}
/** The command that makes the next part of a model being built (from the scene as it is now), or why not */
export function nextPartCommand(scene: Scene, b: Building): Result<Command> {
  const part = b.build.parts[b.next];
  return part ? asCommand(scene, b.build.steps.slice(part.from, part.to)) : err("every part is made");
}
/** What the notice says while a part is being made: the model, the part and its place in the list */
export const buildingText = (b: Building): string => `${b.title}: ${b.build.parts[Math.max(0, b.next - 1)]?.label ?? ""} (${Math.min(b.next, b.build.parts.length)} of ${b.build.parts.length})`;

/** Which of the box's fields (the size and the turn, then the model's) are shown: a field with a condition is shown while the number it names has that value, the model's numbers being the live ones or, before the first click, those typed */
function visibleFields(m: ModelState, nums?: Nums): boolean[] {
  const fields = modelFields(m.kind);
  const n = nums ?? modelNumbers(m.kind, Object.fromEntries(fields.flatMap((f, k) => (numOf(m.typed[k + 2]) !== undefined ? [[f.key, numOf(m.typed[k + 2])!]] : []))));
  return [true, true, ...fields.map((f) => !f.when || n[f.when.key] === f.when.is)];
}
/** The field the Tab key goes to: the next one that is shown */
export function nextField(m: ModelState): number {
  const vis = visibleFields(m);
  for (let k = 1; k <= vis.length; k++) { const i = (m.field + k) % vis.length; if (vis[i]) return i; }
  return m.field;
}

/** The title of the box and the fields it shows: each number as typed, else the number it has now */
export function modelEntry(scene: Scene, t: Tool): { panel: string; fields: { label: string; value: string; active: boolean; typed: boolean; hint: string; short?: string; choices?: string[]; index: number }[]; unit: string; note: string } | null {
  const m = t.model;
  if (!m) return null;
  const g = modelTarget(scene, t), fields = modelFields(m.kind), round = (v: number): string => String(Math.round(v * 100) / 100);
  const live = g ? [g.size, (g.turn * 180) / Math.PI, ...fields.map((f) => g.nums[f.key]!)] : [];
  const hints = ["the way across the longest side (mm); the pointer sets it until you click; what is not typed grows to fit", "degrees about the surface's normal", ...fields.map((f) => f.hint)];
  const labels = modelLabels(m.kind);
  const vis = visibleFields(m, g?.nums);
  const shown = (i: number): boolean => vis[i]!;
  const order = labels.map((_, i) => i).filter(shown).sort((a, b) => Number(!(a >= 2 && fields[a - 2]!.top)) - Number(!(b >= 2 && fields[b - 2]!.top)) || a - b);
  const hintSize = m.kind === "ballbearing" && g?.nums.own === 0 ? "the outside diameter (mm): picks the listed bearing nearest to it (a number typed wins); the pointer sets it until you click" : hints[0]!;
  return {
    panel: modelTitle(m.kind),
    fields: order.map((i) => ({ index: i, label: labels[i]!, value: m.typed[i] !== "" ? m.typed[i]! : live[i] !== undefined ? round(live[i]!) : "", active: m.field === i, typed: m.typed[i] !== "", hint: i === 0 ? hintSize : hints[i]!, ...(i >= 2 && fields[i - 2]!.choices ? { choices: fields[i - 2]!.choices } : {}) })),
    unit: "mm",
    note: g ? (g.problem ?? modelAbout(m.kind, g.nums)) : "click where the middle of it goes",
  };
}

/** The step (or gear) that made the body of the part a command makes: the first extrude or turn that starts a body, or the gear */
export function partIds(c: Command): { step?: string; gear?: string } {
  if (c.type === "gear") return { gear: c.id };
  if (c.type === "addStep" && (c.step.type === "extrude" || c.step.type === "revolve") && (c.step.params.mode === undefined || c.step.params.mode === "new")) return { step: c.step.id };
  if (c.type === "batch") for (const x of c.commands) { const r = partIds(x); if (r.step || r.gear) return r; }
  return {};
}
/** The commands that finish a model that is made: the record that lets it be played (how it moves and which body is which part) and the glue between the parts that are fixed to one another */
export function finishCommand(scene: Scene, b: Building): Command | null {
  const first = b.ids[b.build.parts[0]?.label ?? ""];
  const key = first?.step ?? first?.gear;
  if (!key) return null;
  const record: ModelPlay = { id: `m_${key}`, title: b.title, driver: b.play.driver, followers: b.play.followers, note: b.play.note, parts: b.ids };
  const bodyId = (part: string): string | null => { const p = b.ids[part]; if (!p) return null; if (p.step) return `x_${p.step}`; const st = scene.steps.find((x) => x.params.gear === p.gear && (x.params.mode === undefined || x.params.mode === "new")); return st ? `x_${st.id}` : null; }; // (a gear's body is named by the step that began it)
  const glue = b.play.glue.map((g) => g.map(bodyId).filter((x): x is string => !!x)).filter((g) => g.length >= 2).map((bodies): Command => ({ type: "glue", bodies }));
  const held = (b.play.hold ?? []).map(bodyId).filter((x): x is string => !!x).map((body): Command => ({ type: "setFixed", body, on: true }));
  const pivots = (b.play.pivots ?? []).flatMap((pv): Command[] => { const body = bodyId(pv.part); return body ? [{ type: "pivot", body, point: pv.point, dir: pv.dir }] : []; });
  return { type: "batch", commands: [{ type: "modelPlay", record }, ...glue, ...held, ...pivots] };
}
