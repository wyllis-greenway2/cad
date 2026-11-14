// The orb highlight (`in_073`, `in_074`): pointing at a surface puts a thin line RING on the surface at the cursor (a crisp line, not faded). A click makes the colour spread
// over the whole surface while the ring expands to the surface's edges, and what is left is the selection tint.
//
// Two sets of shared uniforms drive every surface that can be lit this way (body faces, sketch shapes, panes): `hoverOrb` follows the cursor, `selectOrb` belongs to the selection.
// uOrbC = centre (world), uOrbR = ring radius (world), uOrbA = strength of the fill (0 = none), uOrbRingA = strength of the ring (0 = none),
// uOrbSoft = how far the soft fill reaches beyond the ring (a multiple of the ring radius), uOrbFill = 0..1: how far the fill has flattened (1 = flat over the whole surface),
// uRingPx = the ring's line width on screen.
import * as THREE from "three";

type Rgb = [number, number, number];
const make = () => ({
  uOrbC: { value: new THREE.Vector3() }, uOrbR: { value: 1 }, uOrbA: { value: 0 }, uOrbRingA: { value: 0 }, uOrbSoft: { value: 2 }, uOrbFill: { value: 0 }, uRingPx: { value: 1.6 }, uOrbDisc: { value: 0 },
});
export const hoverOrb = make();
export const selectOrb = make();
/** A surface lit all over (a shape selected inside the sketch view, where there is no click to spread from). */
export const fullOrb = make();
fullOrb.uOrbFill.value = 1;

/** The colour a selected surface shows: the teal at the selection opacity over the surface's own colour (`in_075`: the ring is exactly this colour, and it is the one to reuse elsewhere). */
export const selectedLook = (teal: Rgb, opacity: number, surface: Rgb): Rgb => teal.map((c, i) => surface[i]! + (c - surface[i]!) * opacity) as Rgb;

/** One orb at world point p: x = the soft fill's alpha (smooth to nothing at soft * R; lifted to flat by `fill`), y = the crisp ring's alpha at radius R. */
const ORB_GLSL = /* glsl */ `
vec2 orbParts(vec3 p, vec3 c, float R, float fillA, float fill, float ringA, float soft, float px, float disc) {
  float d = distance(p, c);
  float k = 1.0 - smoothstep(0.0, max(R * soft, 1e-6), d);
  float w = max(fwidth(d), 1e-6) * px;
  float solid = disc * (1.0 - smoothstep(R - w, R, d)); // (a flat disc of the radius R)
  return vec2(max(fillA * mix(k * k, 1.0, fill), solid), ringA * (1.0 - smoothstep(0.5 * w, w, abs(d - R))));
}`;

/** A material that draws the orb on whatever geometry it is given (positions are world positions through the mesh's own matrix). */
export function orbMaterial(rgb: Rgb, ringRgb: Rgb, orb: ReturnType<typeof make>, { offset = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Vector3(...rgb) }, uRingCol: { value: new THREE.Vector3(...ringRgb) }, ...orb },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform vec3 uCol; uniform vec3 uRingCol; uniform vec3 uOrbC; uniform float uOrbR; uniform float uOrbA; uniform float uOrbRingA; uniform float uOrbSoft; uniform float uOrbFill; uniform float uRingPx; uniform float uOrbDisc; varying vec3 vW; ${ORB_GLSL}
      void main() {
        vec2 pr = orbParts(vW, uOrbC, uOrbR, uOrbA, uOrbFill, uOrbRingA, uOrbSoft, uRingPx, uOrbDisc);
        float a = 1.0 - (1.0 - pr.x) * (1.0 - pr.y);
        gl_FragColor = vec4(mix(uCol, uRingCol, pr.y / max(a, 1e-4)), a); // the fill is the teal, the ring is the colour the selected face shows
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: offset !== 0,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}
