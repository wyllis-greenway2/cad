// A mirror copy (`in_433`): a drawn figure or a body copied as its reflection in a plane. The plane is one the person chooses by a chip: a face that was selected with the body, one of the six sides of the
// box that holds what is mirrored (the copy lands against that side), or a plane of the world through the origin. This file is what the interaction needs of it: the choices and the step they make.
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import type { Op } from "./operations.ts";

export interface MirrorChoice { id: string; label: string; title: string; p: Vec3; n: Vec3 }

const AXIS_NAMES: [string, string][] = [["Left", "Right"], ["Front", "Back"], ["Bottom", "Top"]];
const WORLD = ["YZ", "XZ", "XY"];

/**
 * The planes offered: the selected face first, then each side of the box of what is mirrored (not across a flat figure's own plane, where the copy would lie on the figure), then the world's planes.
 */
export function mirrorChoices(box: { lo: Vec3; hi: Vec3 }, face: { p: Vec3; n: Vec3 } | null, flat: boolean): MirrorChoice[] {
  const out: MirrorChoice[] = [];
  if (face) out.push({ id: "face", label: "Selected face", title: "Mirror across the face that was selected: the copy lands against it", p: face.p, n: face.n });
  for (let i = 0; i < 3; i++) {
    if (flat && box.hi[i]! - box.lo[i]! < 1e-6) continue;
    const n: Vec3 = [0, 0, 0].map((_, k) => (k === i ? 1 : 0)) as unknown as Vec3;
    for (const [j, side] of [[0, box.lo], [1, box.hi]] as const) {
      const p: Vec3 = [0, 0, 0].map((_, k) => (k === i ? side[i]! : (box.lo[k]! + box.hi[k]!) / 2)) as unknown as Vec3;
      out.push({ id: `${j ? "max" : "min"}:${i}`, label: AXIS_NAMES[i]![j]!, title: `Mirror across the plane at its ${AXIS_NAMES[i]![j]!.toLowerCase()} side: the copy lands against that side`, p, n });
    }
  }
  for (let i = 0; i < 3; i++) out.push({ id: `world:${i}`, label: `World ${WORLD[i]}`, title: `Mirror across the world's ${WORLD[i]} plane, through the origin`, p: [0, 0, 0], n: [0, 0, 0].map((_, k) => (k === i ? 1 : 0)) as unknown as Vec3 });
  return out;
}

/** The choice in force: the one picked, else the first. */
const mirrorChosen = (op: Op): MirrorChoice | null => op.mirrorChoices?.[Math.min(op.mirrorIx ?? 0, (op.mirrorChoices?.length ?? 1) - 1)] ?? null;

/** The step of the mirror: a body gets a step of its own with the plane's numbers; a drawn figure a record that keeps them, its copies made from it (as a repeat's are). */
export function mirrorCommand(scene: Scene, op: Op): Command | null {
  const c = mirrorChosen(op);
  if (!c) return null;
  const numbers = { px: c.p[0], py: c.p[1], pz: c.p[2], nx: c.n[0], ny: c.n[1], nz: c.n[2] };
  if (op.target !== "plane") {
    const mine = scene.parts[op.parts[0]!];
    const body: Record<string, string> = mine?.kind === "body" && mine.ref !== BODY_OBJECT && mine.id ? { body: mine.id } : {};
    return { type: "addStep", step: { id: nextId(scene, "s"), type: "pattern", parts: op.parts, params: { mode: "mirror", ...numbers, ...body } } };
  }
  const first = op.parts.map((r) => scene.parts[r]).find((p) => p?.kind === "corner");
  const plane = first?.plane ? scene.parts[first.plane] : undefined;
  if (!plane || plane.kind !== "plane") return null;
  return { type: "pattern", id: nextId(scene, "q"), kind: "mirror", parts: op.parts, plane: plane.ref, params: [c.p[0], c.p[1], c.p[2], c.n[0], c.n[1], c.n[2]] };
}
