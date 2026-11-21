// The world as three.js draws it: charcoal axes with labels, the light grid of the selected plane, three small panes to pick a plane by, and fog.
// Knows nothing of input: main tells it the camera, the hover and the selection, and asks what is under a point.
import * as THREE from "three";
import { settings } from "./settings.ts";
import { basis, eye, eyeDistance, fov, type Cam, type V3 } from "./camera.ts";

export type PlaneId = "x" | "y" | "z";
/** Each plane by the axis it is square to: where the eye is for a straight view (`normal`), and the axis that runs to the right then (`u`). */
export const PLANES: Record<PlaneId, { normal: V3; u: V3; name: string; axes: [0 | 1 | 2, 0 | 1 | 2] }> = {
  x: { normal: [1, 0, 0], u: [0, 1, 0], name: "YZ", axes: [1, 2] },
  y: { normal: [0, -1, 0], u: [1, 0, 0], name: "XZ", axes: [0, 2] },
  z: { normal: [0, 0, 1], u: [1, 0, 0], name: "XY", axes: [0, 1] },
};
const IDS: PlaneId[] = ["x", "y", "z"];
const AXIS_COLOR: Record<PlaneId, number> = { x: settings.theme.axis, y: settings.theme.axis, z: settings.theme.axis };

const vec = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
/** A point given by its coordinates along the plane's two axes (and `w` along the third). */
const onPlane = (id: PlaneId, a: number, b: number, w = 0): V3 => { const p: V3 = [0, 0, 0]; const [i, j] = PLANES[id].axes; const k = [0, 1, 2].find((n) => n !== i && n !== j)!; p[i] = a; p[j] = b; p[k] = w; return p; };

function roundedSquare(size: number, round: number): THREE.Shape {
  const r = size * round, s = new THREE.Shape();
  s.moveTo(r, 0); s.lineTo(size - r, 0); s.quadraticCurveTo(size, 0, size, r); s.lineTo(size, size - r); s.quadraticCurveTo(size, size, size - r, size);
  s.lineTo(r, size); s.quadraticCurveTo(0, size, 0, size - r); s.lineTo(0, r); s.quadraticCurveTo(0, 0, r, 0);
  return s;
}

export function createWorld(canvas: HTMLCanvasElement, labelParent: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(settings.theme.background);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(settings.theme.background, 1, 2);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);

  // axes: a charcoal line and a small head each, and a label
  const labels: Record<PlaneId, HTMLElement> = { x: document.createElement("div"), y: document.createElement("div"), z: document.createElement("div") };
  const tips: Record<PlaneId, THREE.Vector3> = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
  const L = settings.world.axisLengthMm;
  IDS.forEach((id, n) => {
    const dir: V3 = [0, 0, 0]; dir[n] = 1;
    const mat = new THREE.LineBasicMaterial({ color: AXIS_COLOR[id] });
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), vec(dir).multiplyScalar(L)]), mat));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 12), new THREE.MeshBasicMaterial({ color: AXIS_COLOR[id] }));
    head.position.copy(vec(dir).multiplyScalar(L)); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec(dir));
    scene.add(head);
    tips[id].copy(vec(dir).multiplyScalar(L + 6));
    labels[id].className = "label"; labels[id].textContent = id.toUpperCase(); labelParent.append(labels[id]);
  });

  // the grid of a plane: one big quad that a shader draws the lines on (analytic, so it is crisp at any zoom, fades with distance and never needs extent)
  // lines every `step` mm, scaled with the zoom so they stay readable, the stronger ones every few steps
  const gridUniforms = {
    uStep: { value: 10 }, uSpan: { value: 1000 }, uMajor: { value: settings.world.gridMajorEvery }, uCentre: { value: new THREE.Vector2() }, uEye: { value: new THREE.Vector3() }, uFog: { value: new THREE.Vector2(1, 2) },
    uMinor: { value: new THREE.Color(settings.theme.grid) }, uStrong: { value: new THREE.Color(settings.theme.gridMajor) },
  };
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: gridUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `uniform vec2 uCentre; uniform float uSpan; varying vec2 vL; varying vec3 vW;
        void main() { vL = position.xy * uSpan + uCentre; vec4 w = modelMatrix * vec4(vL, 0.0, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uStep; uniform float uMajor; uniform vec3 uEye; uniform vec2 uFog; uniform vec3 uMinor; uniform vec3 uStrong; varying vec2 vL; varying vec3 vW;
        float lines(vec2 p) { vec2 d = fwidth(p); vec2 g = abs(fract(p - 0.5) - 0.5) / max(d, 1e-6); float l = 1.0 - min(min(g.x, g.y), 1.0); return l * (1.0 - smoothstep(0.3, 0.8, max(d.x, d.y))); }
        void main() {
          float a = lines(vL / uStep), b = lines(vL / (uStep * uMajor));
          float fade = 1.0 - clamp((distance(vW, uEye) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
          float alpha = max(a * 0.35, b * 0.55) * fade;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(mix(uMinor, uStrong, b), alpha);
        }`,
    }),
  );
  grid.visible = false; grid.frustumCulled = false; scene.add(grid);

  // the panes: small rounded squares in the three quadrants nearest the viewer
  const panes: Record<PlaneId, THREE.Mesh> = {} as never;
  const edges: Record<PlaneId, THREE.LineLoop> = {} as never;
  const { paneMm: S, paneGapMm: G } = settings.world;
  for (const id of IDS) {
    const shape = roundedSquare(S, settings.world.paneRound);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: settings.theme.pane, transparent: true, opacity: settings.world.paneOpacity, side: THREE.DoubleSide, depthWrite: false }));
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(8).map((p) => new THREE.Vector3(p.x, p.y, 0))), new THREE.LineBasicMaterial({ color: settings.theme.teal }));
    outline.visible = false; mesh.add(outline);
    // orient: the shape's x and y become the plane's two axes, placed G away from the origin in the positive quadrant
    const [i, j] = PLANES[id].axes;
    const a: V3 = [0, 0, 0], b: V3 = [0, 0, 0]; a[i] = 1; b[j] = 1;
    const m = new THREE.Matrix4().makeBasis(vec(a), vec(b), vec(a).cross(vec(b)));
    mesh.quaternion.setFromRotationMatrix(m); mesh.position.copy(vec(onPlane(id, G, G)));
    mesh.userData.id = id; scene.add(mesh); panes[id] = mesh; edges[id] = outline;
  }

  let hover: PlaneId | null = null, selected: PlaneId | null = null, gridPlane: PlaneId = "z";
  const paint = () => {
    for (const id of IDS) {
      const mat = panes[id].material as THREE.MeshBasicMaterial;
      const on = id === selected;
      mat.color.setHex(on || id === hover ? settings.theme.teal : settings.theme.pane);
      mat.opacity = on ? settings.world.paneActiveOpacity : id === hover ? settings.world.paneActiveOpacity * 0.6 : settings.world.paneOpacity;
      edges[id].visible = on;
    }
    grid.visible = selected !== null;
    if (selected) { // lay the grid on the selected plane: its lines run along the plane's two axes
      const [i, j] = PLANES[selected].axes;
      const a: V3 = [0, 0, 0], b: V3 = [0, 0, 0]; a[i] = 1; b[j] = 1;
      grid.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec(a), vec(b), vec(a).cross(vec(b))));
      gridPlane = selected;
    }
  };
  paint();

  const ray = new THREE.Raycaster();
  const size = { w: 1, h: 1 };
  return {
    resize(w: number, h: number) { size.w = w; size.h = h; renderer.setSize(w, h, false); },
    setHover(id: PlaneId | null) { if (id !== hover) { hover = id; paint(); } },
    setSelected(id: PlaneId | null) { selected = id; paint(); },
    /** The pane under a point of the view (pixels), if any. */
    pick(x: number, y: number): PlaneId | null {
      ray.setFromCamera(new THREE.Vector2((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1), camera);
      return (ray.intersectObjects(IDS.map((id) => panes[id]), false)[0]?.object.userData.id as PlaneId | undefined) ?? null;
    },
    render(c: Cam) {
      const ed = eyeDistance(c), { right, up, forward } = basis(c);
      camera.position.copy(vec(eye(c)));
      camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec(right), vec(up), vec(forward).negate()));
      camera.fov = (fov(c) * 180) / Math.PI; camera.aspect = size.w / size.h;
      camera.near = ed * 0.02; camera.far = ed * 120; camera.updateProjectionMatrix();
      (scene.fog as THREE.Fog).near = ed * 0.6; (scene.fog as THREE.Fog).far = ed * 4;
      const step = 10 ** Math.floor(Math.log10(c.distance / 6)), big = step * settings.world.gridMajorEvery;
      const [i, j] = PLANES[gridPlane].axes, t = c.target;
      gridUniforms.uStep.value = step;
      gridUniforms.uCentre.value.set(Math.round(t[i] / big) * big, Math.round(t[j] / big) * big); // the quad follows the view, in whole steps so the lines do not swim
      gridUniforms.uSpan.value = ed * 12;
      gridUniforms.uEye.value.copy(camera.position); gridUniforms.uFog.value.set(ed * 0.6, ed * 4);
      renderer.render(scene, camera);
      for (const id of IDS) { // labels follow the axis tips
        const p = tips[id].clone().project(camera);
        const visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
        labels[id].style.display = visible ? "" : "none";
        labels[id].style.left = `${((p.x + 1) / 2) * size.w}px`; labels[id].style.top = `${((1 - p.y) / 2) * size.h}px`;
      }
    },
  };
}
