// The orb highlight (`in_073`, `in_074`): pointing at a surface puts a thin line RING on the surface at the cursor (a crisp line, not faded). A click makes the colour spread
// over the whole surface while the ring expands to the surface's edges, and what is left is the selection tint.
//
// Two sets of shared uniforms drive every surface that can be lit this way (body faces, sketch shapes, panes): `hoverOrb` follows the cursor, `selectOrb` belongs to the selection.
// uOrbC = centre (world), uOrbR = ring radius (world), uOrbA = strength of the fill (0 = none), uOrbRingA = strength of the ring (0 = none),
// uOrbSoft = how far the soft fill reaches beyond the ring (a multiple of the ring radius), uOrbFill = 0..1: how far the fill has flattened (1 = flat over the whole surface),
// uRingPx = the ring's line width on screen.
import * as THREE from "three";

const make = () => ({
  uOrbC: { value: new THREE.Vector3() }, uOrbR: { value: 1 }, uOrbA: { value: 0 }, uOrbRingA: { value: 0 }, uOrbSoft: { value: 2 }, uOrbFill: { value: 0 }, uRingPx: { value: 1.6 },
});
export const hoverOrb = make();
export const selectOrb = make();
/** A surface lit all over (a shape selected inside the sketch view, where there is no click to spread from). */
export const fullOrb = make();
fullOrb.uOrbFill.value = 1;

/** Alpha of one orb at world point p: the soft fill (smooth to nothing at soft * R; lifted to flat by `fill`) and the crisp ring at radius R, combined. */
export const ORB_GLSL = /* glsl */ `
float orbAlpha(vec3 p, vec3 c, float R, float fillA, float fill, float ringA, float soft, float px) {
  float d = distance(p, c);
  float k = 1.0 - smoothstep(0.0, max(R * soft, 1e-6), d);
  float fa = fillA * mix(k * k, 1.0, fill);
  float w = max(fwidth(d), 1e-6) * px;
  float ra = ringA * (1.0 - smoothstep(0.5 * w, w, abs(d - R)));
  return 1.0 - (1.0 - fa) * (1.0 - ra);
}`;

/** A material that draws the orb on whatever geometry it is given (positions are world positions through the mesh's own matrix). */
export function orbMaterial(rgb, orb, { offset = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Vector3(...rgb) }, ...orb },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform vec3 uCol; uniform vec3 uOrbC; uniform float uOrbR; uniform float uOrbA; uniform float uOrbRingA; uniform float uOrbSoft; uniform float uOrbFill; uniform float uRingPx; varying vec3 vW; ${ORB_GLSL}
      void main() { gl_FragColor = vec4(uCol, orbAlpha(vW, uOrbC, uOrbR, uOrbA, uOrbFill, uOrbRingA, uOrbSoft, uRingPx)); }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: offset !== 0,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}
