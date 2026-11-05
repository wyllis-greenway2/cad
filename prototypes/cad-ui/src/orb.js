// The orb highlight (`in_073`): instead of tinting a whole surface, a soft semi-transparent circle lies ON the surface where the cursor is and fades smoothly to nothing
// (no hard edge). On a click the same colour radiates outward from the click until it fills the whole surface.
//
// Two sets of shared uniforms drive every surface that can be lit this way (body faces, sketch shapes, panes): `hoverOrb` follows the cursor, `selectOrb` belongs to the selection.
// uOrbC = centre (world), uOrbR = radius (world), uOrbA = strength (0 = off), uOrbFill = 0..1: how far it has filled the surface (1 = flat).
import * as THREE from "three";

const make = () => ({ uOrbC: { value: new THREE.Vector3() }, uOrbR: { value: 1 }, uOrbA: { value: 0 }, uOrbFill: { value: 0 } });
export const hoverOrb = make();
export const selectOrb = make();
/** A surface lit all over (a shape selected inside the sketch view, where there is no click to radiate from). */
export const fullOrb = { uOrbC: { value: new THREE.Vector3() }, uOrbR: { value: 1 }, uOrbA: { value: 0.6 }, uOrbFill: { value: 1 } };

/** The falloff, for GLSL: 1 at the centre, smoothly 0 at the radius; `fill` lifts it to 1 everywhere. */
export const ORB_GLSL = /* glsl */ `
float orbProfile(vec3 p, vec3 c, float R, float fill) {
  float k = 1.0 - smoothstep(0.0, max(R, 1e-6), distance(p, c));
  return mix(k * k, 1.0, fill);
}`;

/** A material that draws the orb on whatever geometry it is given (positions are world positions through the mesh's own matrix). */
export function orbMaterial(rgb, orb, { offset = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Vector3(...rgb) }, ...orb },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform vec3 uCol; uniform vec3 uOrbC; uniform float uOrbR; uniform float uOrbA; uniform float uOrbFill; varying vec3 vW; ${ORB_GLSL}
      void main() { float a = uOrbA * orbProfile(vW, uOrbC, uOrbR, uOrbFill); gl_FragColor = vec4(uCol, a); }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: offset !== 0,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}
