// The world as three.js draws it: a frame is the camera, the lights, and the parts, each in its own file: the world's own things (`gizmodraw.ts`), the bodies (`bodydraw.ts`), what is laid over them (`overlaydraw.ts`), and the sketch's lines and the orb, which are made new every picture.
// It knows nothing of input: the controller says what the camera is, which plane is on, what is under the pointer; it only draws. Text and buttons are the page's (ui.ts).
import * as THREE from "three";
import { forward, fovOf, rightOf, upOf, type Cam } from "./camera.ts";
import { createBodies, type BodiesDrawing } from "./bodydraw.ts";
import { createGizmo, type GizmoDrawing } from "./gizmodraw.ts";
import { createOverlays, type Overlays } from "./overlaydraw.ts";
import type { OrbDrawing } from "./orbcontrol.ts";
import { drawOrb } from "./orbdraw.ts";
import type { Scene as Model } from "./scene.ts";
import { settings } from "./settings.ts";
import type { DrawLine } from "./sketchcontrol.ts";
import { drawLines } from "./sketchdraw.ts";
import { vec } from "./threeutil.ts";

/** Everything one picture is made of. */
export interface Drawing extends GizmoDrawing, BodiesDrawing, Overlays {
  /** The mover orb (orbcontrol.ts). */
  orb?: OrbDrawing | null;
  /** The sketch's lines: figures, what the tool would make, the pointer's cross. */
  lines?: DrawLine[];
  cam: Cam;
  /** The scale of what the eye is among: the depth range of the drawing is a multiple of it. */
  depth: number;
  w: number;
  h: number;
}

export function createWorld(canvas: HTMLCanvasElement, model: Model) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(settings.theme.background);
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(settings.view.fovDeg, 1, 0.1, 1000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000); // a straight view at rest is drawn with this: nothing of the third dimension is seen when the view is slid across
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = persp;
  const ambient = new THREE.AmbientLight(0xffffff, settings.light.ambient * Math.PI),
    key = new THREE.DirectionalLight(0xffffff, settings.light.key),
    fill = new THREE.DirectionalLight(0xffffff, settings.light.fill);
  scene.add(ambient, key, key.target, fill, fill.target);

  const bodies = createBodies(scene, renderer, model),
    gizmo = createGizmo(scene),
    overlays = createOverlays(scene, bodies.solids);

  // the mover orb, drawn into this group, which is emptied every picture
  const dyn = new THREE.Group();
  scene.add(dyn);
  const drop = () => {
    for (const o of [...dyn.children]) {
      dyn.remove(o);
      o.traverse((q) => {
        // (everything in this group is made new every picture, so its geometry and materials go with it; the dot's shared texture is not the material's to dispose)
        const m = q as THREE.Mesh;
        m.geometry?.dispose?.();
        for (const x of [m.material].flat()) (x as THREE.Material | undefined)?.dispose?.();
      });
    }
  };
  let size = "";
  return {
    rebuild: bodies.rebuild,
    /** The bodies the engine made (replaced as a whole). */
    setBodies: bodies.setSolids,
    render(d: Drawing) {
      const now = `${d.w}x${d.h}`;
      if (now !== size) renderer.setSize(d.w, d.h, false); // (setting it again, even to the same, makes a new canvas buffer)
      size = now;
      bodies.update(d, d.w, d.h);
      overlays.update(d, d.w, d.h);
      const c = d.cam,
        f = forward(c);
      // an orthographic view (a straight view at rest) is drawn with the orthographic camera, so that sliding it shows nothing of the third
      // dimension; between it and perspective, the perspective camera with the lens narrowed
      camera = c.ortho !== null ? ortho : persp;
      camera.position.copy(vec(c.eye));
      camera.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(vec(rightOf(c)), vec(upOf(c)), vec(f).negate()),
      );
      if (camera === ortho) {
        const hh = c.ortho! / 2,
          hw = hh * (d.w / d.h),
          R = d.depth * settings.view.farShare;
        ortho.left = -hw;
        ortho.right = hw;
        ortho.top = hh;
        ortho.bottom = -hh;
        ortho.near = -R;
        ortho.far = R; // (there is no distance to cut things off at: what is in front of the eye's plane is as drawn as what is behind it)
      } else {
        persp.fov = (fovOf(c) * 180) / Math.PI;
        persp.aspect = d.w / d.h;
        persp.near = d.depth * settings.view.nearShare;
        persp.far = d.depth * settings.view.farShare;
      }
      camera.updateProjectionMatrix();
      {
        // the lights ride with the camera: the key to the left of it and above (the old app: 0.7 of the distance left, 0.9 up), the fill at the eye, so the shading is the same from any side
        const R = rightOf(c),
          U = upOf(c),
          D = 100;
        key.position.set(
          c.eye[0] - R[0] * 0.7 * D + U[0] * 0.9 * D,
          c.eye[1] - R[1] * 0.7 * D + U[1] * 0.9 * D,
          c.eye[2] - R[2] * 0.7 * D + U[2] * 0.9 * D,
        );
        key.target.position.set(c.eye[0] + f[0] * D, c.eye[1] + f[1] * D, c.eye[2] + f[2] * D);
        fill.position.copy(camera.position);
        fill.target.position.copy(key.target.position);
      }
      gizmo.update(d, c);
      drop();
      if (d.lines) drawLines(dyn, d.lines, d.w, d.h);
      if (d.orb) drawOrb(dyn, d.orb, d.w, d.h);
      renderer.render(scene, camera);
    },
  };
}
