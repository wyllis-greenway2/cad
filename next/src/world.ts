// The world as three.js draws it: the axes, the grid of the plane that is on (a shader: crisp at any zoom, fading into the fog), three small panes, the stand-in bodies and the hover disc.
// It knows nothing of input: the controller says what the camera is, which plane is on, what is under the pointer; it only draws. Text and buttons are the page's (ui.ts).
import * as THREE from "three";
import { settings } from "./settings.ts";
import { fovOf, forward, rightOf, upOf, type Cam } from "./camera.ts";
import type { Scene as Model } from "./scene.ts";
import { centreOf } from "./scene.ts";
import type { V3 } from "./vec.ts";

const vec = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
const rgb = (c: [number, number, number]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
/** The two world axes that lie in the plane across `axis`, in order (the first runs to the right in its straight view). */
const across = (axis: 0 | 1 | 2): [0 | 1 | 2, 0 | 1 | 2] => (axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]);
const basisOf = (axis: 0 | 1 | 2): THREE.Matrix4 => {
  const [i, j] = across(axis);
  const a: V3 = [0, 0, 0], b: V3 = [0, 0, 0]; a[i] = 1; b[j] = 1;
  return new THREE.Matrix4().makeBasis(vec(a), vec(b), vec(a).cross(vec(b)));
};

function roundedSquare(size: number, round: number): THREE.Shape {
  const r = size * round, s = new THREE.Shape();
  s.moveTo(r, 0); s.lineTo(size - r, 0); s.quadraticCurveTo(size, 0, size, r); s.lineTo(size, size - r); s.quadraticCurveTo(size, size, size - r, size);
  s.lineTo(r, size); s.quadraticCurveTo(0, size, 0, size - r); s.lineTo(0, r); s.quadraticCurveTo(0, 0, r, 0);
  return s;
}

export interface Drawing {
  cam: Cam;
  /** How far ahead things are: only the depth range of the drawing (what must not be cut off) comes from it. */
  depth: number;
  /** The distance the picture must reach: the far plane (a thing's far wall, seen from inside, must not be cut off). */
  reach: number;
  /** The grid's spacing, how far it has gone toward the next one, and how far the fog reaches: from the view's distance to the plane (see `gridLevel`). */
  grid: { step: number; blend: number; fog: number };
  w: number; h: number;
  plane: 0 | 1 | 2; // the world plane that is on: its grid is shown, its pane is lit
  paneHover: 0 | 1 | 2 | null;
  paneLevel: number; // 0..1: the panes fade out in a straight view
  axesShown: boolean;
  gizmoScale: number; // 1: the axes are 24 mm long, as the world is; otherwise how many times that
  disc: { point: V3; normal: V3; radius: number } | null;
}

export function createWorld(canvas: HTMLCanvasElement, model: Model) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(settings.theme.background);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.view.fovDeg, 1, 0.1, 1000);
  const ambient = new THREE.AmbientLight(0xffffff, 1.5), key = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(ambient, key, key.target);

  // stand-in bodies (rebuilt when the model changes)
  const bodies = new THREE.Group();
  const buildBodies = () => {
  bodies.clear();
  for (const t of model.things) {
    const size = vec([t.hi[0] - t.lo[0], t.hi[1] - t.lo[1], t.hi[2] - t.lo[2]]);
    const g = new THREE.BoxGeometry(size.x, size.y, size.z);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, color: settings.theme.bodyColor, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge })));
    m.position.copy(vec(centreOf(t)));
    bodies.add(m);
  }
  };
  buildBodies();
  scene.add(bodies);

  // axes: a charcoal line and a small head each, positive only
  const axes = new THREE.Group();
  const L = settings.world.axisLengthMm, axisColor = rgb(settings.theme.axis);
  for (let i = 0; i < 3; i++) {
    const dir: V3 = [0, 0, 0]; dir[i] = 1;
    axes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), vec(dir).multiplyScalar(L)]), new THREE.LineBasicMaterial({ color: axisColor })));
    const head = new THREE.Mesh(new THREE.ConeGeometry(settings.world.arrowRadiusMm, settings.world.arrowLengthMm, 12), new THREE.MeshBasicMaterial({ color: axisColor }));
    head.position.copy(vec(dir).multiplyScalar(L)); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec(dir));
    axes.add(head);
  }
  const gizmo = new THREE.Group(); // the axes and the little panes: one thing, scaled together
  gizmo.add(axes);
  scene.add(gizmo);

  // the grid of the plane that is on: one big quad with the lines drawn by the shader
  const uni = {
    uStep: { value: 10 }, uBlend: { value: 0 }, uSpan: { value: 1000 }, uCentre: { value: new THREE.Vector2() },
    uEye: { value: new THREE.Vector3() }, uFog: { value: new THREE.Vector2(1, 2) }, uColor: { value: rgb(settings.theme.grid) },
    uAlpha: { value: new THREE.Vector2(settings.theme.minorAlpha, settings.theme.majorAlpha) },
  };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform vec2 uCentre; uniform float uSpan; varying vec2 vL; varying vec3 vW;
      void main() { vL = position.xy * uSpan + uCentre; vec4 w = modelMatrix * vec4(vL, 0.0, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uStep; uniform float uBlend; uniform vec3 uEye; uniform vec2 uFog; uniform vec3 uColor; uniform vec2 uAlpha; varying vec2 vL; varying vec3 vW;
      float lines(vec2 p) { vec2 d = fwidth(p); vec2 g = abs(fract(p - 0.5) - 0.5) / max(d, 1e-6); float l = 1.0 - min(min(g.x, g.y), 1.0); return l * (1.0 - smoothstep(0.3, 0.8, max(d.x, d.y))); }
      void main() {
        // three spacings, each ten times the last: as the view goes from one to the next, the finest fades out, the middle takes the strength of the finest and the coarsest rises to the strength of the middle
        float a0 = lines(vL / uStep), a1 = lines(vL / (uStep * 10.0)), a2 = lines(vL / (uStep * 100.0));
        float fade = 1.0 - clamp((distance(vW, uEye) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
        float alpha = max(max(a0 * uAlpha.x * (1.0 - uBlend), a1 * mix(uAlpha.y, uAlpha.x, uBlend)), a2 * uAlpha.y * uBlend) * fade;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }`,
  }));
  grid.frustumCulled = false; grid.renderOrder = 1;
  scene.add(grid);

  // the three panes, one for the plane across each axis
  const panes: THREE.Mesh[] = [], edges: THREE.LineLoop[] = [];
  const S = settings.world.paneMm, G = settings.world.paneGapMm;
  const outline = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const shape = roundedSquare(S, settings.world.paneRound);
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(6).map((p) => new THREE.Vector3(p.x, p.y, 0))), new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
    fill.add(edge);
    const [i, j] = across(k as 0 | 1 | 2), at: V3 = [0, 0, 0]; at[i] = G; at[j] = G;
    fill.quaternion.setFromRotationMatrix(basisOf(k as 0 | 1 | 2)); fill.position.copy(vec(at));
    fill.renderOrder = 6; edge.renderOrder = 6;
    outline.add(fill); panes.push(fill); edges.push(edge);
  }
  gizmo.add(outline);

  // the hover disc: flat on the surface under the pointer, soft, with no hard edge
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: rgb(settings.orb.color), transparent: true, opacity: settings.orb.hoverOpacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
  disc.renderOrder = 5; disc.visible = false;
  scene.add(disc);

  return {
    rebuild: buildBodies,
    render(d: Drawing) {
      renderer.setSize(d.w, d.h, false);
      const c = d.cam, f = forward(c);
      camera.position.copy(vec(c.eye));
      camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec(rightOf(c)), vec(upOf(c)), vec(f).negate()));
      camera.fov = (fovOf(c) * 180) / Math.PI; camera.aspect = d.w / d.h;
      camera.near = d.depth * 0.02; camera.far = Math.max(d.depth, d.reach) * 120; camera.updateProjectionMatrix();
      key.position.copy(camera.position); key.target.position.copy(vec([c.eye[0] + f[0], c.eye[1] + f[1], c.eye[2] + f[2]]));
      // the grid: lines at whole multiples of the spacing from the origin (the world's), the quad following the view in whole steps so the lines do not swim
      const big = d.grid.step * 100;
      const [i, j] = across(d.plane);
      grid.quaternion.setFromRotationMatrix(basisOf(d.plane));
      uni.uStep.value = d.grid.step; uni.uBlend.value = d.grid.blend; uni.uSpan.value = d.grid.fog * 5 + big;
      uni.uCentre.value.set(Math.round(c.eye[i] / big) * big, Math.round(c.eye[j] / big) * big);
      uni.uEye.value.copy(camera.position); uni.uFog.value.set(d.grid.fog * 0.6, d.grid.fog * 4);
      axes.visible = d.axesShown; gizmo.scale.setScalar(d.gizmoScale);
      // the panes: the one that is on in the one teal, the one under the pointer lighter; none at all in a straight view
      for (let k = 0; k < 3; k++) {
        const on = k === d.plane, hov = k === d.paneHover;
        const colour = rgb(on ? settings.orb.color : settings.theme.pane);
        const fill = panes[k]!.material as THREE.MeshBasicMaterial, line = edges[k]!.material as THREE.LineBasicMaterial;
        fill.color.copy(colour); line.color.copy(colour);
        fill.opacity = d.paneLevel * (hov ? Math.min(0.75, settings.world.paneActiveOpacity + 0.3) : on ? settings.world.paneActiveOpacity : settings.world.paneOpacity);
        line.opacity = d.paneLevel * (hov || on ? 0.9 : 0.5);
        panes[k]!.visible = d.axesShown && d.paneLevel > 0.001;
      }
      if (d.disc) {
        disc.visible = true; disc.position.copy(vec(d.disc.point)); disc.scale.setScalar(d.disc.radius);
        disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vec(d.disc.normal));
      } else disc.visible = false;
      renderer.render(scene, camera);
    },
  };
}
