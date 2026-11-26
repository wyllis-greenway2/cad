// The curved step kinds (E7): revolve, loft, sweep, shell. Their lineage comes from the kernel's report for each operation (spike 6); where it is silent, an exact rule from the step's own inputs names the face.
// Registered into the same table as the others (`kinds`); the engine imports this file for that.
import { type Id, mint } from "./id.ts";
import * as K from "./kernel.ts";
import { type Body, type Claim, type FaceRec, carry, fromClaims } from "./lineage.ts";
import {
  type Sketch,
  type Value,
  checked,
  kinds,
  meta,
  needBody,
  needSketch,
  num,
  profileFace,
  sidesFromProfile,
} from "./steps.ts";
import { dot, scale, sub, unit } from "./vec.ts";

type V3 = K.V3;

const profilePoints = (sk: Sketch): V3[] => {
  if (sk.circle || sk.open || sk.lines.length < 3) throw new Error("this needs a closed shape of three lines or more");
  return sk.lines.map((l) => l.a);
};

/**
 * An edge of the profile that lies across the axis turns into a flat disc or ring, and the kernel reports no face for it. The step's own profile names it: the unnamed flat face
 * across the axis, at the height of exactly one such line and with the radii of its ends (a disc runs from the axis out). Exactly one line fits, or the face stays a defect.
 */
function flatFaces(body: Body, sk: Sketch, point: V3, dir: V3, step: string): Body {
  const axial = (p: V3) => dot(sub(p, point), dir),
    radial = (p: V3) => {
      const d = sub(p, point),
        h = dot(d, dir);
      return Math.hypot(...(sub(d, scale(dir, h)) as unknown as [number, number, number]));
    };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  for (const f of body.faces) {
    if (!f.defect) continue;
    const q = K.facts(f.h);
    if (q.type !== "PLANE" || Math.abs(Math.abs(dot(q.ne, dir)) - 1) > 1e-9) continue;
    const radii = [
      ...new Set(
        K.faceEdges(f.h)
          .flatMap((e) => K.edgeEnds(e))
          .map((p) => radial(p).toPrecision(9)),
      ),
    ]
      .map(Number)
      .sort((a, b) => a - b);
    const inner = radii.length > 1 ? radii[0]! : 0,
      outer = radii[radii.length - 1]!,
      h = axial(q.ce);
    const fits = sk.lines.filter(
      (l) =>
        near(axial(l.a), axial(l.b)) &&
        near(axial(l.a), h) &&
        near(Math.max(radial(l.a), radial(l.b)), outer) &&
        near(Math.min(radial(l.a), radial(l.b)), inner),
    );
    if (fits.length === 1) {
      f.id = mint(step, "side", fits[0]!.id);
      f.defect = false;
    }
  }
  return body;
}

/** a profile turned about an axis (default the Z axis through the origin), through `deg` degrees (default 360) */
kinds["revolve"] = {
  outputs: "body",
  run: (inputs, { step, age }) => {
    const sk = needSketch(inputs[0]),
      ax = (step.params.axis as { point: V3; dir: V3 } | undefined) ?? { point: [0, 0, 0] as V3, dir: [0, 0, 1] as V3 },
      dir = unit(ax.dir),
      deg = typeof step.params.deg === "number" ? step.params.deg : 360;
    profilePoints(sk);
    const face = profileFace(sk),
      p = K.revolve(face, ax.point, dir, deg),
      claims: Claim[] = [];
    sidesFromProfile([sk], face, p.report, step.id, claims);
    if (deg < 360)
      claims.push({ id: mint(step.id, "start"), face: p.first }, { id: mint(step.id, "end"), face: p.last });
    return checked(
      flatFaces(carry(p.solid, p.report, [], claims, step.id, age), sk, ax.point, dir, step.id),
      "the revolve",
    );
  },
};

/** a solid through two or more sketches of the same number of lines; `ruled` makes straight sides, otherwise smooth */
kinds["loft"] = {
  outputs: "body",
  run: (inputs, { step, age }) => {
    const sks = inputs.map(needSketch);
    if (sks.length < 2) throw new Error("a loft needs two sketches at least");
    const sections = sks.map(profilePoints);
    if (sections.some((s) => s.length !== sections[0]!.length))
      throw new Error("the sketches of a loft must have the same number of lines");
    const m = K.loft(sections, step.params.ruled === true),
      claims: Claim[] = [
        { id: mint(step.id, "start"), face: m.first },
        { id: mint(step.id, "end"), face: m.last },
      ];
    sks[0]!.lines.forEach((l, i) => {
      const f = m.side(i);
      if (f) claims.push({ id: mint(step.id, "side", l.id), face: f });
    });
    return checked(carry(m.solid, m.report, [], claims, step.id, age), "the loft");
  },
};

/** a profile swept along a path of straight legs; each profile edge makes a face for each leg, numbered along the path */
kinds["sweep"] = {
  outputs: "body",
  run: (inputs, { step, age }) => {
    const prof = needSketch(inputs[0]),
      path = needSketch(inputs[1]);
    if (!path.open || !path.lines.length) throw new Error("the second sketch must be an open path");
    const spine: V3[] = [path.lines[0]!.a, ...path.lines.map((l) => l.b)],
      face = profileFace(prof),
      p = K.pipe(spine, face);
    // how far along the path a face lies: the length to the nearest point of the path (exact from the step's own path)
    const legs = spine.slice(0, -1).map((a, i) => ({
      a,
      b: spine[i + 1]!,
      from: spine.slice(0, i + 1).reduce((s, q, j) => (j === 0 ? 0 : s + Math.hypot(...sub(q, spine[j - 1]!))), 0),
    }));
    const along = (f: K.FaceH) => {
      const c = K.facts(f).ce;
      let best = Infinity,
        at = 0;
      for (const l of legs) {
        const d = sub(l.b, l.a),
          len = Math.hypot(...d),
          t = Math.max(0, Math.min(1, dot(sub(c, l.a), d) / (len * len))),
          q: V3 = [l.a[0] + d[0] * t, l.a[1] + d[1] * t, l.a[2] + d[2] * t],
          dist = Math.hypot(...sub(c, q));
        if (dist < best - 1e-9) {
          best = dist;
          at = l.from + t * len;
        }
      }
      return at;
    };
    const claims: Claim[] = [
      { id: mint(step.id, "start"), face: p.first },
      { id: mint(step.id, "end"), face: p.last },
    ];
    sidesFromProfile([prof], face, p.report, step.id, claims, along);
    return checked(fromClaims(p.solid, claims, step.id), "the sweep");
  },
};

/** the body hollowed: one face taken off and a wall of thickness `t` left inside; every other face keeps its id and the wall inside it is named from it */
kinds["shell"] = {
  outputs: "body",
  run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]),
      open = body.one(step.params.face as Id),
      t = num(step.params, "t");
    if (!(t > 0)) throw new Error("the wall is not above nothing");
    const m = K.shell(body.solid, open.h, t),
      claims: Claim[] = [];
    for (const f of body.faces as FaceRec[])
      m.report.fromFace(f.h).forEach((face, k) => claims.push({ id: mint(step.id, "inner", f.id, k), face }));
    // an edge that turns the wrong way for the offset is rounded inside: the kernel reports that face from the edge, so it is named by the two faces beside the edge
    for (const e of body.edges())
      if (e.ref)
        m.report
          .fromEdge(e.h)
          .forEach((face, k) => claims.push({ id: mint(step.id, "inner", e.ref!.a, e.ref!.b, k), face }));
    const out = carry(m.solid, m.report, [body], claims, step.id, age);
    // a valid solid is not enough (E14): a wall thicker than the body allows came back valid with no cavity at all
    if (!out.faces.some((f) => f.id.step === step.id && f.id.role === "inner"))
      throw new Error("the shell left no cavity: the wall is too thick for this body");
    return checked(out, "the shell");
  },
};

export type { Value };

meta("revolve", { main: "deg" });
meta("shell", { scope: (p) => p.face ?? null });
