// The four looks a part of the view can have (`dec_view_looks`, `in_1379`), each made here and nowhere else:
//   solid        opaque and lit
//   see-through  the dark nearly clear look (what the wireframe was): the faces are there, the edges and what is inside show through
//   cut          a part clipped by a plane: the hatch on the cut (view.ts), and a face lying on the cut is solid
//   marked       a colour laid over the others: teal (selected, pointed at, preview: drawn by the highlight) and red (a clash, thin places, what a cut takes away)
// A look is set on a material from the material's own colour (`userData.base`), never copied from a material that is in another look just now.
import * as THREE from "three";

export type Look = "solid" | "seeThrough";
/** The see-through look's numbers (the wireframe the human likes, `in_383`, `in_1379`). */
export const SEE_THROUGH = { color: 0x14161a, opacity: 0.14 } as const;
/** How strong a marking is: a fill over the part, or a place that must be noticed. */
export const MARK = { fill: 0.32, thin: 0.6, strong: 0.72 } as const;
export const RED = 0xe5484d;

type Surface = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

/** Put the material in a look. It keeps its own colour to come back to. */
export function setLook(mat: Surface, look: Look): void {
  mat.userData.base ??= mat.color.getHex();
  const through = look === "seeThrough";
  mat.transparent = through;
  mat.opacity = through ? SEE_THROUGH.opacity : 1;
  mat.depthWrite = !through;
  mat.color.setHex(through ? SEE_THROUGH.color : (mat.userData.base as number));
  mat.visible = true;
  mat.needsUpdate = true;
}
/** A copy of the material that is solid, whatever look the original is in (the face lying on a cut). */
export function solidCopy(mat: Surface): Surface {
  const c = mat.clone() as Surface;
  c.userData = { ...mat.userData };
  setLook(c, "solid");
  return c;
}
/** The see-through material for a stand-in of a part (not a body of the model). */
export const seeThroughMaterial = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: SEE_THROUGH.color, transparent: true, opacity: SEE_THROUGH.opacity, side: THREE.DoubleSide, depthWrite: false });
/** The line that goes with a see-through part (its outline). */
export const seeThroughLine = (): THREE.LineBasicMaterial => new THREE.LineBasicMaterial({ color: SEE_THROUGH.color, transparent: true, opacity: 0.55 });
/** A red marking laid over parts. `lit`: shaded by the light, so a curve reads as one. */
export function markMaterial(opacity: number, lit: boolean, over = false): THREE.Material {
  const o = { color: RED, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: over, polygonOffsetFactor: over ? -2 : 0, polygonOffsetUnits: over ? -2 : 0 };
  return lit ? new THREE.MeshLambertMaterial(o) : new THREE.MeshBasicMaterial(o);
}
