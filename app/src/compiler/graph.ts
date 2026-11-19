// The scene as an operation graph for the kernel (`dec_clean_engine_design` section 7): steps in order, closed loops of lines (or a circle) as the profiles.
// Pure: no kernel, no browser. A step that cannot be built is reported with the reason, and the steps after it that need it are skipped by the kernel.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { normalize, sub } from "../math/vec.ts";
import type { Scene, Step } from "../operation/scene.ts";
import { lookup, figuresOf, figureDepths } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { normalOfPlane, pointOf, loopSteps } from "../operation/part.ts";
import type { KernelGraph, KernelOp } from "./kernel/adapter.ts";
import { decodeEdge, decodeFace } from "./body.ts";
import { loopOf } from "../operation/loops.ts";
import { matchSections } from "./loftmatch.ts";
import { walkPath, pathStart, squareXDir } from "../operation/path.ts";
import { bodyPlaces } from "../operation/pathmaps.ts";
import { PATH_NUMBERS } from "../operation/pathrepeat.ts";
import { NONE, applyPoint, applyDir, inverse, laterMotion } from "../operation/frames.ts";
import type { Rigid } from "../operation/frames.ts";
export { loopOf };

export interface GraphResult { graph: KernelGraph; errors: Record<string, string> }

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
// (the frame is read back through the moves that came after it, which gives the same numbers to about 1e-14 whichever moves they are: rounded, so that the kernel's memory of what it made from it can tell it is the same sketch, `in_252`)
const r9 = (v: number) => Math.round(v * 1e9) / 1e9 + 0;
const frameOf = (pl: Plane, back: Rigid = NONE) => ({ origin: [...applyPoint(back, pl.at)].map(r9), xDir: [...applyDir(back, normalize(pl.u))].map(r9), normal: [...applyDir(back, normalOfPlane(pl))].map(r9) });
const to2d = (pl: Plane, p: Vec3, k = 1): [number, number] => {
  const d = sub(p, pl.at);
  return [r6(k * (d[0] * pl.u[0] + d[1] * pl.u[1] + d[2] * pl.u[2])), r6(k * (d[0] * pl.v[0] + d[1] * pl.v[1] + d[2] * pl.v[2]))];
};

export function buildGraph(scene: Scene): GraphResult {
  const get = lookup(scene);
  const ops: KernelOp[] = [];
  const errors: Record<string, string> = {};
  let prev: string | null = null;
  // consecutive fillets (or chamfers) of one kind: the body before the first of them and all of them so far, so that a fillet that cannot be made on its own (next to ones already made) can be tried together with them
  let chain: { base: string | null; mode: string; mods: { ref: unknown; value: number }[] } | null = null;

  const profile = (st: Step, refs: readonly Ref[] = st.parts, sid = `s_${st.id}`): KernelOp | string => {
    const first = get(refs[0]!);
    if (!first) return "a part of this step is gone";
    const plane = first.plane ? get(first.plane) : undefined;
    if (!plane || plane.kind !== "plane") return "the shape is not on a plane";
    // (the sketch is carried with the body; the extrude reads it back through the moves and turns that came after it, `in_204`; a move of one body of several counts for a sketch drawn on a face of that body, `in_277`)
    // (a gear's sketch is derived from its record, so a move of its body does not carry it: it is not read back through the move, or the bevel's loft stood where the move had taken it and its revolve, whose axis is numbers, where it was, `in_872`)
    const gearMade = !!scene.gears?.some((g) => first.ref.startsWith(`d/${g.id}.`));
    const back = gearMade ? NONE : inverse(laterMotion(scene.steps, scene.steps.indexOf(st), (body) => plane.body === body));
    const id = sid;
    if (first.kind === "circle") {
      const c = pointOf(get, first.center);
      if (!c) return "the circle's centre is gone";
      return { id, type: "sketch", shape: "circle", sides: [first.ref], radius: r6(first.radius * back.k), at: to2d(plane, c, back.k), plane: "XY", origin: 0, frame: frameOf(plane, back) };
    }
    const loop = loopOf(get, refs);
    if (!loop.ok) return loop.error;
    if (loop.corners.some((c) => !pointOf(get, c))) return "a corner of the shape is gone";
    const steps = loopSteps(get, refs, loop.corners); // (a side that is an arc has its middle point: the kernel draws a true arc through the two corners and it)
    return { id, type: "sketch", shape: "polygon", points: steps.map((p) => to2d(plane, p.at, back.k)), sides: steps.map((p) => (p.line ? (p.piece ? `${p.line}~${p.piece}` : p.line) : "")), ...(steps.some((p) => p.mid) ? { mids: steps.map((p) => (p.mid ? to2d(plane, p.mid, back.k) : null)) } : {}), plane: "XY", origin: 0, frame: frameOf(plane, back) };
  };

  for (const st of scene.steps) {
    const xid = `x_${st.id}`;
    switch (st.type) {
      case "extrude": {
        const depths = figureDepths(st);
        const distance = depths[0]!;
        // each figure (the first, then siblings extruded together) is a sketch, and the figures drawn inside it are sketches that are cut out of it
        const made: { profile: string; holes: string[] }[] = [];
        let bad = "";
        figuresOf(st).forEach((fig, n) => {
          if (bad) return;
          const sk = profile(st, fig.outer, n ? `s_${st.id}_f${n}` : `s_${st.id}`);
          if (typeof sk === "string") { bad = sk; return; }
          const holes: string[] = [];
          fig.holes.forEach((h, i) => {
            const hs = profile(st, h, `s_${st.id}_f${n}h${i}`);
            if (typeof hs === "string") bad = hs; else { ops.push(hs); holes.push(hs.id); }
          });
          ops.push(sk);
          made.push({ profile: sk.id, holes });
        });
        if (bad) { errors[st.id] = bad; break; }
        if (!prev && st.params.mode === "cut") { errors[st.id] = "there is nothing to cut from (the body it cut is gone)"; break; }
        const [first, ...more] = made;
        ops.push({ id: xid, type: "extrude", profile: first!.profile, ...(first!.holes.length ? { holes: first!.holes } : {}), ...(more.length ? { also: more.map((m, i) => (depths[i + 1] !== distance ? { ...m, distance: depths[i + 1] } : m)) } : {}), distance, ...(st.params.slantx !== undefined || st.params.slanty !== undefined ? { slant: [Number(st.params.slantx ?? 0), Number(st.params.slanty ?? 0)] } : {}), ...(prev ? { target: prev } : {}), mode: !prev ? "add" : st.params.mode === "add" || st.params.mode === "cut" || st.params.mode === "new" ? String(st.params.mode) : "cutOrAdd" }); // (onto a body: a new piece while it only touches the body or stands apart, a cut as soon as it goes into it: `in_193`; the step says which when it was made, so that a body that grows later does not turn a piece into a cut: `in_295`)
        prev = xid;
        break;
      }
      case "revolve": {
        // a figure (and the figures drawn inside it, which are holes) turned about a line in its own plane, any angle, with an advance along the axis for a spiral; or, the axis being the plane's normal, carried along it while it
        // turns (a twisted extrusion) (`dec_spiral_extrude`, `in_427`, `in_429`); the axis is stored as numbers (a point on it and its direction), as a push / pull stores its face
        const figs = figuresOf(st);
        if (figs.length > 1) { errors[st.id] = "a revolve takes one figure at a time"; break; }
        const sk = profile(st, figs[0]!.outer);
        if (typeof sk === "string") { errors[st.id] = sk; break; }
        const holes: string[] = [];
        let bad = "";
        figs[0]!.holes.forEach((h, i) => { const hs = profile(st, h, `s_${st.id}h${i}`); if (typeof hs === "string") bad = hs; else { ops.push(hs); holes.push(hs.id); } });
        if (bad) { errors[st.id] = bad; break; }
        const p = st.params;
        if (!prev && p.mode === "cut") { errors[st.id] = "there is nothing to cut from (the body it cut is gone)"; break; }
        ops.push(sk);
        ops.push({ id: xid, type: "revolve", profile: sk.id, ...(holes.length ? { holes } : {}), axis: { p: [Number(p.ax), Number(p.ay), Number(p.az)], d: [Number(p.dx), Number(p.dy), Number(p.dz)] }, angle: Number(p.angle ?? 0), advance: Number(p.advance ?? 0), ...(prev ? { target: prev } : {}), mode: !prev ? "add" : p.mode === "add" || p.mode === "cut" || p.mode === "new" ? String(p.mode) : "cutOrAdd" });
        prev = xid;
        break;
      }
      case "loft": {
        // two or more sketches joined side to side (`dec_loft_sketches`): each figure of the step is a section, in the order given; the outlines are matched (split, started and turned as the step says) or refused
        const figs = figuresOf(st);
        if (figs.length < 2) { errors[st.id] = "a loft needs two or more sketches"; break; }
        const sections: { sk: KernelOp; holes: KernelOp[] }[] = [];
        let bad = "";
        figs.forEach((fig, n) => {
          if (bad) return;
          const sk = profile(st, fig.outer, `s_${st.id}_f${n}`);
          if (typeof sk === "string") { bad = sk; return; }
          const holes: KernelOp[] = [];
          fig.holes.forEach((h, i) => { const hs = profile(st, h, `s_${st.id}_f${n}h${i}`); if (typeof hs === "string") bad = hs; else holes.push(hs); });
          sections.push({ sk, holes });
        });
        if (bad) { errors[st.id] = bad; break; }
        if (sections.some((s) => s.holes.length !== sections[0]!.holes.length)) { errors[st.id] = "the sketches have different numbers of holes: each hole must have one in every sketch to join to"; break; }
        const nums = (v: unknown) => String(v ?? "").split(",").map(Number);
        const matched = matchSections(sections.map((s) => s.sk), { shift: nums(st.params.shift), rev: String(st.params.rev ?? "").split(",").map((x) => x === "1"), splitToMatch: !!st.params.split });
        if (!matched.ok) { errors[st.id] = matched.why; break; }
        matched.sketches.forEach((s) => ops.push(s));
        sections.forEach((s) => s.holes.forEach((h) => ops.push(h)));
        ops.push({ id: xid, type: "loft", sections: sections.map((s, i) => ({ profile: matched.sketches[i]!.id, holes: s.holes.map((h) => h.id) })), smooth: st.params.ruled ? false : true, ...(Number(st.params.maxDegree) > 0 ? { maxDegree: Number(st.params.maxDegree) } : {}), ...(typeof st.params.gear === "string" && scene.gears?.some((g) => g.id === st.params.gear && g.spec.wheel) ? { matched: true } : {}), ...(typeof st.params.gear === "string" ? { trusted: true } : {}), ...(prev ? { target: prev } : {}), mode: !prev ? "add" : st.params.mode === "add" || st.params.mode === "cut" || st.params.mode === "new" ? String(st.params.mode) : "cutOrAdd" });
        prev = xid;
        break;
      }
      case "sweep": {
        // a figure (and the figures drawn inside it, holes) carried along a path of lines and arcs (`dec_sweep`): the path is the lines, named, read from the scene here so that it follows an edit of them (`in_445`)
        const figs = figuresOf(st);
        if (figs.length !== 1) { errors[st.id] = "a sweep takes one shape at a time"; break; }
        const sk = profile(st, figs[0]!.outer);
        if (typeof sk === "string") { errors[st.id] = sk; break; }
        const holes: string[] = [];
        let bad = "";
        figs[0]!.holes.forEach((h, i) => { const hs = profile(st, h, `s_${st.id}h${i}`); if (typeof hs === "string") bad = hs; else { ops.push(hs); holes.push(hs.id); } });
        if (bad) { errors[st.id] = bad; break; }
        const lines = String(st.params.path ?? "").split(",").filter(Boolean) as Ref[];
        if (!lines.length) { errors[st.id] = "choose the path to carry the shape along"; break; }
        if (lines.some((r) => !get(r))) { errors[st.id] = "a line of the path is gone"; break; }
        const walked = walkPath(get, lines);
        if (!walked.ok) { errors[st.id] = walked.why; break; }
        const path = walked.sides.map((x) => ({ a: [...x.a], b: [...x.b], ...(x.m ? { m: [...x.m] } : {}) }));
        if (st.params.place === "path") {
          // "along the line" (`dec_sweep_modes`): a copy of the shape, the middle of its box on the start of the path, square to the path there
          const pl = get(get(figs[0]!.outer[0]!)?.plane ?? ("" as Ref));
          if (pl && pl.kind === "plane") {
            const back = inverse(laterMotion(scene.steps, scene.steps.indexOf(st), (body) => pl.body === body));
            const start = pathStart(walked.sides, { at: pl.at, n: normalOfPlane(pl) });
            const fr = { origin: [...start.point].map(r9), xDir: [...squareXDir(start.tangent, applyDir(back, normalize(pl.u)))].map(r9), normal: [...start.tangent].map(r9) };
            type Flat = { points?: number[][]; mids?: (number[] | null)[]; at?: number[]; frame?: unknown };
            const box: number[][] = [];
            const o = sk as unknown as Flat;
            if (o.points) box.push(...o.points, ...((o.mids ?? []).filter(Boolean) as number[][])); else if (o.at) box.push(o.at);
            const ext = (i: number) => [Math.min(...box.map((q) => q[i]!)), Math.max(...box.map((q) => q[i]!))];
            const [ex, ey] = [ext(0), ext(1)];
            const c = [r6((ex[0]! + ex[1]!) / 2), r6((ey[0]! + ey[1]!) / 2)];
            const sh = (q: number[]): number[] => [r6(q[0]! - c[0]!), r6(q[1]! - c[1]!)];
            const move = (op: KernelOp): void => {
              const x = op as unknown as Flat;
              if (x.points) x.points = x.points.map(sh);
              if (x.mids) x.mids = x.mids.map((q) => (q ? sh(q) : q));
              if (x.at) x.at = sh(x.at);
              x.frame = fr;
            };
            move(sk);
            for (const h of ops) if (holes.includes(h.id)) move(h);
          }
        }
        ops.push(sk);
        ops.push({ id: xid, type: "sweep", profile: sk.id, ...(holes.length ? { holes } : {}), path, ...(prev ? { target: prev } : {}), mode: !prev ? "add" : st.params.mode === "add" || st.params.mode === "cut" || st.params.mode === "new" ? String(st.params.mode) : "cutOrAdd" });
        prev = xid;
        break;
      }
      case "hollow": {
        // the body made hollow (`in_391`, `in_393`): `faces` named by where they were; `mode` "open" leaves those open, "keep" keeps them as walls and opens every other, "closed" leaves no face open; the wall is `thickness`, inward when positive, outward when negative
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const p = st.params;
        const refs = String(p.faces ?? "").split(";").filter(Boolean).map((f) => { const [nx, ny, nz, fd, px, py, pz] = f.split(",").map(Number); return { n: [nx, ny, nz], d: fd, point: [px, py, pz] }; });
        const mode = String(p.mode ?? "open");
        if (mode === "closed") ops.push({ id: xid, type: "shell", target: prev, thickness: Number(p.thickness ?? 0), closed: true });
        else if (!refs.length) { errors[st.id] = "choose the faces"; break; }
        else ops.push({ id: xid, type: "shell", target: prev, thickness: Number(p.thickness ?? 0), ...(mode === "keep" ? { keep: refs } : { refs }) });
        prev = xid;
        break;
      }
      case "pushPull": {
        // push or pull a flat face of the body along its normal: out adds material, in cuts it (the same helper arrow as an extrude)
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const p = st.params;
        if (p.cax !== undefined) {
          // a round face: its radius changes by the distance (the kernel knows whether it is a post or a hole)
          ops.push({ id: xid, type: "cylRadius", target: prev, ref: { axis: Number(p.cax), center: [Number(p.ccx), Number(p.ccy), Number(p.ccz)], radius: Number(p.cr), lo: Number(p.clo), hi: Number(p.chi), ...(p.cconvex !== undefined ? { convex: Number(p.cconvex) === 1 } : {}) }, delta: Number(p.depth ?? 0) });
          prev = xid;
          break;
        }
        if (p.nx !== undefined && p.px !== undefined) {
          // the face as it was when the step was made (later steps move the body's named faces, this one still means its own)
          ops.push({ id: xid, type: p.extend ? "faceExtend" : "faceExtrude", target: prev, ref: { n: [Number(p.nx), Number(p.ny), Number(p.nz)], d: Number(p.fd), point: [Number(p.px), Number(p.py), Number(p.pz)], ...(p.fname ? { name: String(p.fname) } : {}) }, distance: Number(p.depth ?? 0) });
          prev = xid;
          break;
        }
        const face = get(st.parts[0]!);
        const ref = face?.kind === "plane" ? decodeFace(face.ref) : null;
        if (!face || face.kind !== "plane" || !ref || !face.mesh || face.mesh.length < 9) { errors[st.id] = "the face is gone"; break; }
        const m = face.mesh;
        const point: Vec3 = [(m[0]! + m[3]! + m[6]!) / 3, (m[1]! + m[4]! + m[7]!) / 3, (m[2]! + m[5]! + m[8]!) / 3]; // a point on the face itself: the kernel finds it by plane and by this point
        ops.push({ id: xid, type: p.extend ? "faceExtend" : "faceExtrude", target: prev, ref: { n: ref.n, d: ref.d, point }, distance: Number(p.depth ?? 0) });
        prev = xid;
        break;
      }
      case "edgeMod": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const ranks = String(st.params.ranks ?? "").split(",");
        const sigs = String(st.params.sigs ?? "").split("|");
        const enames = String(st.params.enames ?? "").split(";"); // (the lasting names of the edges, `dec_stable_reference_mechanism`)
        const refs = st.parts.map((r, i) => { const e = decodeEdge(r); return e ? { ...e, ...(ranks[i] && ranks[i] !== "-" ? { rank: ranks[i] } : {}), ...(sigs[i] ? { sig: sigs[i] } : {}), ...(enames[i] ? { name: enames[i] } : {}) } : e; });
        if (refs.some((r) => !r)) { errors[st.id] = "select lines of the body"; break; }
        const mode = String(st.params.mode ?? "fillet");
        const value = Number(st.params.value ?? 0);
        const last = ops[ops.length - 1];
        const end = st.params.end !== undefined ? Number(st.params.end) : undefined; // (a fillet whose size changes along the edge: its own, never rounded together with others)
        const two = st.params.d2 !== undefined && st.params.face !== undefined ? String(st.params.face).split(",").map(Number) : null; // (a chamfer with a distance along each face: its own step, `dec_chamfer_two_distances`)
        const continues: boolean = !two && !!chain && last?.type === "edgeMod" && last.id === prev && chain.mode === mode && end === undefined && !(last as { end?: number }).end;
        const here = { ref: refs, value };
        chain = continues ? { ...chain!, mods: [...chain!.mods, here] } : { base: prev, mode, mods: [here] };
        ops.push({ id: xid, type: "edgeMod", target: prev, ref: refs, mode, value, ...(two && two.length === 7 ? { dist2: Number(st.params.d2), face: { n: [two[0]!, two[1]!, two[2]!], d: two[3]!, point: [two[4]!, two[5]!, two[6]!] } } : {}), ...(end !== undefined ? { stations: stationsOf(value, end, st.params) } : {}), ...(st.params.corner ? { corner: true } : {}), ...(chain.mods.length > 1 ? { together: { base: chain.base, mods: chain.mods } } : {}) });
        prev = xid;
        break;
      }
      case "pattern": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const p = st.params;
        const one = p.body ? { body: String(p.body) } : {}; // (one body of several is repeated, `in_271`)
        const turned = p.f0x !== undefined ? { frame: [[p.f0x, p.f0y, p.f0z], [p.f1x, p.f1y, p.f1z], [p.f2x, p.f2y, p.f2z]].map((r) => r.map(Number)) } : {}; // (the mover was turned: the copies run along its axes, `in_440`)
        if (p.mode === "path") { // a body repeated along a path (`dec_path_repeat`, step (c)): the places are worked out here from the path's lines, and the kernel is given them
          const found = bodyPlaces(scene, { path: String(p.path ?? "").split(",").filter(Boolean) as Ref[], params: Array.from({ length: PATH_NUMBERS }, (_, i) => Number(p[`pr${i}`] ?? 0)) });
          if (!found.ok) { errors[st.id] = found.error; break; }
          if (found.value.places.length > 200) { errors[st.id] = "that is more than 200 copies"; break; }
          ops.push({ id: xid, type: "pattern", target: prev, mode: "placed", places: found.value.places.map((q) => ({ move: q.move.map(r9), ...(q.turn ? { turn: { angle: r9(q.turn.angle), pivot: [...q.turn.pivot].map(r9), dir: [...q.turn.dir].map(r9) } } : {}) })), ...one });
          prev = xid;
          break;
        }
        ops.push(p.mode === "mirror"
          ? { id: xid, type: "pattern", target: prev, mode: "mirror", point: [Number(p.px), Number(p.py), Number(p.pz)], normal: [Number(p.nx), Number(p.ny), Number(p.nz)], ...one }
          : p.mode === "circular"
          ? { id: xid, type: "pattern", target: prev, mode: "circular", count: Number(p.count), angle: Number(p.angle), axis: Number(p.axis), pivot: [Number(p.px), Number(p.py), Number(p.pz)], ...turned, ...one }
          : { id: xid, type: "pattern", target: prev, mode: "linear", nx: Number(p.nx), ny: Number(p.ny), nz: Number(p.nz), dx: Number(p.dx), dy: Number(p.dy), dz: Number(p.dz), ...turned, ...one });
        prev = xid;
        break;
      }
      case "move": case "rotate": case "scale": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const pivot = st.params.px !== undefined ? [Number(st.params.px), Number(st.params.py), Number(st.params.pz)] : undefined; // rotate about this point (default: the middle of the body)
        ops.push({ id: xid, type: "transform", target: prev, mode: st.type, axis: Number(st.params.axis ?? 0), value: Number(st.params.value ?? 0), ...(st.type === "rotate" && st.params.dx !== undefined ? { dir: [Number(st.params.dx), Number(st.params.dy), Number(st.params.dz)] } : {}), ...(st.type === "move" && st.params.vx !== undefined ? { vec: [Number(st.params.vx), Number(st.params.vy), Number(st.params.vz)] } : {}), ...(pivot ? { pivot } : {}), ...(st.params.body ? { body: String(st.params.body) } : {}) });
        prev = xid;
        break;
      }
      case "reshape": {
        // some corners of one body moved (`dec_direct_shape_editing`): `moves` is "fx,fy,fz>tx,ty,tz;..." (where each corner was, where it went)
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const moves = String(st.params.moves ?? "").split(";").filter(Boolean).map((m) => { const [a, b] = m.split(">").map((q) => q.split(",").map(Number)); return { from: a!, to: b! }; });
        if (!moves.length || moves.some((m) => m.from.length !== 3 || m.to.length !== 3 || [...m.from, ...m.to].some((x) => !Number.isFinite(x)))) { errors[st.id] = "bad corners"; break; }
        ops.push({ id: xid, type: "reshape", target: prev, moves, ...(st.params.body ? { body: String(st.params.body) } : {}) });
        prev = xid;
        break;
      }
      case "combine": {
        // add or subtract bodies (`in_270`): the first body named stays; the bodies are named by the step that made each (`b/<name>/o`)
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        const names = st.parts.map((r) => (r.startsWith("b/") ? r.split("/")[1]! : ""));
        if (names.length < 2 || names.some((n) => !n || n === "body")) { errors[st.id] = "select two or more bodies"; break; }
        ops.push({ id: xid, type: "combine", target: prev, mode: String(st.params.mode ?? "add"), bodies: names, ...(Number(st.params.keep) === 1 ? { keep: 1 } : {}), ...(Number(st.params.glue) === 1 ? { glue: 1 } : {}), ...(st.params.drop ? { drop: String(st.params.drop).split(",").filter(Boolean) } : {}), ...(st.params.mode === "regions" ? { regions: String(st.params.regions ?? "").split(",").filter((x) => x !== "").map(Number), join: Number(st.params.join) === 1 } : {}) });
        prev = xid;
        break;
      }
      case "sewBodies": {
        // bodies that meet along flat faces joined into one (`in_869`): the faces they share (flat, across the axis, at the heights said) left out and the rest sewn into one solid: no boolean (a gear's worm wheel and its lands: 11 s by a fuse)
        const names = st.parts.map((r) => (r.startsWith("b/") ? r.split("/")[1]! : ""));
        if (!prev || names.length < 2 || names.some((n) => !n || n === "body")) { errors[st.id] = "select two or more bodies"; break; }
        const p = st.params;
        ops.push({ id: xid, type: "sewBodies", target: prev, bodies: names, origin: [Number(p.cx), Number(p.cy), Number(p.cz)], axis: [Number(p.dx), Number(p.dy), Number(p.dz)], heights: String(p.heights).split(",").map(Number) });
        prev = xid;
        break;
      }
      case "chamferBody": {
        // a gear body with its whole perimeter chamfered (`in_866`): a ruled loft through the outline inset at each face and the full outline a chamfer in, made by the kernel from the two outlines in the step (numbers: x, y and the bulge of each side, `;` between sides), a piece of its own
        const p = st.params;
        ops.push({ id: xid, type: "chamferBody", full: String(p.full), inset: String(p.inset), edge: Number(p.edge), width: Number(p.width), bore: Number(p.bore ?? 0), wall: Number(p.wall ?? 0), origin: [Number(p.cx), Number(p.cy), Number(p.cz)], axis: [Number(p.dx), Number(p.dy), Number(p.dz)], first: [Number(p.ux), Number(p.uy), Number(p.uz)], ...(p.one !== undefined ? { one: Number(p.one) } : {}), ...(prev ? { target: prev, mode: "new" } : {}) });
        prev = xid;
        break;
      }
      case "chamferEnds": {
        // the edges of the two end faces of a gear's body chamfered by the kernel (`in_924`): for a gear with a flat outline and teeth that are straight (a rack, a worm wheel); with `tipDir` only the edges along the tips of the teeth
        const body = (st.parts[0] ?? "").startsWith("b/") ? st.parts[0]!.split("/")[1] : "";
        if (!prev || !body || body === "body") { errors[st.id] = "there is no body to chamfer"; break; }
        const p = st.params;
        ops.push({ id: xid, type: "chamferEnds", target: prev, body, size: Number(p.size), width: Number(p.width), centre: [Number(p.cx), Number(p.cy), Number(p.cz)], axis: [Number(p.dx), Number(p.dy), Number(p.dz)], ...(p.tipDir !== undefined ? { tipDir: [Number(p.tx), Number(p.ty), Number(p.tz)], tip: Number(p.tip) } : {}) });
        prev = xid;
        break;
      }
      case "toothChamfer": {
        // the tips of a gear's teeth broken at its two faces (`in_760`, `in_859`): one flat wedge cut from each tooth at each face, made and cut by the kernel in one step; the body is named by the step that made it
        const body = (st.parts[0] ?? "").startsWith("b/") ? st.parts[0]!.split("/")[1] : "";
        if (!prev || !body || body === "body") { errors[st.id] = "there is no body to chamfer"; break; }
        const p = st.params;
        ops.push({ id: xid, type: "toothChamfer", target: prev, body, teeth: Number(p.teeth), tip: Number(p.tip), depth: Number(p.depth), width: Number(p.width), side: Number(p.side), twist: Number(p.twist ?? 0), centre: [Number(p.cx), Number(p.cy), Number(p.cz)], axis: [Number(p.dx), Number(p.dy), Number(p.dz)], first: [Number(p.ux), Number(p.uy), Number(p.uz)] });
        prev = xid;
        break;
      }
      case "import": {
        // a body (or several) read from a STEP file: it has no history of its own, only the file's text, kept in the step (`dec_import`); beside the bodies already there, as a piece of its own
        const data = String(st.params.data ?? "");
        if (!data) { errors[st.id] = "the file this step imported is gone"; break; }
        ops.push({ id: xid, type: "import", data, ...(st.params.format ? { format: String(st.params.format) } : {}), name: String(st.params.name ?? ""), ...(st.params.scale !== undefined ? { scale: Number(st.params.scale) } : {}), ...(st.params.place ? { place: String(st.params.place) } : {}), ...(prev ? { target: prev, mode: "new" } : {}) });
        prev = xid;
        break;
      }
      case "importMesh": {
        // closed triangle meshes (STL, 3MF), each a body made of faces that are its triangles (`dec_import_mesh`); the cleaned mesh is kept in the step as text
        const data = String(st.params.data ?? "");
        if (!data) { errors[st.id] = "the file this step imported is gone"; break; }
        ops.push({ id: xid, type: "importMesh", data, name: String(st.params.name ?? ""), ...(prev ? { target: prev, mode: "new" } : {}) });
        prev = xid;
        break;
      }
      case "delete": {
        if (!prev) { errors[st.id] = "there is no body yet"; break; }
        ops.push({ id: xid, type: "clear" });
        prev = null;
        break;
      }
    }
  }
  return { graph: { params: {}, ops, names: true }, errors };
}

/** The sizes along the edge of a fillet or chamfer that changes along it (`in_406`, `in_410`): [place from 0 at the start to 1 at the other end, size] at the start, at a quarter, the middle and three quarters when they are given, and at the end. */
function stationsOf(value: number, end: number, p: Record<string, string | number>): [number, number][] {
  const at = (key: string, t: number): [number, number][] => (p[key] !== undefined && Number(p[key]) > 0 ? [[t, Number(p[key])]] : []);
  return [[0, value], ...at("q1", 0.25), ...at("mid", 0.5), ...at("q3", 0.75), [1, end]];
}
