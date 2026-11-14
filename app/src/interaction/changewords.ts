// What a change is called when a message has to say which one it was (`in_335`): "that push / pull", "that move of a body", "that mate". Pure: the scene before the change and the command.
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Ref } from "../shared/ref.ts";
import { bodyLabel } from "./panels.ts";

const STEP: Record<string, string> = { extrude: "that extrusion", pushPull: "that push / pull of a face", combine: "that combining of bodies", delete: "that delete", move: "that move of a body", rotate: "that turn of a body", scale: "that scaling", edgeMod: "that fillet or chamfer", pattern: "that repeat" };

/** " of Body 2" for a face or body that a step works on, else nothing. */
const ofBody = (scene: Scene, parts: readonly Ref[]): string => {
  const p = parts[0] ? scene.parts[parts[0]] : undefined;
  const body = p?.kind === "body" ? p.ref : p?.kind === "plane" && p.origin === "body" ? p.of : undefined;
  return body && scene.parts[body]?.kind === "body" ? ` of ${bodyLabel(scene, body)}` : "";
};

export function changeWords(scene: Scene, c: Command): string {
  switch (c.type) {
    case "batch": {
      const real = c.commands.filter((x) => x.type !== "removeRelation");
      if (real.some((x) => x.type === "addRelation" && x.relation.kind === "mate")) return "that mate";
      const first = real[0];
      return first ? changeWords(scene, first) : "that change";
    }
    case "addStep": return `${STEP[c.step.type] ?? "that step"}${ofBody(scene, c.step.parts)}`;
    case "setStepParams": { const st = scene.steps.find((x) => x.id === c.id); return st ? `${st.type === "extrude" ? "that change to an extrusion" : STEP[st.type] ?? "that change to a step"}${ofBody(scene, st.parts)}` : "that change"; }
    case "movePart": return "that move of a point of a drawing";
    case "setRadius": return "that change of a radius";
    case "setRelationValue": return "that change of a number";
    case "deletePart": case "deleteParts": return "that delete";
    case "addRelation": return c.relation.kind === "mate" ? "that mate" : "that constraint";
    default: return "that change";
  }
}
