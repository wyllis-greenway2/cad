// The same steps on both kernels. Each `run` returns a new value or throws (the engine flags the step and passes its input through).
import * as M from "../mesh-fillet/mf.mjs";
import * as K from "../lineage-occt/lib.mjs";
import { makeBox, makeCylinder } from "replicad";
const { Manifold } = M;
M.curved.add(9000);
const { oc } = K;

export const meshKernel = {
  name: "mesh (Manifold)",
  free: (v) => v?.delete?.(),
  hash: (v) => `${v.volume().toFixed(4)}|${v.numTri()}`,
  run(kind, p, ins) {
    if (kind === "box") return M.box(p.w, p.h, p.d).translate([p.x, 0, 0]);
    const b = ins[0];
    if (kind === "hole") { const c = M.tag(Manifold.cylinder(p.d + 2, p.r, p.r, 24).translate([p.x, p.y, -1]), (nn) => (Math.abs(nn[2]) > 0.99 ? 401 : 400)); const out = b.subtract(c); c.delete(); return out; }
    if (kind === "boss") { const c = M.tag(Manifold.cube([p.w, p.h, p.t]).translate([p.x, p.y, p.d]), M.byAxis(500)); const out = b.add(c); c.delete(); return out; }
    if (kind === "fillet") {
      const F = M.faces(b), n = [[1, 0], [-1, 0], [0, 1], [0, -1]][p.which], ax = n[0] ? 0 : 1, sg = n[0] || n[1];
      const top = F.list.filter((f) => f.n[2] > 0.99 && Math.abs(f.c[2] - p.d) < 1e-3).sort((q, w) => w.area - q.area)[0];
      const wall = F.list.filter((f) => f.n[ax] * sg > 0.99).sort((q, w) => w.area - q.area)[0];
      if (!top || !wall) throw new Error("no faces");
      const r = M.fillet(b, top.id, wall.id, p.r); return M.clean(r.man).man;
    }
    if (kind === "join") return ins[0].add(ins[1]);
    throw new Error("kind " + kind);
  },
};

const raw = (s) => s.wrapped;
const pr = () => new oc.Message_ProgressRange();
const valid = (s) => new oc.BRepCheck_Analyzer(s, true, false).IsValid();
const volume = (s) => { const q = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, q, false, false, false); return q.Mass(); };
const bool = (kind, a, b) => { const op = new oc[kind === "cut" ? "BRepAlgoAPI_Cut" : "BRepAlgoAPI_Fuse"](a, b, pr()); if (!op.IsDone()) throw new Error(kind + " failed"); const s = op.Shape(); if (!valid(s)) throw new Error("invalid solid"); return s; };
export const occtKernel = {
  name: "OCCT (B-rep)",
  free: (v) => v?.delete?.(),
  hash: (v) => `${volume(v).toFixed(4)}|${K.facesOf(v).length}`,
  run(kind, p, ins) {
    if (kind === "box") return raw(makeBox([p.x, 0, 0], [p.x + p.w, p.h, p.d]));
    const b = ins[0];
    if (kind === "hole") return bool("cut", b, raw(makeCylinder(p.r, p.d + 2, [p.x, p.y, -1], [0, 0, 1])));
    if (kind === "boss") return bool("fuse", b, raw(makeBox([p.x, p.y, p.d], [p.x + p.w, p.y + p.h, p.d + p.t])));
    if (kind === "fillet") {
      const want = [[p.x + p.w, p.h / 2], [p.x, p.h / 2], [p.x + p.w / 2, p.h], [p.x + p.w / 2, 0]][p.which];
      const pick = K.edgesOf(b).filter((e) => { const m = K.edgeMid(e); return Math.abs(m[2] - p.d) < 1e-3 && Math.abs(m[0] - want[0]) < 1e-3 && Math.abs(m[1] - want[1]) < 1e-3; });
      if (!pick.length) throw new Error("no edge");
      const mk = new oc.BRepFilletAPI_MakeFillet(b, oc.ChFi3d_FilletShape.ChFi3d_Rational);
      mk.Add(p.r, K.downcast(pick[0])); mk.Build(pr());
      if (!mk.IsDone()) throw new Error("fillet failed");
      const s = mk.Shape(); if (!valid(s)) throw new Error("invalid solid"); return s;
    }
    if (kind === "join") return bool("fuse", ins[0], ins[1]);
    throw new Error("kind " + kind);
  },
};
