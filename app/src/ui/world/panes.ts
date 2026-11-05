// The three world planes as the sheets they are (`in_064`, `in_116`): infinite and transparent. Each is a huge faint sheet through the origin that fades out with distance
// from where you are looking, so it reads as going on for ever. A plane under the pointer or picked is a little brighter, never blue.
import * as THREE from "three";
import type { Ref, Vec3 } from "../../interaction/api.ts";
import { settings } from "../../interaction/api.ts";
import { srgb } from "./parts.ts";

const PLANES: { ref: string; u: Vec3; v: Vec3 }[] = [{ ref: "w/XY", u: [1, 0, 0], v: [0, 1, 0] }, { ref: "w/XZ", u: [1, 0, 0], v: [0, 0, 1] }, { ref: "w/YZ", u: [0, 1, 0], v: [0, 0, 1] }];
const SIZE = 40000; // mm: far past anything you will look at

const material = (color: THREE.Color) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Vector3(color.r, color.g, color.b) }, uOpacity: { value: 0 }, uReach: { value: 200 } },
  vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
  fragmentShader: "uniform vec3 uColor; uniform float uOpacity; uniform float uReach; varying vec3 vW; void main() { float f = 1.0 - smoothstep(0.25 * uReach, uReach, length(vW)); gl_FragColor = vec4(uColor, uOpacity * f); }",
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});

export function createPanes() {
  const P = settings.panes;
  const group = new THREE.Group();
  const mats = new Map<string, THREE.ShaderMaterial>();
  const sheet = srgb(settings.theme.sheet);
  for (const pl of PLANES) {
    const mat = material(sheet);
    const u = new THREE.Vector3(...pl.u);
    const v = new THREE.Vector3(...pl.v);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(u, v, u.clone().cross(v));
    mesh.renderOrder = -1;
    group.add(mesh);
    mats.set(pl.ref, mat);
  }
  return {
    group,
    /** `e`: how much of the big world is shown (0 to 1); `distance`: how far the camera is, which sets how far the sheets reach. */
    apply(visible: boolean, lit: readonly Ref[], e: number, distance: number) {
      group.visible = visible;
      for (const [ref, m] of mats) {
        m.uniforms.uOpacity!.value = (lit.includes(ref as Ref) ? P.hoverOpacity : P.opacity) * e;
        m.uniforms.uReach!.value = distance * 2.4;
      }
    },
  };
}
