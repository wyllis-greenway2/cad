// The world dressing (`in_064` to `in_070`): short charcoal pencil axes with arrowheads and X Y Z labels, three rounded panes floating out from the axes to choose a plane
// by (until there is a body), the same axes shrunk into a compass in the corner once there is one, and the faint grid on the plane you look straight at.
// It draws what it is told and decides nothing: the controller says whether the big axes are shown, and the camera says how to look.
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Ref, Vec3 } from "../interaction/api.ts";
import { settings } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, offsetOf, projector } from "../interaction/camera.ts";
import type { Grid } from "../interaction/grid.ts";

const AXIS_LEN = 30; // mm: each axis stops at its arrow
const HEAD = 2.6; // arrowhead length
const AXES: { name: "X" | "Y" | "Z"; dir: Vec3 }[] = [{ name: "X", dir: [1, 0, 0] }, { name: "Y", dir: [0, 1, 0] }, { name: "Z", dir: [0, 0, 1] }];
const PLANES: { ref: string; u: Vec3; v: Vec3 }[] = [{ ref: "w/XY", u: [1, 0, 0], v: [0, 1, 0] }, { ref: "w/XZ", u: [1, 0, 0], v: [0, 0, 1] }, { ref: "w/YZ", u: [0, 1, 0], v: [0, 0, 1] }];

export interface WorldState {
  /** the big axes and panes at the origin (false: only the corner compass) */
  big: boolean;
  /** the starter panes are shown (no body yet) */
  panes: boolean;
  hover: Ref | undefined;
  /** there is a body: the compass lives in the corner (a faint copy stays when the big axes are out) */
  corner: boolean;
}

export function createWorld(renderer: THREE.WebGLRenderer, scene3: THREE.Scene, host: HTMLElement) {
  const srgb = (c: readonly [number, number, number]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); // the tuned values are screen colours
  const axisCol = srgb(settings.theme.axis);
  const sheetCol = srgb(settings.theme.sheet);
  const fadeMats: { mat: THREE.Material & { opacity: number }; base: number }[] = [];
  const track = <M extends THREE.Material & { opacity: number }>(mat: M, base = 1): M => {
    mat.transparent = true;
    fadeMats.push({ mat, base });
    return mat;
  };
  const lineMats: LineMaterial[] = [];

  const axisGroup = (len: number, width: number, head: number, color: THREE.Color): { group: THREE.Group; mats: LineMaterial[]; cones: THREE.Mesh[] } => {
    const g = new THREE.Group();
    const mats: LineMaterial[] = [];
    const cones: THREE.Mesh[] = [];
    for (const a of AXES) {
      const geo = new LineGeometry();
      geo.setPositions([0, 0, 0, ...a.dir.map((v) => v * (len - head * 0.6))]);
      const mat = new LineMaterial({ color: color.getHex(), linewidth: width, worldUnits: false });
      mats.push(mat);
      g.add(new Line2(geo, mat));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(head * 0.3, head, 14), new THREE.MeshBasicMaterial({ color }));
      cone.position.set(a.dir[0] * (len - head / 2), a.dir[1] * (len - head / 2), a.dir[2] * (len - head / 2));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...a.dir));
      g.add(cone);
      cones.push(cone);
    }
    return { group: g, mats, cones };
  };

  // ---- the big axes and panes at the origin ----
  const big = new THREE.Group();
  const bigAxes = axisGroup(AXIS_LEN, 2.2, HEAD, axisCol);
  big.add(bigAxes.group);
  for (const m of bigAxes.mats) track(m);
  bigAxes.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && !(m instanceof LineMaterial)) track(m); });
  lineMats.push(...bigAxes.mats);
  const panes = new THREE.Group();
  const paneMats = new Map<string, { fill: THREE.MeshBasicMaterial; edge: THREE.LineBasicMaterial }>();
  const P = settings.panes;
  const shape = new THREE.Shape();
  const r = P.size * P.radius;
  const s = P.size;
  shape.moveTo(r, 0); shape.lineTo(s - r, 0); shape.quadraticCurveTo(s, 0, s, r); shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(r, s); shape.quadraticCurveTo(0, s, 0, s - r); shape.lineTo(0, r); shape.quadraticCurveTo(0, 0, r, 0);
  for (const pl of PLANES) {
    const fill = new THREE.MeshBasicMaterial({ color: sheetCol, side: THREE.DoubleSide, depthWrite: false });
    const edge = new THREE.LineBasicMaterial({ color: sheetCol.clone().multiplyScalar(0.8) });
    const n = new THREE.Vector3(...pl.u).cross(new THREE.Vector3(...pl.v));
    const m4 = new THREE.Matrix4().makeBasis(new THREE.Vector3(...pl.u), new THREE.Vector3(...pl.v), n);
    m4.setPosition(new THREE.Vector3(...pl.u).multiplyScalar(P.offset).add(new THREE.Vector3(...pl.v).multiplyScalar(P.offset)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), fill);
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(12).map((p) => new THREE.Vector3(p.x, p.y, 0))), edge);
    for (const o of [mesh, outline]) { o.matrixAutoUpdate = false; o.matrix.copy(m4); panes.add(o); }
    paneMats.set(pl.ref, { fill, edge });
    track(fill, P.opacity);
    track(edge, P.edgeAlpha);
  }
  big.add(panes);
  scene3.add(big);

  // ---- the compass in the corner ----
  const compassScene = new THREE.Scene();
  const compassAxes = axisGroup(1, 2, 0.28, axisCol);
  compassScene.add(compassAxes.group);
  lineMats.push(...compassAxes.mats);
  const compassCam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);

  // ---- grid ----
  const gridGroup = new THREE.Group();
  scene3.add(gridGroup);
  const gridMinor = new THREE.LineBasicMaterial({ color: new THREE.Color(...settings.grid.color), transparent: true, opacity: settings.grid.minorAlpha, depthWrite: false });
  const gridMajor = new THREE.LineBasicMaterial({ color: new THREE.Color(...settings.grid.color), transparent: true, opacity: settings.grid.majorAlpha, depthWrite: false });
  const segs = (pts: number[], mat: THREE.LineBasicMaterial) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, mat);
  };

  // ---- labels (DOM, placed by projection) ----
  const label = (text: string): HTMLDivElement => {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = "position:absolute;left:0;top:0;font:700 12px system-ui,sans-serif;color:#2b2b2d;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;pointer-events:none;transform:translate(-50%,-50%);display:none";
    host.appendChild(d);
    return d;
  };
  const bigLabels = AXES.map((a) => label(a.name));
  const compassLabels = AXES.map((a) => label(a.name));

  // k: 1 = the big axes are shown, 0 = only the compass; moves toward its target over `seconds`
  let k = 1;
  let lastT = 0;
  let animating = false;
  let corner = false;

  function update(state: WorldState, cam: Camera, size: { w: number; h: number }, nowMs: number): boolean {
    const dt = lastT ? Math.min(0.1, (nowMs - lastT) / 1000) : 0;
    lastT = nowMs;
    corner = state.corner;
    const target = state.big ? 1 : 0;
    if (k !== target) k = k < target ? Math.min(target, k + dt / settings.compass.seconds) : Math.max(target, k - dt / settings.compass.seconds);
    animating = k !== target;
    const e = k * k * (3 - 2 * k); // eased
    big.visible = e > 0.01;
    panes.visible = state.panes;
    for (const f of fadeMats) f.mat.opacity = f.base * e;
    for (const [ref, m] of paneMats) {
      const hot = state.hover === ref;
      m.fill.opacity = (hot ? P.hoverOpacity : P.opacity) * e;
      m.edge.opacity = (hot ? P.hoverEdgeAlpha : P.edgeAlpha) * e;
    }
    for (const l of lineMats) l.resolution.set(size.w, size.h);
    const pr = projector(cam, size.w, size.h);
    const fwd = basis(cam).forward;
    const facing = AXES.map((a) => Math.abs(a.dir[0] * fwd[0] + a.dir[1] * fwd[1] + a.dir[2] * fwd[2]) > 0.98); // an axis pointing at you is seen end-on: no arrowhead, no label
    bigAxes.cones.forEach((c, i) => (c.visible = !facing[i]));
    bigLabels.forEach((d, i) => {
      const p = pr.project(AXES[i]!.dir.map((v) => v * (AXIS_LEN + 4)) as unknown as Vec3);
      d.style.display = big.visible && !facing[i] ? "block" : "none";
      d.style.opacity = String(e);
      d.style.left = `${p[0]}px`;
      d.style.top = `${p[1]}px`;
    });
    return animating;
  }

  /** Draw the compass over the finished frame (call after the main render). */
  function renderCompass(cam: Camera, size: { w: number; h: number }) {
    const C = settings.compass;
    const e = k * k * (3 - 2 * k);
    const a = corner ? 0.3 + 0.7 * (1 - e) : 0; // a faint copy stays in the corner while the big axes are out
    compassAxes.group.visible = a > 0.01;
    compassAxes.mats.forEach((m) => { m.opacity = a; m.transparent = true; });
    compassAxes.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && !(m instanceof LineMaterial)) { m.transparent = true; m.opacity = a; } });
    const b = basis(cam);
    const off = offsetOf(cam);
    compassCam.position.set(off[0] * 6, off[1] * 6, off[2] * 6);
    compassCam.up.set(...b.up);
    compassCam.lookAt(0, 0, 0);
    compassCam.updateMatrixWorld();
    const x = size.w - C.sizePx - C.marginPx;
    const y = C.marginPx; // from the bottom
    if (a > 0.01) {
      renderer.autoClear = false;
      renderer.setViewport(x, y, C.sizePx, C.sizePx);
      renderer.setScissor(x, y, C.sizePx, C.sizePx);
      renderer.setScissorTest(true);
      renderer.clearDepth();
      renderer.render(compassScene, compassCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.w, size.h);
      renderer.autoClear = true;
    }
    compassLabels.forEach((d, i) => {
      const v = new THREE.Vector3(...AXES[i]!.dir).multiplyScalar(1.2).project(compassCam);
      d.style.display = a > 0.01 ? "block" : "none";
      d.style.opacity = String(a);
      d.style.left = `${x + ((v.x + 1) / 2) * C.sizePx}px`;
      d.style.top = `${size.h - (y + ((v.y + 1) / 2) * C.sizePx)}px`;
    });
  }

  function setGrid(g: Grid | null) {
    for (const o of [...gridGroup.children]) { gridGroup.remove(o); (o as THREE.LineSegments).geometry.dispose(); }
    if (!g) return;
    gridGroup.add(segs(g.minor, gridMinor), segs(g.major, gridMajor));
  }

  return { update, renderCompass, setGrid, compassRect: (w: number) => ({ x: w - settings.compass.sizePx - settings.compass.marginPx, size: settings.compass.sizePx, margin: settings.compass.marginPx }) };
}
