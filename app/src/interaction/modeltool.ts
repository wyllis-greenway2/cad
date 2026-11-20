// The tool that places a gear assembly model (`dec_gear_models`): armed, the first click is the middle of the model on a surface, and a simple picture of it follows (its outlines in the plane, as a gear's does) while its numbers are set in the box:
// the overall size first (or the distance of the pointer from the middle, until a click sets it), and then its own numbers. A number typed is kept; the ones not typed come from the usual numbers grown or shrunk to the size. Pure.
import type { Tool, Preview } from "./tools.ts";
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane, localOf } from "../operation/part.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { modelFields, modelSizeKey, modelSizeLabel, modelFixedSize, modelNumbers, modelStart, modelCentre, modelExtent, modelProblem, modelOutline, modelOutline3, modelBuild, modelTitle, modelAbout } from "../operation/modelkinds.ts";
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

/** What the tool holds: which model, the text typed in each field of the box (the overall size, then the model's numbers) and the field being typed in */
export interface ModelState { kind: ModelKind; typed: string[]; field: number; /** the box takes the keyboard when it opens */ focus?: true; /** the number that was taken back to a value that makes the model (`in_1240`): its field, and when (the box flashes red for a moment) */ bad?: { field: number; at: number }; /** the model is made and its box stays open (`in_1257`): the history's cursor before its first part, what the box held when it was made (to tell an Update from a Done), and the cursor after its last part (set when it is all made) */ made?: { from: number; held: string; to?: number } }
const modelLabels = (kind: ModelKind): string[] => [modelSizeLabel(kind), ...modelFields(kind).map((f) => f.label)]; // (the Size, then the model's own numbers: no turn, `in_1245`)
export const armedModel = (kind: ModelKind): ModelState => ({ kind, typed: modelLabels(kind).map(() => ""), field: 0 });
export const modelTyped = (m: ModelState, field: number, text: string): ModelState => { const { bad: _gone, ...rest } = m; void _gone; return { ...rest, field, typed: m.typed.map((x, i) => (i === field ? text : x)) }; };

/** What a model's box holds: the numbers typed, and where it stands and how big (the pointer's reach, until a click) */
export const modelHeld = (t: Tool): string => JSON.stringify([t.model?.typed, t.points, t.cursor, t.fill ? [t.fill.center, t.fill.normal] : null]);
/** a model that is made and has numbers changed since (the box's Update) */
export const modelChanged = (t: Tool): boolean => !!t.model?.made && t.model.made.held !== modelHeld(t);

const numOf = (s: string | undefined): number | undefined => { if (s === undefined || s === "" || s === "-" || s === "0.") return undefined; const n = Number(s); return Number.isFinite(n) ? n : undefined; };
/** the least size the pointer sets, as a share of the usual size of the model (a model much smaller than that is a point on the screen, and its teeth and rooms do not fit) */
const MIN_SHARE = 0.25;

export interface ModelTarget { kind: ModelKind; nums: Nums; size: number; turn: number; place: Place; problem: string | null; middle: Vec3 }
/** a number that comes from the body: shown, not set (the bore of a body that has none is free: `unless`) */
const lockedNum = (f: { fixed?: true; unless?: { key: string; is: number } }, nums?: Nums): boolean => !!f.fixed && !(f.unless && nums && nums[f.unless.key] === f.unless.is);
/** The model the tool would make: its numbers, where it stands and why not, if it cannot be made. Null before the first click. */
export function modelTarget(scene: Scene, t: Tool): ModelTarget | null {
  const m = t.model, pl0 = t.plane ? (scene.parts[t.plane] as Plane | undefined) : undefined;
  const pl = t.fill && m ? fillPlane(t.fill) : pl0;
  if (!m || !pl || pl.kind !== "plane" || !t.points.length) return null;
  const middle = t.points[0]!, fields = modelFields(m.kind);
  const typed: Nums = {};
  fields.forEach((f, i) => { const v = numOf(m.typed[i + 1]); if (v !== undefined) typed[f.key] = v; });
  const [mx, my] = localOf(pl, middle), cursor = t.cursor ? localOf(pl, t.cursor) : null;
  const reach = cursor ? 2 * Math.hypot(cursor[0] - mx, cursor[1] - my) : 0; // (the pointer's distance from the middle, both ways)
  const cutFrom = t.fill?.cut; // (Cut spokes: the outside, the bore and the thickness are the body's, and are not moved)
  if (cutFrom) Object.assign(typed, cutFrom.bore > 0 ? { bore: 2 * cutFrom.bore, boreOwned: 1 } : { boreOwned: 0, bore: typed.bore ?? 0 }, { rimT: cutFrom.thickness, hubT: cutFrom.thickness, draft: 0, rimMax: cutFrom.root > 0 ? Math.max(0, 2 * (cutFrom.root - 1.2)) : 0 });
  const size = cutFrom ? 2 * cutFrom.outer : numOf(m.typed[0]) ?? (reach > 1e-6 ? Math.max(MIN_SHARE * modelExtent(m.kind, modelStart(m.kind)), reach) : undefined);
  const sk = modelSizeKey(m.kind); // (a model whose Size is one of its numbers, the wheel's outside diameter: the Size is that number)
  if (sk && size !== undefined) typed[sk] = size;
  const nums = modelNumbers(m.kind, typed, sk && size !== undefined ? undefined : size);
  const turn = 0;
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
  if (!g || (t.model?.made && !modelChanged(t))) return null; // (a model that is made and not changed has no picture over it)
  const P = (x: number, y: number): Vec3 => [g.place.at[0] + g.place.ex[0] * x + g.place.ey[0] * y, g.place.at[1] + g.place.ex[1] * x + g.place.ey[1] * y, g.place.at[2] + g.place.ex[2] * x + g.place.ey[2] * y];
  const P3 = (x: number, y: number, z: number): Vec3 => { const q = P(x, y); return [q[0] + g.place.ez[0] * z, q[1] + g.place.ez[1] * z, q[2] + g.place.ez[2] * z]; };
  const segments: [Vec3, Vec3][] = [];
  const solid = modelOutline3(g.kind, g.nums); // (a model with a picture in space shows that: the faces and the depth, `in_1251`)
  if (solid.length) for (const line of solid) for (let i = 0; i + 1 < line.length; i++) segments.push([P3(line[i]![0], line[i]![1], line[i]![2]), P3(line[i + 1]![0], line[i + 1]![1], line[i + 1]![2])]);
  else for (const line of modelOutline(g.kind, g.nums)) for (let i = 0; i + 1 < line.length; i++) segments.push([P(line[i]![0], line[i]![1]), P(line[i + 1]![0], line[i + 1]![1])]);
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
  const n = { ...modelNumbers(m.kind, Object.fromEntries(fields.flatMap((f, k) => (numOf(m.typed[k + 1]) !== undefined ? [[f.key, numOf(m.typed[k + 1])!]] : [])))), ...nums };
  return [true, ...fields.map((f) => !f.hidden && (!f.when || (n[f.when.key] === f.when.is) !== !!f.when.not))];
}
/** The field the Tab key goes to: the next one that is shown */
export function nextField(m: ModelState, nums?: Nums): number {
  const vis = visibleFields(m, nums);
  const fields = modelFields(m.kind);
  for (let k = 1; k <= vis.length; k++) { const i = (m.field + k) % vis.length; if (vis[i] && !(i === 0 ? modelFixedSize(m.kind) : lockedNum(fields[i - 1]!, nums))) return i; } // (a number that comes from the body is not stopped at)
  return m.field;
}

/** The title of the box and the fields it shows: each number as typed, else the number it has now */
export function modelEntry(scene: Scene, t: Tool): { panel: string; fields: { bad?: true; /** the number comes from the body the model is cut into: shown, not set */ locked?: true; label: string; value: string; active: boolean; typed: boolean; hint: string; short?: string; choices?: string[]; index: number; /** a radius's little fillet-or-chamfer toggle: the field that holds the kind, the kind it has, and the names */ toggle?: { index: number; value: number; choices: string[] } }[]; unit: string; note: string } | null {
  const m = t.model;
  if (!m) return null;
  const g = modelTarget(scene, t), fields = modelFields(m.kind), round = (v: number): string => String(Math.round(v * 100) / 100);
  const live = g ? [g.size, ...fields.map((f) => g.nums[f.key]!)] : [];
  const hints = [modelSizeKey(m.kind) ? "the way across (mm): the outside diameter; the pointer sets it until you click; what is not typed follows it, and follows the numbers that are typed" : "the way across the longest side (mm); the pointer sets it until you click; what is not typed grows to fit", ...fields.map((f) => f.hint)];
  const labels = modelLabels(m.kind);
  const guard = modelGuard(scene, t), vis = visibleFields(m, g?.nums);
  const shown = (i: number): boolean => vis[i]!;
  const order = labels.map((_, i) => i).filter(shown).sort((a, b) => Number(!(a >= 1 && fields[a - 1]!.top)) - Number(!(b >= 1 && fields[b - 1]!.top)) || a - b);
  /** the little toggle beside a radius: the field that holds its kind (a hidden one), the kind it has now, and the names of the two */
  const toggleOf = (i: number): { toggle: { index: number; value: number; choices: string[] } } | Record<string, never> => {
    const j = fields.findIndex((f) => f.key === fields[i - 1]!.toggle) + 1;
    return j > 0 ? { toggle: { index: j, value: numOf(m.typed[j]) ?? g?.nums[fields[j - 1]!.key] ?? 0, choices: fields[j - 1]!.choices ?? ["Fillet", "Chamfer"] } } : {};
  };
  const hintSize = m.kind === "ballbearing" && g?.nums.own === 0 ? "the outside diameter (mm): picks the listed bearing nearest to it (a number typed wins); the pointer sets it until you click" : hints[0]!;
  return {
    panel: modelTitle(m.kind),
    fields: order.map((i) => ({ ...(m.bad?.field === i || guard?.field === i ? { bad: true as const } : {}), ...((i === 0 ? modelFixedSize(m.kind) : lockedNum(fields[i - 1]!, g?.nums)) ? { locked: true as const } : {}), index: i, label: labels[i]!, value: m.typed[i] !== "" ? m.typed[i]! : live[i] !== undefined ? round(live[i]!) : "", active: m.field === i, typed: m.typed[i] !== "", hint: i === 0 ? hintSize : hints[i]!, ...(i >= 1 && fields[i - 1]!.choices ? { choices: fields[i - 1]!.choices } : {}), ...(i >= 1 && fields[i - 1]!.toggle ? toggleOf(i) : {}) })),
    unit: "mm",
    note: g ? (g.problem ?? modelAbout(m.kind, g.nums)) : m.kind === "wheelcut" ? "click the round body to cut spokes into" : "click where the middle of it goes",
  };
}

const typedNum = (s: string | undefined): number | undefined => numOf(s);
const withTyped = (t: Tool, i: number, text: string): Tool => ({ ...t, model: { ...t.model!, typed: t.model!.typed.map((x, k) => (k === i ? text : x)) } });
/**
 * A model that cannot be made while its numbers are typed (`in_1240`, as a gear's, `gearFix`): the number that spoils it is taken back to the nearest value that works (found by halving between the value the model has without it and the one
 * typed); the field and the reason come back so the box can mark it red and say. Null when nothing is wrong or no one number is to blame.
 */
export function modelFix(scene: Scene, t0: Tool): { tool: Tool; field: number; message: string } | null {
  const first = modelTarget(scene, t0);
  if (!t0.model || !first || !first.problem) return null;
  const fields = modelFields(t0.model.kind), labels = modelLabels(t0.model.kind), valid = (x: Tool): boolean => { const r = modelTarget(scene, x); return !!r && !r.problem; };
  const text = (v: number): string => String(Number(v.toFixed(3)));
  /** the one typed number that, taken back alone, makes the model: its field, the tool and what it was taken back to */
  const alone = (t: Tool): { tool: Tool; field: number; to: string } | null => {
    const m = t.model!;
    const order = labels.map((_, i) => i).filter((i) => (m.typed[i] ?? "") !== "" && !(i >= 1 && (fields[i - 1]!.choices || lockedNum(fields[i - 1]!, t.fill?.cut ? { boreOwned: t.fill.cut.bore > 0 ? 1 : 0 } : undefined))) && !(i === 0 && modelFixedSize(t.model!.kind))).sort((a, b) => (a === m.field ? -2 : a === 0 ? 1 : 0) - (b === m.field ? -2 : b === 0 ? 1 : 0)); // (the one being typed first, the Size last: it is what the rest is made to fit)
    for (const i of order) {
      const typedV = typedNum(m.typed[i]);
      if (typedV === undefined) continue;
      const home = modelTarget(scene, withTyped(t, i, ""));
      if (!home || home.problem) continue; // (this number is not alone to blame)
      const key = i >= 1 ? fields[i - 1]!.key : "", whole = !!(i >= 1 && fields[i - 1]!.whole);
      let [good, bad] = [i === 0 ? home.size : home.nums[key]!, typedV];
      if (whole) { good = Math.round(good); bad = Math.round(bad); while (Math.abs(bad - good) > 1) { const mid = Math.round((good + bad) / 2); if (valid(withTyped(t, i, String(mid)))) good = mid; else bad = mid; } }
      else for (let k = 0; k < 30; k++) { const mid = (good + bad) / 2; if (valid(withTyped(t, i, text(mid)))) good = mid; else bad = mid; }
      const to = whole ? String(good) : text(good), fixed = withTyped(t, i, to);
      if (valid(fixed)) return { tool: { ...fixed, model: { ...fixed.model!, field: i } }, field: i, to };
    }
    return null;
  };
  // no one number to blame (two typed numbers spoil it together): the numbers typed are given up one at a time, the one being typed last, until one is alone to blame
  let cur = t0;
  const given: string[] = [];
  for (let round = 0; round <= labels.length; round++) {
    const one = alone(cur);
    if (one) {
      const was = t0.model!.typed[one.field];
      return { tool: one.tool, field: one.field, message: `${first.problem}: ${labels[one.field]} ${was} is taken back to ${one.to}${given.length ? `, and ${given.join(", ")} given up` : ""}` };
    }
    const m = cur.model!, i = labels.map((_, k) => k).filter((k) => (m.typed[k] ?? "") !== "" && !(k >= 1 && fields[k - 1]!.choices)).find((k) => k !== m.field) ?? m.field;
    if ((m.typed[i] ?? "") === "") return null;
    given.push(labels[i]!);
    cur = withTyped(cur, i, "");
    if (valid(cur)) return { tool: { ...cur, model: { ...cur.model!, field: i } }, field: i, message: `${first.problem}: ${given.join(" and ")} could not be met and ${given.length > 1 ? "are" : "is"} given up` };
  }
  return null;
}
const guardMemo = new WeakMap<Scene, Map<string, ReturnType<typeof modelFix>>>();
/** The number a model's box marks red while the model cannot be made (what Enter would do about it): worked out once for each set of numbers. Null while the model can be made. */
export function modelGuard(scene: Scene, t: Tool): { field: number; why: string; tool: Tool } | null {
  if (t.kind !== "model" || !t.model) return null;
  const key = JSON.stringify([t.model.typed, t.cursor, t.points, t.fill, t.plane]);
  const memo = guardMemo.get(scene) ?? new Map<string, ReturnType<typeof modelFix>>();
  guardMemo.set(scene, memo);
  if (!memo.has(key)) memo.set(key, modelFix(scene, t));
  const fx = memo.get(key);
  return fx ? { field: fx.field, why: modelTarget(scene, t)?.problem ?? fx.message, tool: fx.tool } : null;
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
