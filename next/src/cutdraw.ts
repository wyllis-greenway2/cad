// A cut: everything on one side of a plane is not drawn, and the cut face of what is cut is painted solid with hatching, as a cut part is in an engineering drawing. It works for any mesh
// (the old app's way): clipping planes take the far side away from every material, and a stencil count (the back faces of the clipped bodies add one, the front faces take one away) says where
// a line of sight is inside a body at the plane, over which a quad lying in the plane is then drawn.
import * as THREE from "three";
import { settings } from "./settings.ts";
import type { V3 } from "./vec.ts";

export interface CutDrawing { origin: V3; /** the side this points to is cut away */ n: V3 }

export function createCutDraw(scene: THREE.Scene, bodies: THREE.Group, renderer: THREE.WebGLRenderer) {
  renderer.localClippingEnabled = true;
  const passes = new THREE.Group(); scene.add(passes);
  const clips: THREE.Plane[] = [];
  const stencil = (side: THREE.Side, op: THREE.StencilOp) => new THREE.MeshBasicMaterial({
    side, colorWrite: false, depthWrite: false, depthTest: false, clippingPlanes: clips, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op,
  });
  const back = stencil(THREE.BackSide, THREE.IncrementWrapStencilOp), front = stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp);
  const C = settings.cut, rgb = (c: readonly number[]) => new THREE.Color().setRGB(c[0]!, c[1]!, c[2]!, THREE.SRGBColorSpace);
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(C.capMm, C.capMm), new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Vector3() }, uFace: { value: rgb(C.face) }, uHatch: { value: rgb(C.hatch) }, uStep: { value: C.hatchMm }, uWidth: { value: C.hatchWidth } },
    side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform vec3 uA; uniform vec3 uFace; uniform vec3 uHatch; uniform float uStep; uniform float uWidth; varying vec3 vW;
      void main() { float a = dot(vW, uA) / uStep; float l = 1.0 - smoothstep(uWidth, uWidth + fwidth(a) * 1.5 + 0.02, abs(fract(a) - 0.5)); gl_FragColor = vec4(mix(uFace, uHatch, l), 1.0); }`,
  }));
  cap.renderOrder = 2; cap.visible = false; cap.onAfterRender = (r) => r.clearStencil(); // (the count is put back to nothing for the next cut)
  scene.add(cap);

  return {
    /** The bodies were made again: make their stencil passes again. */
    rebuild() {
      passes.clear();
      bodies.children.forEach((m) => { if (!(m instanceof THREE.Mesh)) return; for (const [mat, order] of [[back, 1], [front, 1]] as const) { const p = new THREE.Mesh(m.geometry, mat); p.position.copy(m.position); p.renderOrder = order; passes.add(p); } });
    },
    /** Each picture: the cut (null: none). */
    update(cut: CutDrawing | null) {
      const mats: THREE.Material[] = []; bodies.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) mats.push(...(Array.isArray(m) ? m : [m])); });
      clips.length = 0;
      if (cut) { const n = new THREE.Vector3(...cut.n), o = new THREE.Vector3(...cut.origin); clips.push(new THREE.Plane().setFromNormalAndCoplanarPoint(n.clone().negate(), o)); // (three keeps the positive side)
        cap.position.copy(o); cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const a = new THREE.Vector3(1, 0.7, 0.3).cross(n).normalize(); (cap.material as THREE.ShaderMaterial).uniforms.uA!.value.copy(new THREE.Vector3().crossVectors(n, a).add(a).normalize()); // (hatch lines slanting across the plane)
      }
      for (const m of mats) { (m as THREE.Material & { clippingPlanes: THREE.Plane[] | null }).clippingPlanes = cut ? clips : null; }
      cap.visible = !!cut; passes.visible = !!cut;
    },
  };
}
