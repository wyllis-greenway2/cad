// The world's own things as three.js draws them: the axes, the grid of the plane that is on (a shader: crisp at any zoom, fading into the fog), the three small panes and the hover disc.
import * as THREE from "three";
import type { Cam } from "./camera.ts";
import { across } from "./planes.ts";
import { settings } from "./settings.ts";
import { basisOf, rgb, vec } from "./threeutil.ts";
import type { V3 } from "./vec.ts";

/** What these need of a picture. */
export interface GizmoDrawing {
  /** The active sketch plane when it is not a world plane: it carries the grid. */
  sketch?: { origin: V3; u: V3; v: V3; n: V3 } | null;
  /** The grid's spacing, how far it has gone toward the next one, and how far the fog reaches: from the view's distance to the plane (see `gridLevel`). */
  grid: { step: number; blend: number; fog: number; span: number };
  plane: 0 | 1 | 2; // the world plane that is on: its grid is shown, its pane is lit
  paneHover: 0 | 1 | 2 | null;
  paneLevel: number; // 0..1: the panes fade out in a straight view
  axesShown: boolean;
  gizmoScale: number; // 1: the axes are 24 mm long, as the world is; otherwise how many times that
  disc: { point: V3; normal: V3; radius: number } | null;
}

function roundedSquare(size: number, round: number): THREE.Shape {
  const r = size * round,
    s = new THREE.Shape();
  s.moveTo(r, 0);
  s.lineTo(size - r, 0);
  s.quadraticCurveTo(size, 0, size, r);
  s.lineTo(size, size - r);
  s.quadraticCurveTo(size, size, size - r, size);
  s.lineTo(r, size);
  s.quadraticCurveTo(0, size, 0, size - r);
  s.lineTo(0, r);
  s.quadraticCurveTo(0, 0, r, 0);
  return s;
}

export function createGizmo(scene: THREE.Scene) {
  // axes: a charcoal line and a small head each, positive only
  const axes = new THREE.Group();
  const L = settings.world.axisLengthMm,
    axisColor = rgb(settings.theme.axis);
  for (let i = 0; i < 3; i++) {
    const dir: V3 = [0, 0, 0];
    dir[i] = 1;
    axes.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), vec(dir).multiplyScalar(L)]),
        new THREE.LineBasicMaterial({ color: axisColor }),
      ),
    );
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(settings.world.arrowRadiusMm, settings.world.arrowLengthMm, settings.world.arrowSegments),
      new THREE.MeshBasicMaterial({ color: axisColor }),
    );
    head.position.copy(vec(dir).multiplyScalar(L));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec(dir));
    axes.add(head);
  }
  const gizmo = new THREE.Group(); // the axes and the little panes: one thing, scaled together
  gizmo.add(axes);
  scene.add(gizmo);

  // the grid of the plane that is on: one big quad with the lines drawn by the shader
  const uni = {
    uStep: { value: 10 },
    uBlend: { value: 0 },
    uSpan: { value: 1000 },
    uFoot: { value: new THREE.Vector2() },
    uPhase: { value: new THREE.Vector2() },
    uEye: { value: new THREE.Vector3() },
    uFog: { value: new THREE.Vector2(1, 2) },
    uColor: { value: rgb(settings.theme.grid) },
    uAlpha: { value: new THREE.Vector2(settings.theme.minorAlpha, settings.theme.majorAlpha) },
  };
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: uni,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1, // (a sketch plane that lies in a face of a body is drawn over it)
      // the lines are worked out from the eye's foot on the plane: the picture's own numbers are small near the eye however far the eye is from the
      // origin (`uPhase` is where the foot is within a hundred spacings, worked out exactly on the CPU), so the lines stay sharp at any zoom
      vertexShader: `uniform vec2 uFoot; uniform vec2 uPhase; uniform float uSpan; varying vec2 vP; varying vec3 vW;
      void main() { vec2 l = position.xy * uSpan; vP = l + uPhase; vec4 w = modelMatrix * vec4(uFoot + l, 0.0, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uStep; uniform float uBlend; uniform vec3 uEye; uniform vec2 uFog; uniform vec3 uColor; uniform vec2 uAlpha; varying vec2 vP; varying vec3 vW;
      float lines(vec2 p) { vec2 d = fwidth(p); vec2 g = abs(fract(p - 0.5) - 0.5) / max(d, 1e-6); float l = 1.0 - min(min(g.x, g.y), 1.0); return l * (1.0 - smoothstep(0.3, 0.8, max(d.x, d.y))); }
      void main() {
        // three spacings, each ten times the last: as the view goes from one to the next, the finest fades out, the middle takes the strength of the
        // finest and the coarsest rises to the strength of the middle
        float a0 = lines(vP / uStep), a1 = lines(vP / (uStep * 10.0)), a2 = lines(vP / (uStep * 100.0));
        float fade = 1.0 - clamp((distance(vW, uEye) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
        float alpha = max(max(a0 * uAlpha.x * (1.0 - uBlend), a1 * mix(uAlpha.y, uAlpha.x, uBlend)), a2 * uAlpha.y * uBlend) * fade;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }`,
    }),
  );
  grid.frustumCulled = false;
  grid.renderOrder = 1;
  scene.add(grid);

  // the three panes, one for the plane across each axis
  const panes: THREE.Mesh[] = [],
    edges: THREE.LineLoop[] = [];
  const S = settings.world.paneMm,
    G = settings.world.paneGapMm;
  const outline = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const shape = roundedSquare(S, settings.world.paneRound);
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        shape.getPoints(settings.world.paneCurveSteps).map((p) => new THREE.Vector3(p.x, p.y, 0)),
      ),
      new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }),
    );
    fill.add(edge);
    const [i, j] = across(k as 0 | 1 | 2),
      at: V3 = [0, 0, 0];
    at[i] = G;
    at[j] = G;
    fill.quaternion.setFromRotationMatrix(basisOf(k as 0 | 1 | 2));
    fill.position.copy(vec(at));
    fill.renderOrder = 6;
    edge.renderOrder = 6;
    outline.add(fill);
    panes.push(fill);
    edges.push(edge);
  }
  gizmo.add(outline);

  // the hover disc: flat on the surface under the pointer, soft, with no hard edge
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, settings.world.discSegments),
    new THREE.MeshBasicMaterial({
      color: rgb(settings.orb.color),
      transparent: true,
      opacity: settings.orb.hoverOpacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    }),
  );
  disc.renderOrder = 5;
  disc.visible = false;
  scene.add(disc);
  return {
    update(d: GizmoDrawing, c: Cam) {
      // the grid: lines at whole multiples of the spacing from the origin (the world's), the quad following the view in whole steps so the lines do
      // not swim
      const big = d.grid.step * 100;
      const [i, j] = across(d.plane),
        sk = d.sketch ?? null;
      grid.quaternion.setFromRotationMatrix(
        sk ? new THREE.Matrix4().makeBasis(vec(sk.u), vec(sk.v), vec(sk.n)) : basisOf(d.plane),
      );
      grid.position.copy(sk ? vec(sk.origin) : new THREE.Vector3());
      const rel = sk ? vec(c.eye).sub(vec(sk.origin)) : null;
      const foot = sk ? [rel!.dot(vec(sk.u)), rel!.dot(vec(sk.v))] : [c.eye[i]!, c.eye[j]!];
      uni.uStep.value = d.grid.step;
      uni.uBlend.value = d.grid.blend;
      uni.uSpan.value = d.grid.span + big;
      uni.uFoot.value.set(foot[0]!, foot[1]!);
      uni.uPhase.value.set(foot[0]! - Math.floor(foot[0]! / big) * big, foot[1]! - Math.floor(foot[1]! / big) * big);
      uni.uEye.value.set(c.eye[0], c.eye[1], c.eye[2]);
      uni.uFog.value.set(d.grid.fog * settings.world.fogNear, d.grid.fog * settings.world.fogFar);
      axes.visible = d.axesShown;
      gizmo.scale.setScalar(d.gizmoScale);
      // the panes: the one that is on in the one teal, the one under the pointer lighter; none at all in a straight view
      for (let k = 0; k < 3; k++) {
        const on = k === d.plane && !d.sketch,
          hov = k === d.paneHover;
        const colour = rgb(on ? settings.orb.color : settings.theme.pane);
        const fill = panes[k]!.material as THREE.MeshBasicMaterial,
          line = edges[k]!.material as THREE.LineBasicMaterial;
        fill.color.copy(colour);
        line.color.copy(colour);
        fill.opacity =
          d.paneLevel *
          (hov
            ? Math.min(settings.world.paneHoverMax, settings.world.paneActiveOpacity + settings.world.paneHoverBoost)
            : on
              ? settings.world.paneActiveOpacity
              : settings.world.paneOpacity);
        line.opacity = d.paneLevel * (hov || on ? settings.world.paneLineHot : settings.world.paneLineCool);
        panes[k]!.visible = d.axesShown && d.paneLevel > 0.001;
      }
      if (d.disc) {
        disc.visible = true;
        disc.position.copy(vec(d.disc.point));
        disc.scale.setScalar(d.disc.radius);
        disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vec(d.disc.normal));
      } else disc.visible = false;
    },
  };
}
