// The personal library of machines (`in_571`, `dec_manufacturing_definitions` points 2 to 5): the user's own machines, kept between sessions (the page stores the text, `main.ts`) and offered in the laser dialog. Versioned: a changed machine gets a new
// version, so a project's copy of the one it used is never changed under it. Pure: text in, text out; checked before anything is kept.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { MachineDefinition } from "../manufacturing/index.ts";

export interface PersonalLibrary { machines: MachineDefinition[] }
export const emptyLibrary = (): PersonalLibrary => ({ machines: [] });
export const NAME_MAX = 60;

/** Why a machine cannot be kept, or null: it needs a name, a work area and a speed that are real numbers above zero. */
export function whyBadMachine(m: MachineDefinition): string | null {
  if (!m.name?.trim() || m.name.length > NAME_MAX) return `a machine needs a name of up to ${NAME_MAX} letters`;
  if (!m.id?.trim()) return "a machine needs an id";
  const [w, h] = [m.envelope?.max?.[0] - m.envelope?.min?.[0], m.envelope?.max?.[1] - m.envelope?.min?.[1]];
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return "the work area needs a width and a height above zero";
  if (!(m.limits?.feed > 0) || !Number.isFinite(m.limits.feed)) return "the rapid speed needs a number above zero";
  const s = m.route?.powerMax;
  if (typeof s !== "number" || !(s > 0)) return "the power scale needs a number above zero";
  if (!Number.isInteger(m.version) || m.version < 1) return "a version is a whole number from 1";
  return null;
}

/** A name as an id: lower case letters, digits and hyphens. */
export const slug = (name: string): string => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "machine";

/** The library with this machine in it: a machine with the same id is replaced (it should have the next version, `nextVersion`). */
export function saveMachine(lib: PersonalLibrary, m: MachineDefinition): Result<PersonalLibrary> {
  const why = whyBadMachine(m);
  return why ? err(why) : ok({ machines: [...lib.machines.filter((x) => x.id !== m.id), m] });
}
export const removeMachine = (lib: PersonalLibrary, id: string): PersonalLibrary => ({ machines: lib.machines.filter((x) => x.id !== id) });
/** The version a changed machine gets: one more than the library's (or project's) latest of the same id; 1 for a new one. */
export const nextVersion = (id: string, ...known: readonly (MachineDefinition | undefined)[]): number => Math.max(0, ...known.filter((k): k is MachineDefinition => !!k && k.id === id).map((k) => k.version)) + 1;

const FORMAT = "cad-library";
export const libraryText = (lib: PersonalLibrary): string => JSON.stringify({ format: FORMAT, version: 1, machines: lib.machines });
/** The library from stored text; a machine that is not valid is left out (and counted), the rest is kept. */
export function parseLibrary(text: string | null | undefined): { library: PersonalLibrary; dropped: number } {
  if (!text) return { library: emptyLibrary(), dropped: 0 };
  try {
    const j = JSON.parse(text) as { format?: string; machines?: unknown };
    if (j.format !== FORMAT || !Array.isArray(j.machines)) return { library: emptyLibrary(), dropped: 0 };
    const good = (j.machines as MachineDefinition[]).filter((m) => m && m.kind === "machine" && !whyBadMachine(m));
    return { library: { machines: good }, dropped: j.machines.length - good.length };
  } catch { return { library: emptyLibrary(), dropped: 0 }; }
}
