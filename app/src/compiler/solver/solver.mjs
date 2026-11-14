// A small 2D geometric constraint solver (dec_constraint_solver_small). Pure math: no DOM, no three.js, no kernel (inv_math_pure).
//
// System: { points: { id: [x, y] }, scalars: { id: value } }  (scalars are things like circle radii)
// Constraints: [{ id, type, ...refs }], with optional `w` (weight, default 1; small weights make a soft preference, used for dragging).
//   fixed {p, at}            point at a place            coincident {a, b}        two points the same
//   horizontal {a, b}        same y                      vertical {a, b}          same x
//   distance {a, b, d}       |ab| = d                    hdist / vdist {a, b, d}  (b - a) along x / y = d (signed)
//   equalLength {a, b, c, d} |ab| = |cd|                 parallel {a, b, c, d}    ab || cd      perpendicular {a, b, c, d}  ab _|_ cd
//   radius {r, value}        scalar r = value            equalRadius {r, s}       r = s
//   angle {a, b, c, d, value} the angle from ab to cd (signed, radians) equals value
//   ptLineDist {p, a, b, d, side}  a corner is d from the line ab    lineGap {a, b, c, d, dist, side}  the line cd is dist from the line ab
//   tangentCircles {a, b, r | ea, s | eb, mode}  two circles or arcs about the points a and b touch (mode 1: side by side, -1: one inside the other); a circle's radius is the value r (s), an arc's the distance from its centre to its start ea (eb)
//   parallelDir / perpDir {a, b, dir}  the line ab is parallel / perpendicular to a fixed direction dir = [dx, dy] (a line of the body, seen on the sketch plane)
// The solver moves everything the least it can to satisfy the constraints (Levenberg-Marquardt from the current positions).
// Result: { status: "ok" | "conflict", points, scalars, dof, redundant: [ids], conflicts: [ids], residual, iterations }
//   dof = how many independent directions are still free (0 = fully constrained; a whole sketch that can slide counts too).

const TOL = 1e-9; // converged when every residual is below this
const FD = 1e-6; // finite-difference step
const CONFLICT_SEARCH_MS = 400; // how long to spend looking for which constraint breaks the others

function layout(system) {
  const index = new Map();
  let n = 0;
  const x = [];
  index.P = new Map(); // (the same places by the bare name, so working out a constraint does not build a key each time it looks a point up)
  index.S = new Map();
  for (const id of Object.keys(system.points).sort()) (index.set(`p:${id}`, n), index.P.set(id, n), x.push(...system.points[id]), (n += 2));
  for (const id of Object.keys(system.scalars ?? {}).sort()) (index.set(`s:${id}`, n), index.S.set(id, n), x.push(system.scalars[id]), (n += 1));
  return { index, x, n };
}

/** The residuals (what must be zero) of one constraint at the variables x. */
function residualsOf(c, x, index) {
  const P = (id) => {
    const i = index.P.get(id);
    if (i === undefined) throw new Error(`unknown point ${id}`);
    return [x[i], x[i + 1]];
  };
  const S = (id) => {
    const i = index.S.get(id);
    if (i === undefined) throw new Error(`unknown value ${id}`);
    return x[i];
  };
  const w = c.w ?? 1;
  const dir = (a, b) => {
    const A = P(a);
    const B = P(b);
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    return [dx, dy, Math.hypot(dx, dy) + 1e-12];
  };
  switch (c.type) {
    case "fixed": {
      const p = P(c.p);
      return [(p[0] - c.at[0]) * w, (p[1] - c.at[1]) * w];
    }
    case "coincident": {
      const a = P(c.a);
      const b = P(c.b);
      return [(a[0] - b[0]) * w, (a[1] - b[1]) * w];
    }
    case "horizontal": return [(P(c.a)[1] - P(c.b)[1]) * w];
    case "vertical": return [(P(c.a)[0] - P(c.b)[0]) * w];
    case "distance": return [(dir(c.a, c.b)[2] - c.d) * w];
    case "hdist": return [(P(c.b)[0] - P(c.a)[0] - c.d) * w];
    case "vdist": return [(P(c.b)[1] - P(c.a)[1] - c.d) * w];
    case "equalLength": return [(dir(c.a, c.b)[2] - dir(c.c, c.d)[2]) * w];
    case "parallel": {
      const u = dir(c.a, c.b);
      const v = dir(c.c, c.d);
      return [((u[0] * v[1] - u[1] * v[0]) / (u[2] * v[2])) * w];
    }
    case "perpendicular": {
      const u = dir(c.a, c.b);
      const v = dir(c.c, c.d);
      return [((u[0] * v[0] + u[1] * v[1]) / (u[2] * v[2])) * w];
    }
    case "ptLineDist": {
      // a corner's signed distance from the line ab equals d (side: +1 or -1, the side it was on when the relation was made, so it does not flip over)
      const p = P(c.p);
      const a = P(c.a);
      const b = P(c.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-12;
      return [(c.side * (((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len) - c.d) * w];
    }
    case "lineGap": {
      // the gap between two parallel lines ab and cd: c and d are each dist from the line ab (which also keeps the lines parallel)
      const a = P(c.a);
      const b = P(c.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-12;
      const sd = (q) => ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / len;
      return [(c.side * sd(P(c.c)) - c.dist) * w, (c.side * sd(P(c.d)) - c.dist) * w]; // both ends of the second line are that far: so the lines are parallel too
    }
    case "parallelDir": {
      const u = dir(c.a, c.b); // the line ab is parallel to the fixed direction c.dir = [dx, dy] (unit)
      return [((u[0] * c.dir[1] - u[1] * c.dir[0]) / u[2]) * w];
    }
    case "perpDir": {
      const u = dir(c.a, c.b);
      return [((u[0] * c.dir[0] + u[1] * c.dir[1]) / u[2]) * w];
    }
    case "angle": {
      const u = dir(c.a, c.b);
      const v = dir(c.c, c.d);
      let diff = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) - c.value;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap into (-pi, pi]
      return [diff * w];
    }
    case "ptOnLine": {
      // a corner lies on the (infinite) line through a and b: it slides along it
      const p = P(c.p);
      const a = P(c.a);
      const b = P(c.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-12;
      return [(((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len) * w];
    }
    case "tangentCircle": case "tangentArc": {
      // the line ab touches the circle (or arc) about the corner c: its distance from c is the radius (a circle's value, or an arc's distance from c to its end p)
      const q = P(c.c);
      const a = P(c.a);
      const b = P(c.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-12;
      const d = ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / len;
      return [(Math.abs(d) - (c.type === "tangentCircle" ? S(c.r) : dir(c.c, c.p)[2])) * w];
    }
    case "tangentCircles": {
      // two circles or arcs touch: the distance between their centres is the sum of the radii (outside each other: mode 1) or their difference (one inside the other: mode -1)
      const q = P(c.a);
      const o = P(c.b);
      const d = Math.hypot(o[0] - q[0], o[1] - q[1]);
      const [r1, r2] = [c.r !== undefined ? S(c.r) : dir(c.a, c.ea)[2], c.s !== undefined ? S(c.s) : dir(c.b, c.eb)[2]];
      return [(d - (c.mode > 0 ? r1 + r2 : Math.abs(r1 - r2))) * w];
    }
    case "ptOnCircle": {
      // a corner lies on a circle (the radius is the circle's value) or on an arc (the distance from its centre c to its start e): it slides round it
      const q = P(c.c);
      const p = P(c.p);
      return [(Math.hypot(p[0] - q[0], p[1] - q[1]) - (c.r !== undefined ? S(c.r) : dir(c.c, c.e)[2])) * w];
    }
    case "radius": return [(S(c.r) - c.value) * w];
    case "equalRadius": return [(S(c.r) - S(c.s)) * w];
    default: throw new Error(`unknown constraint ${c.type}`);
  }
}

const residuals = (cons, x, index) => cons.flatMap((c) => residualsOf(c, x, index));
const maxAbs = (v) => v.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
const cost = (f) => f.reduce((s, a) => s + a * a, 0) / 2;

/** The variables (columns of x) a constraint is made of: its points and numbers, as named in its fields. */
function columnsOf(c, index) {
  const cols = new Set();
  for (const [k, v] of Object.entries(c)) {
    if (k === "id" || k === "type" || typeof v !== "string") continue;
    const p = index.P.get(v);
    if (p !== undefined) { cols.add(p); cols.add(p + 1); continue; }
    const q = index.S.get(v);
    if (q !== undefined) cols.add(q);
  }
  return [...cols].sort((a, b) => a - b);
}

/**
 * The Jacobian by central differences, kept sparse: a constraint is made of a few points, so each of its residuals depends on a handful of the variables and the rest of its row is zero. Each variable of
 * a constraint is moved by the same step as before and only that constraint is worked out again (`in_248`: moving all of the variables and working out every constraint each time took seconds on a
 * sketch of a hundred constraints). Rows are { cols, vals }, in the order of the residuals; the numbers are the ones the dense version gave (what is left out is exactly zero there).
 */
function jacobianRows(cons, x, index, colLists) {
  const rows = [];
  for (let ci = 0; ci < cons.length; ci++) {
    const c = cons[ci];
    const cols = colLists ? colLists[ci] : columnsOf(c, index);
    const m = residualsOf(c, x, index).length;
    const vals = Array.from({ length: m }, () => new Array(cols.length).fill(0));
    cols.forEach((j, k) => {
      const h = FD * Math.max(1, Math.abs(x[j]));
      const was = x[j];
      x[j] = was + h;
      const fp = residualsOf(c, x, index);
      x[j] = was - h;
      const fm = residualsOf(c, x, index);
      x[j] = was;
      for (let i = 0; i < m; i++) vals[i][k] = (fp[i] - fm[i]) / (2 * h);
    });
    for (let i = 0; i < m; i++) rows.push({ cols, vals: vals[i], ci });
  }
  return rows;
}

/** The Jacobian as full rows (for `analyse`, which eliminates over them). */
function jacobian(cons, x, index) {
  return jacobianRows(cons, x, index).map(({ cols, vals }) => {
    const row = new Array(x.length).fill(0);
    cols.forEach((j, k) => { row[j] = vals[k]; });
    return row;
  });
}

/**
 * The shape of the normal equations (J^T J, plus damping), worked out once per solve: which variables are tied to which by a constraint (a constraint ties the few it is made of), an order of
 * elimination that keeps new non-zeros few (always the variable with the fewest ties next), and where every number lives, so each step is plain arithmetic on a short list (`in_248`: the matrix of a
 * sketch of a hundred constraints is nearly empty, and the dense elimination spent its time on zeros). Entries are in one array: the n diagonal ones by rank, then the ones above it.
 */
function structureOf(n, colLists) {
  const adj = Array.from({ length: n }, () => new Set());
  for (const cols of colLists) for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) (adj[cols[a]].add(cols[b]), adj[cols[b]].add(cols[a]));
  const done = new Array(n).fill(false);
  const order = [];
  const ties = [];
  for (let step = 0; step < n; step++) {
    let v = -1;
    let best = Infinity;
    for (let u = 0; u < n; u++) if (!done[u] && adj[u].size < best) (best = adj[u].size, (v = u));
    done[v] = true;
    order.push(v);
    const nb = [...adj[v]];
    ties.push(nb);
    for (const a of nb) {
      adj[a].delete(v);
      for (const b of nb) if (a !== b) adj[a].add(b);
    }
  }
  const pos = new Array(n);
  order.forEach((v, k) => (pos[v] = k));
  const L = ties.map((nb) => nb.map((u) => pos[u]).sort((a, b) => a - b));
  const at = new Map(); // (row, column) with row < column -> place in the array
  let size = n;
  L.forEach((cols, k) => cols.forEach((a) => at.set(k * n + a, size++)));
  const lists = L.map((cols, k) => ({
    cols: Int32Array.from(cols),
    where: Int32Array.from(cols.map((a) => at.get(k * n + a))),
    // where the update of the pair (a, b) of this pivot's ties goes
    to: Int32Array.from(cols.flatMap((a, ia) => cols.slice(ia + 1).map((b) => at.get(a * n + b)))),
  }));
  return { n, order, pos, at, size, lists };
}

/** Where the products of one constraint's slopes go in the entries of the matrix: for its variables a, b (a before b) the place of their pair, the diagonal's place when they are the same. */
function placesOf(st, cols) {
  const k = cols.length;
  const out = new Int32Array(k * k);
  for (let a = 0; a < k; a++) for (let b = a; b < k; b++) {
    const [ra, rb] = [st.pos[cols[a]], st.pos[cols[b]]];
    out[a * k + b] = a === b ? ra : st.at.get(Math.min(ra, rb) * st.n + Math.max(ra, rb));
  }
  return out;
}

/** Solve A d = b where A is the matrix held in V (changed, and its multipliers left in `mult`): Gaussian elimination without pivoting in the order of the structure (A is symmetric positive definite after damping). Null if a pivot is too small. */
function sparseSolve(st, V, mult, b) {
  const { n, order, lists } = st;
  for (let k = 0; k < n; k++) {
    const d = V[k];
    if (!(Math.abs(d) >= 1e-18)) return null;
    const { cols, where, to } = lists[k];
    let t = 0;
    for (let i = 0; i < cols.length; i++) {
      const u = V[where[i]];
      const l = u / d;
      mult[where[i]] = l;
      V[cols[i]] -= l * u;
      for (let j = i + 1; j < cols.length; j++) V[to[t++]] -= l * V[where[j]];
    }
  }
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) y[k] = b[order[k]];
  for (let k = 0; k < n; k++) {
    const { cols, where } = lists[k];
    for (let i = 0; i < cols.length; i++) y[cols[i]] -= mult[where[i]] * y[k];
  }
  const x = new Float64Array(n);
  for (let k = n - 1; k >= 0; k--) {
    const { cols, where } = lists[k];
    let s = y[k];
    for (let i = 0; i < cols.length; i++) s -= V[where[i]] * x[cols[i]];
    x[k] = s / V[k];
  }
  const d = new Array(n);
  for (let k = 0; k < n; k++) d[order[k]] = x[k];
  return d;
}

/** Levenberg-Marquardt from x0. Returns { x, residual, iterations }. */
function lm(cons, x0, index, maxIter = 200) {
  let x = x0.slice();
  let f = residuals(cons, x, index);
  let c = cost(f);
  let lambda = 1e-3;
  let it = 0;
  const n = x.length;
  let colLists, st, places, V, mult;
  for (; it < maxIter && maxAbs(f) > TOL; it++) {
    if (!st) { // (made when the first step is needed: a system that already holds is not looked at)
      colLists = cons.map((k) => columnsOf(k, index));
      st = structureOf(n, colLists);
      places = colLists.map((cols) => placesOf(st, cols));
      V = new Float64Array(st.size);
      mult = new Float64Array(st.size);
    }
    const rows = jacobianRows(cons, x, index, colLists);
    V.fill(0);
    const g = new Float64Array(n);
    for (let i = 0; i < rows.length; i++) {
      const { cols, vals, ci } = rows[i];
      const pl = places[ci];
      const k = cols.length;
      for (let a = 0; a < k; a++) {
        const va = vals[a];
        if (va === 0) continue;
        g[cols[a]] += va * f[i];
      }
      for (let a = 0; a < k; a++) for (let b = a; b < k; b++) V[pl[a * k + b]] += vals[a] * vals[b];
    }
    let dmax = 1e-9;
    for (let i = 0; i < n; i++) if (V[i] > dmax) dmax = V[i]; // the same damping for every variable (not scaled by each one's own sensitivity), so a step that has freedom moves things the least, not the ones the constraints hold
    const minusG = new Float64Array(n);
    for (let i = 0; i < n; i++) minusG[i] = -g[i];
    let accepted = false;
    for (let tries = 0; tries < 12 && !accepted; tries++) {
      const A = V.slice();
      for (let i = 0; i < n; i++) A[i] += lambda * dmax;
      const d = sparseSolve(st, A, mult, minusG);
      if (d) {
        const xn = x.map((v, i) => v + d[i]);
        const fn = residuals(cons, xn, index);
        const cn = cost(fn);
        if (cn < c) {
          x = xn;
          f = fn;
          c = cn;
          lambda = Math.max(lambda / 4, 1e-12);
          accepted = true;
          continue;
        }
      }
      lambda *= 6;
    }
    if (!accepted) break;
  }
  return { x, residual: maxAbs(f), iterations: it };
}

/** How many independent rows the constraints have at x, and which constraints add nothing (are redundant). */
function analyse(cons, x, index, nvars) {
  const basis = [];
  const redundant = [];
  const scale = 1e-6;
  for (const c of cons) {
    if (c.w !== undefined && c.w < 1) continue; // soft preferences do not count as constraints
    const J = jacobian([c], x, index);
    let added = false;
    for (let row of J) {
      row = row.slice();
      for (const [pivot, b] of basis) {
        const k = row[pivot] / b[pivot];
        if (k !== 0) for (let q = 0; q < row.length; q++) row[q] -= k * b[q];
      }
      let pivot = 0;
      for (let q = 1; q < row.length; q++) if (Math.abs(row[q]) > Math.abs(row[pivot])) pivot = q;
      if (Math.abs(row[pivot]) > scale) (basis.push([pivot, row]), (added = true));
    }
    if (!added) redundant.push(c.id);
  }
  return { rank: basis.length, dof: nvars - basis.length, redundant };
}

/**
 * Solve the system. `soft` preferences (e.g. keep an anchor where it is, follow the mouse) are constraints with w < 1.
 * Never throws for bad geometry: a conflict is a result.
 */
export function solve(system, constraints, opts = {}) {
  const parts = split(system, constraints);
  if (parts) return joinResults(parts.map(([sys, cons]) => solveOne(sys, cons)), system);
  return solveOne(system, constraints);
}

/**
 * Independent groups: constraints that share no point or number with each other are solved apart, so a drawing of many separate shapes costs the sum of the shapes, not the cube of the whole
 * (the solver is dense). Returns the groups as [system, constraints], or null if everything is one group.
 */
function split(system, constraints) {
  const scalars = system.scalars ?? {};
  const owner = new Map(); // variable key -> group id (union-find)
  const parent = [];
  const find = (a) => { while (parent[a] !== a) (parent[a] = parent[parent[a]], (a = parent[a])); return a; };
  const keysOf = (c) => Object.entries(c).filter(([k, v]) => k !== "id" && k !== "type" && typeof v === "string" && (v in system.points || v in scalars)).map(([, v]) => (v in system.points ? `p:${v}` : `s:${v}`));
  const withKeys = constraints.map((c) => [c, keysOf(c)]);
  for (const [, keys] of withKeys) {
    let g = -1;
    for (const k of keys) {
      if (!owner.has(k)) { parent.push(parent.length); owner.set(k, parent.length - 1); }
      const r = find(owner.get(k));
      if (g < 0) g = r; else if (r !== g) parent[r] = g;
    }
  }
  const groups = new Map();
  for (const [c, keys] of withKeys) {
    const g = keys.length ? find(owner.get(keys[0])) : -1;
    if (!groups.has(g)) groups.set(g, { cons: [], points: {}, scalars: {} });
    const grp = groups.get(g);
    grp.cons.push(c);
    for (const k of keys) { if (k.startsWith("p:")) grp.points[k.slice(2)] = system.points[k.slice(2)]; else grp.scalars[k.slice(2)] = scalars[k.slice(2)]; }
  }
  if (groups.size < 2) return null;
  return [...groups.values()].map((g) => [{ ...system, points: g.points, scalars: g.scalars }, g.cons]);
}

function joinResults(results, system) {
  const total = 2 * Object.keys(system.points).length + Object.keys(system.scalars ?? {}).length;
  const grouped = results.reduce((a, r) => a + 2 * Object.keys(r.points).length + Object.keys(r.scalars).length, 0);
  const out = { status: "ok", points: { ...system.points }, scalars: { ...(system.scalars ?? {}) }, dof: total - grouped, redundant: [], conflicts: [], residual: 0, iterations: 0 }; // (what no constraint touches is free)
  for (const r of results) {
    Object.assign(out.points, r.points);
    Object.assign(out.scalars, r.scalars);
    if (r.status !== "ok") out.status = r.status;
    out.dof = out.dof === null || r.dof === null ? null : out.dof + r.dof;
    out.redundant.push(...r.redundant);
    out.conflicts.push(...r.conflicts);
    out.residual = Math.max(out.residual, r.residual);
    out.iterations = Math.max(out.iterations, r.iterations);
  }
  return out;
}

function solveOne(system, constraints) {
  const { index, x: x0, n } = layout(system);
  const toResult = (x) => {
    const points = {};
    const scalars = {};
    for (const [key, i] of index) {
      if (key.startsWith("p:")) points[key.slice(2)] = [x[i], x[i + 1]];
      else scalars[key.slice(2)] = x[i];
    }
    return { points, scalars };
  };
  const hard = constraints.filter((c) => (c.w ?? 1) >= 1);
  const soft = constraints.filter((c) => (c.w ?? 1) < 1);
  const all = constraints;
  let first;
  if (soft.length) {
    // soft preferences steer where there is freedom: solve with the hard constraints weighted up, then polish with the hard ones alone so they hold exactly
    const weighted = constraints.map((c) => ((c.w ?? 1) >= 1 ? { ...c, w: 1000 } : c));
    const steered = lm(weighted, x0, index);
    first = lm(hard, steered.x, index);
  } else first = lm(all, x0, index);
  // the hard constraints must hold exactly; soft ones are best effort
  const hardOnly = residuals(hard, first.x, index);
  if (maxAbs(hardOnly) > 1e-6) {
    // conflict: find which single constraint, once left out, lets the rest be satisfied
    const conflicts = [];
    if (hard.length <= 80) {
      const started = Date.now();
      for (const c of hard) {
        if (Date.now() - started > CONFLICT_SEARCH_MS) break; // (a big conflicting sketch: name what was found in the time, not freeze the page while trying every one)
        const r = lm(hard.filter((k) => k !== c), x0, index, 80);
        if (maxAbs(residuals(hard.filter((k) => k !== c), r.x, index)) <= 1e-6) conflicts.push(c.id);
      }
    }
    return { status: "conflict", ...toResult(x0), dof: null, redundant: [], conflicts, residual: maxAbs(hardOnly), iterations: first.iterations };
  }
  const { dof, redundant } = analyse(hard, first.x, index, n);
  return { status: "ok", ...toResult(first.x), dof, redundant, conflicts: [], residual: maxAbs(hardOnly), iterations: first.iterations };
}
