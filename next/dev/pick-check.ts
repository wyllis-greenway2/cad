// A dev check (not a test, `in_1444`) of picking faces and edges on the engine's mesh, with the kernel: node --experimental-strip-types dev/pick-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { meshOf } from "../src/engine/exchange.ts";
import { meshBuffers } from "../src/studio.ts";
import { pickAt, visibleFrom } from "../src/interaction/pick.ts";
import { project, frameBox } from "../src/camera.ts";
import { check, failureCount } from "./lib.ts";
await initKernel();
const e = new Engine([
  {
    id: "s1",
    kind: "sketchPolygon",
    params: {
      points: [
        [0, 0],
        [40, 0],
        [40, 25],
        [0, 25],
      ],
    },
    inputs: [],
  },
  { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] },
] as any);
e.build();
const mesh = meshBuffers("e1", JSON.parse(JSON.stringify(meshOf(e.result("e1").value as any)))),
  W = 800,
  H = 600;
const cam = { ...frameBox([0, 0, 0], [40, 25, 10], W / H), ortho: null as number | null };
const at = (p: [number, number, number]) => {
  const q = project(cam as any, p, W, H);
  return [q.x, q.y] as const;
};
check(
  "the mesh carries its faces and its named edges",
  mesh.faces.length === 6 && mesh.edgeInfo.length === 12,
  `${mesh.faces.length} faces, ${mesh.edgeInfo.length} edges`,
);
const top = pickAt([mesh], cam as any, W, H, ...at([20, 12, 10]));
check(
  "a point over the top face picks that face, normal up",
  top?.kind === "face" && top.normal[2] > 0.99 && Math.abs(top.point[2] - 10) < 1e-6,
  JSON.stringify(top && top.kind === "face" ? [top.face.id.slice(0, 40), top.normal] : top),
);
const edge = pickAt([mesh], cam as any, W, H, ...at([20, 25, 10]));
check("a point on the top back edge picks that edge", edge?.kind === "edge", JSON.stringify(edge?.kind));
const near = at([20, 25, 10]),
  nearby = pickAt([mesh], cam as any, W, H, near[0] + 4, near[1] - 2);
check("a few pixels off the edge still picks the edge", nearby?.kind === "edge");
const away = pickAt([mesh], cam as any, W, H, ...at([20, 12, 10]));
check("well inside a face picks the face, not an edge", away?.kind === "face");
check("a point off the body picks nothing", pickAt([mesh], cam as any, W, H, 5, 5) === null);
// the bottom edge on the far side (y = 0, z = 0) is behind the body from this view: not picked through it
const hidden = at([20, 0, 0]),
  hp = pickAt([mesh], cam as any, W, H, ...hidden);
check("an edge hidden behind the body is not picked through it", !hp || hp.kind === "face", JSON.stringify(hp?.kind));
const front = at([20, 25, 0]),
  fp = pickAt([mesh], cam as any, W, H, ...front);
check("the bottom edge of the face towards the eye is picked", fp?.kind === "edge");
// what is under a body is not seen, in a straight view too (where the ray begins far back: a share of that distance once hid a body 100 mm in front, `in_1746`)
{
  const down = {
    ...cam,
    ortho: 80,
    eye: [20, 12, 300] as [number, number, number],
    pitch: -Math.PI / 2,
    yaw: -Math.PI / 2,
  };
  check(
    "a place under the body is not seen from above in a straight view",
    !visibleFrom([mesh], down as any, [20, 12, 0]),
  );
  check("a place on top of the body is seen", visibleFrom([mesh], down as any, [20, 12, 10]));
  check("a place beside the body is seen", visibleFrom([mesh], down as any, [80, 12, 0]));
}
process.exit(failureCount() ? 1 : 0);
