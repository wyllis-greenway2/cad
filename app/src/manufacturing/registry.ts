// The registry of routes (`dec_manufacturing_contract` point 7, `inv_manufacturing_boundary`): the one cut point. A route is added with `register` and taken away with `unregister`, and nothing else in the app knows it by name;
// the app lists routes for a part and runs one through `runRoute`, which does the standard stages in the standard order and then the shared Emit stage. A route that fails is a finding, never a crash, and nothing a route says blocks (`in_546`).
// Pure and with no global state: the app makes one registry and holds it.
import { CONTRACT_VERSION } from "./contract/index.ts";
import type { Route, ParamSpec, ParamValue, Settings, RouteContext, PartSnapshot, Finding, FitReport, RouteOffer, RouteRun, DialectDefinition, Toolpath } from "./contract/index.ts";
import { writeGcode } from "./core/gcode.ts";

export type Outcome = { ok: true } | { ok: false; error: string };

/** Why a route's settings schema is not usable, or null: ids that repeat, a default that is outside its own limits or not among its choices. */
export function whyBadParams(params: readonly ParamSpec[]): string | null {
  const seen = new Set<string>();
  for (const p of params) {
    if (!p.id.trim()) return "a setting has no id";
    if (seen.has(p.id)) return `the setting "${p.id}" appears twice`;
    seen.add(p.id);
    if (p.kind === "number") {
      if (typeof p.default !== "number" || !Number.isFinite(p.default)) return `"${p.id}": the default of a number is a number`;
      if (p.min !== undefined && p.max !== undefined && p.min > p.max) return `"${p.id}": the smallest is above the largest`;
      if ((p.min !== undefined && p.default < p.min) || (p.max !== undefined && p.default > p.max)) return `"${p.id}": the default is outside its own limits`;
    } else if (p.kind === "boolean") {
      if (typeof p.default !== "boolean") return `"${p.id}": the default of a yes or no is true or false`;
    } else if (p.kind === "choice") {
      if (!p.choices?.length) return `"${p.id}": a choice needs choices`;
      if (!p.choices.some((c) => c.value === p.default)) return `"${p.id}": the default is not one of the choices`;
    } else if (typeof p.default !== "string") return `"${p.id}": the default of a text is a text`;
  }
  return null;
}

/** The settings a route starts with: each setting's default. */
export const defaultSettings = (route: Route): Settings => Object.fromEntries(route.params.map((p) => [p.id, p.default]));

/** What is wrong with these settings for this route, as findings (advice: a value outside its limits, of the wrong kind, or a setting the route does not have). Missing ones are not wrong: the default is used. */
export function checkSettings(route: Route, settings: Settings): Finding[] {
  const out: Finding[] = [];
  const known = new Map(route.params.map((p) => [p.id, p]));
  const add = (id: string, message: string): void => { out.push({ id: `${route.id}:settings:${id}`, severity: "caution", message, refs: [] }); };
  for (const [id, v] of Object.entries(settings)) {
    const p = known.get(id);
    if (!p) { add(id, `${route.name} has no setting "${id}"`); continue; }
    const bad = (value: ParamValue): string | null =>
      p.kind === "number" ? (typeof value !== "number" || !Number.isFinite(value) ? "needs a number" : p.min !== undefined && value < p.min ? `is below ${p.min}${p.unit ? ` ${p.unit}` : ""}` : p.max !== undefined && value > p.max ? `is above ${p.max}${p.unit ? ` ${p.unit}` : ""}` : null)
      : p.kind === "boolean" ? (typeof value === "boolean" ? null : "needs yes or no")
      : p.kind === "choice" ? (p.choices!.some((c) => c.value === value) ? null : "is not one of the choices")
      : typeof value === "string" ? null : "needs text";
    const why = bad(v);
    if (why) add(id, `${p.label} ${why}`);
  }
  return out;
}

export interface Registry {
  /** Add a route. Refused (with the reason) for another contract version, an id already there, or a settings schema that cannot be used. */
  register(route: Route): Outcome;
  /** Take a route away: nothing else of the app knows it. False when there was none. */
  unregister(id: string): boolean;
  get(id: string): Route | undefined;
  /** In the order they were registered. */
  list(): Route[];
  /** The routes that take this kind of part, each with whether and why it fits (advice: a route that does not fit is still listed, with its reasons). */
  forPart(part: PartSnapshot, ctx?: RouteContext): RouteOffer[];
}

export function createRegistry(): Registry {
  const routes = new Map<string, Route>();
  return {
    register(route) {
      if (route.contract !== CONTRACT_VERSION) return { ok: false, error: `${route.id || "this route"} was written for contract version ${route.contract}, this app has version ${CONTRACT_VERSION}` };
      if (!route.id.trim() || !route.name.trim() || !route.process.trim()) return { ok: false, error: "a route needs an id, a name and a process" };
      if (routes.has(route.id)) return { ok: false, error: `a route with the id "${route.id}" is already registered` };
      if (!route.accepts.length) return { ok: false, error: `${route.id} accepts no kind of part` };
      const bad = whyBadParams(route.params);
      if (bad) return { ok: false, error: `${route.id}: ${bad}` };
      routes.set(route.id, route);
      return { ok: true };
    },
    unregister: (id) => routes.delete(id),
    get: (id) => routes.get(id),
    list: () => [...routes.values()],
    forPart(part, ctx) {
      return [...routes.values()].filter((r) => r.accepts.includes(part.kind)).map((r) => ({ route: r.id, name: r.name, process: r.process, fit: stage(r, "fit", () => (r.fit ? r.fit(part, ctx) : { fits: true, reasons: [] }), noFit) }));
    },
  };
}

/** One stage of a route, run so that a failure is a finding (when `findings` is given) and the run goes on with the fallback. */
function stage<T>(route: Route, name: string, run: () => T, fallback: (message: string) => T, findings?: Finding[]): T {
  try { return run(); } catch (e) {
    const message = `${route.name} failed in its ${name} stage: ${e instanceof Error ? e.message : String(e)}`;
    findings?.push({ id: `${route.id}:error:${name}`, severity: "warning", message, refs: [] });
    return fallback(message);
  }
}
const noFit = (message: string): FitReport => ({ fits: false, reasons: [message] });

/**
 * Run a route on a part in the standard order (`dec_manufacturing_contract` point 4): Fit, then Check, then Plan, then the shared Emit stage if a dialect is given. Nothing stops early: a part that does not fit, a machine made
 * for another process or settings outside their limits are findings, and the route still runs. The file name is the part's name.
 */
export function runRoute(route: Route, part: PartSnapshot, ctx: RouteContext, dialect?: DialectDefinition): RouteRun {
  const findings: Finding[] = [...checkSettings(route, ctx.settings)];
  if (ctx.machine.process !== route.process) findings.push({ id: `${route.id}:machine`, severity: "caution", message: `${route.name} is for ${route.process}, and ${ctx.machine.name} is a ${ctx.machine.process} machine`, refs: [] });
  if (!route.accepts.includes(part.kind)) findings.push({ id: `${route.id}:kind`, severity: "caution", message: `${route.name} takes ${route.accepts.join(" or ")} parts, and ${part.name} is a ${part.kind} one`, refs: [] });
  const fit = stage(route, "fit", () => (route.fit ? route.fit(part, ctx) : { fits: true, reasons: [] }), noFit, findings);
  if (!fit.fits) findings.push({ id: `${route.id}:fit`, severity: "caution", message: `${route.name} may not suit ${part.name}: ${fit.reasons.join("; ") || "no reason given"}`, refs: [] });
  if (route.check) findings.push(...stage(route, "check", () => route.check!(part, ctx), () => [], findings));
  let toolpath: Toolpath | undefined;
  if (route.plan) toolpath = stage<Toolpath | undefined>(route, "plan", () => route.plan!(part, ctx), () => undefined, findings);
  const emitted = toolpath && dialect ? writeGcode(toolpath, dialect, part.name.replace(/[^\w.-]+/g, "_") || "part") : { files: [], warnings: [] };
  return { route: route.id, fit, findings, ...(toolpath ? { toolpath } : {}), files: emitted.files, warnings: emitted.warnings };
}
