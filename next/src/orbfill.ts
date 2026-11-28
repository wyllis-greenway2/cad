// The orb highlight of a surface (`in_073`, copied from the old app's `ui/orb.ts`, `dec_body_look_and_feel`): pointing at a face puts a flat disc of the teal on it at the pointer; a click makes the teal spread over the whole face, a crisp ring growing to the face's edges, and what is left is the selection's tint.
// One shader, two sets of uniforms: `hover` follows the pointer, `select` belongs to the picked face. uOrbC the centre (world), uOrbR the ring's radius (world), uOrbA the fill's strength (0: none), uOrbRingA the ring's strength, uOrbSoft how far the soft fill reaches beyond the ring (times the radius), uOrbFill 0..1 how far the fill has flattened (1: flat over the whole surface), uOrbDisc the strength of a flat disc of the radius (the hover), uRingPx the ring's width on the screen.
import * as THREE from "three";
import { mix } from "./looks.ts";
import { settings } from "./settings.ts";

export type Rgb = [number, number, number];
const make = () => ({
  uOrbC: { value: new THREE.Vector3() },
  uOrbR: { value: 1 },
  uOrbA: { value: 0 },
  uOrbRingA: { value: 0 },
  uOrbSoft: { value: 2 },
  uOrbFill: { value: 0 },
  uRingPx: { value: 1.6 },
  uOrbDisc: { value: 0 },
});
export type Orb = ReturnType<typeof make>;
export const makeOrbs = (): { hover: Orb; select: Orb } => ({ hover: make(), select: make() });

/** The colour a selected surface shows: the teal at the selection's opacity over the surface's own colour (the ring is exactly this colour). */
export const selectedRgb = (): Rgb => {
  const c = mix(settings.looks.solid.color, settings.looks.marks.pick.color, settings.orb.selectOpacity);
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
};

const ORB_GLSL = /* glsl */ `
vec2 orbParts(vec3 p, vec3 c, float R, float fillA, float fill, float ringA, float soft, float px, float disc) {
  float d = distance(p, c);
  float k = 1.0 - smoothstep(0.0, max(R * soft, 1e-6), d);
  float w = max(fwidth(d), 1e-6) * px;
  float solid = disc * (1.0 - smoothstep(R - w, R, d)); // (a flat disc of the radius R)
  return vec2(max(fillA * mix(k * k, 1.0, fill), solid), ringA * (1.0 - smoothstep(0.5 * w, w, abs(d - R))));
}`;

/** A material that draws an orb on whatever geometry it is given (positions are world positions). */
export function orbMaterial(rgb: Rgb, ringRgb: Rgb, orb: Orb): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCol: { value: new THREE.Vector3(...rgb) },
      uRingCol: { value: new THREE.Vector3(...ringRgb) },
      ...orb,
    },
    vertexShader:
      "varying vec3 vW; void main() { vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 uCol; uniform vec3 uRingCol; uniform vec3 uOrbC; uniform float uOrbR; uniform float uOrbA; uniform float uOrbRingA; uniform float uOrbSoft; uniform float uOrbFill; uniform float uRingPx; uniform float uOrbDisc; varying vec3 vW;
      ${ORB_GLSL}
      void main() {
        vec2 pr = orbParts(vW, uOrbC, uOrbR, uOrbA, uOrbFill, uOrbRingA, uOrbSoft, uRingPx, uOrbDisc);
        float a = 1.0 - (1.0 - pr.x) * (1.0 - pr.y);
        gl_FragColor = vec4(mix(uCol, uRingCol, pr.y / max(a, 1e-4)), a); // the fill is the teal, the ring is the colour the selected face shows
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Each picture: where the hover disc stands (null: none) and how far the pick's spread has come (null: it has been there; the face is tinted all over). `reach`: the farthest the spread has to go. */
export function setOrbs(
  orbs: { hover: Orb; select: Orb },
  hover: { point: readonly number[]; radius: number } | null,
  spread: { point: readonly number[]; k: number; reach: number } | null,
): void {
  const O = settings.orb,
    h = orbs.hover,
    s = orbs.select;
  if (hover) {
    h.uOrbC.value.set(hover.point[0]!, hover.point[1]!, hover.point[2]!);
    h.uOrbR.value = hover.radius;
    h.uOrbA.value = 0;
    h.uOrbRingA.value = 0; // (a solid disc and no ring: a ring looked like a circle that a click would place, `in_300`)
    h.uOrbDisc.value = O.hoverOpacity;
    h.uOrbFill.value = 0;
    h.uRingPx.value = O.ringPx;
  }
  s.uOrbA.value = O.selectOpacity;
  s.uRingPx.value = O.ringPx;
  if (spread) {
    s.uOrbC.value.set(spread.point[0]!, spread.point[1]!, spread.point[2]!);
    s.uOrbR.value = Math.max(1e-6, spread.k * spread.reach * O.reachFactor);
    s.uOrbRingA.value = spread.k < 1 ? 1 : 0;
    s.uOrbSoft.value = O.softFactor;
    s.uOrbFill.value = spread.k;
  } else {
    s.uOrbRingA.value = 0;
    s.uOrbFill.value = 1;
  }
}
