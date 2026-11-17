// What a body is made of (`in_565`, `dec_manufacturing_definitions`, `dec_manufacturing_prep`): a tag on the body, a material's name, kept in the scene and saved with the project. The material libraries do not exist yet, so the tag is plain text
// (PLA, birch plywood 3 mm); once they do the dialog offers their materials and checks the name. Manufacturing routes read it through the contract's part snapshot. Pure: the dialog is a description, the answer a command.
import type { Ref } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Command } from "../operation/commands.ts";
import { MATERIAL_MAX } from "../operation/commands.ts";
import type { Scene } from "../operation/scene.ts";
import { scene as sceneOf, selection as selectionOf } from "./session.ts";
import type { Session } from "./session.ts";
import type { Dialog } from "./transfer.ts";

/** The bodies in the selection (a body's face or edge selected stands for its body is not taken: the body itself), with the name each keeps through the history. */
export function selectedBodies(session: Session): { ref: Ref; id: string }[] {
  const sc = sceneOf(session);
  return selectionOf(session).flatMap((r) => { const p = sc.parts[r]; return p?.kind === "body" && p.id ? [{ ref: r, id: p.id }] : []; });
}
/** The material tagged on a body (by the name it keeps), or none. */
export const materialOf = (scene: Scene, id: string): string | undefined => scene.materials?.[id];

/** Why there is nothing to tag: a body has to be selected. */
export const whyNoMaterial = (session: Session): string | null => (selectedBodies(session).length ? null : "select a body first");

/** What the dialog starts with: the material the selected bodies share, or nothing when they differ or have none. */
export function materialStart(session: Session): { material: string } {
  const sc = sceneOf(session);
  const all = new Set(selectedBodies(session).map((b) => materialOf(sc, b.id) ?? ""));
  return { material: all.size === 1 ? [...all][0]! : "" };
}
export function materialDialog(session: Session, v: { material: string }): Dialog {
  const n = selectedBodies(session).length;
  const sc = sceneOf(session);
  const mixed = new Set(selectedBodies(session).map((b) => materialOf(sc, b.id) ?? "")).size > 1;
  return {
    title: n === 1 ? "Material of the body" : `Material of ${n} bodies`,
    ok: "Set",
    fields: [{ id: "material", label: "Material", type: "text", value: v.material, note: `${mixed ? "They have different materials now. " : ""}The name of what it is made of, for example PLA or birch plywood 3 mm; empty takes the tag off. Up to ${MATERIAL_MAX} letters.` }],
  };
}
/** The command that tags every selected body with the answer (empty takes the tag off); one step to undo. */
export function materialCommand(session: Session, material: string): Result<Command> {
  const bodies = selectedBodies(session);
  if (!bodies.length) return err("select a body first");
  const m = material.trim();
  if (m.length > MATERIAL_MAX) return err(`a material name is at most ${MATERIAL_MAX} letters`);
  return ok({ type: "batch", commands: bodies.map((b): Command => ({ type: "setMaterial", body: b.id, material: m })) });
}
