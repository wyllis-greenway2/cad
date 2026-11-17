// A cam drawn on a plane (`dec_spline_and_cams`): the eccentric's disc and the snail's spiral and closing line, and the hole for the shaft, as ordinary drawn parts the person can then change.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import type { Command } from "./commands.ts";
import type { Plane } from "./part.ts";
import { localOf, liftOf, normalOfPlane } from "./part.ts";
import { drawCircle, drawChain, drawSpline, joinedAtCorners } from "./build.ts";
import { loopFaceRef, diskFaceRef } from "./loops.ts";
import type { CamSpec } from "./cams.ts";
import { camShapes } from "./cams.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";

/** The command that draws the cam with its shaft at `at`, turned by `turn` radians in the plane, and what to select after (the cam's face). */
export function drawCam(scene: Scene, pl: Plane, at: Vec3, spec: CamSpec, turn = 0): Result<{ command: Command; select: Ref[] }> {
  const shapes = camShapes(spec);
  if (!shapes.ok) return err(shapes.error);
  const [ox, oy] = localOf(pl, at);
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const place = (q: readonly [number, number]): Vec3 => liftOf(pl, [ox + q[0] * c - q[1] * s, oy + q[0] * s + q[1] * c]);
  const commands: Command[] = [];
  const select: Ref[] = [];
  // each part is made against the scene as it stands with the ones before it in it (their names are not taken again, and the closing line finds the corners of the spiral)
  let cur = scene;
  const take = (cmd: Command): void => {
    commands.push(cmd);
    const into = (sc: Scene, c2: Command): Scene => (c2.type === "batch" ? c2.commands.reduce(into, sc) : c2.type === "addPart" ? { ...sc, parts: { ...sc.parts, [c2.part.ref]: c2.part } } : sc);
    cur = { ...into(cur, cmd), counter: cur.counter + 1 };
  };
  if (shapes.value.spiral) {
    const pts = shapes.value.spiral.map(place);
    const sp = drawSpline(cur, pl.ref, pts, normalOfPlane(pl));
    if (!sp) return err("the cam's spiral could not be drawn");
    take(sp.command);
    const closing = drawChain(cur, pl.ref, [pts[pts.length - 1]!, pts[0]!], false, { reuse: true });
    take(closing.command);
    select.push(loopFaceRef([sp.line, ...closing.lines]));
  }
  for (const circ of shapes.value.circles) {
    const d = drawCircle(cur, pl.ref, place(circ.c), circ.r);
    take(d.command);
    if (!circ.hole) select.push(diskFaceRef(d.circle));
  }
  return ok({ command: joinedAtCorners(scene, pl.ref, { type: "batch", commands }), select });
}
