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
//   parallelDir / perpDir {a, b, dir}  the line ab is parallel / perpendicular to a fixed direction dir = [dx, dy] (a line of the body, seen on the sketch plane)
// The solver moves everything the least it can to satisfy the constraints (Levenberg-Marquardt from the current positions).
// Result: { status: "ok" | "conflict", points, scalars, dof, redundant: [ids], conflicts: [ids], residual, iterations }
//   dof = how many independent directions are still free (0 = fully constrained; a whole sketch that can slide counts too).

const TOL = 1e-9; // converged when every residual is below this
const FD = 1e-6; // finite-difference step

function layout(system) {
  const index = new Map();
  let n = 0;
  const x = [];
  for (const id of Object.keys(system.points).sort()) (index.set(`p:${id}`, n), x.push(...system.points[id]), (n += 2));
  for (const id of Object.keys(system.scalars ?? {}).sort()) (index.set(`s:${id}`, n), x.push(system.scalars[id]), (n += 1));
  return { index, x, n };
}

/** The residuals (what must be zero) of one constraint at the variables x. */
function residualsOf(c, x, index) {
  const P = (id) => {
    const i = index.get(`p:${id}`);
    if (i === undefined) throw new Error(`unknown point ${id}`);
    return [x[i], x[i + 1]];
  };
  const S = (id) => {
    const i = index.get(`s:${id}`);
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
    case "radius": return [(S(c.r) - c.value) * w];
    case "equalRadius": return [(S(c.r) - S(c.s)) * w];
    default: throw new Error(`unknown constraint ${c.type}`);
  }
}

const residuals = (cons, x, index) => cons.flatMap((c) => residualsOf(c, x, index));
const maxAbs = (v) => v.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
const cost = (f) => f.reduce((s, a) => s + a * a, 0) / 2;

/** The Jacobian (rows = residuals, columns = variables) by central differences. */
function jacobian(cons, x, index) {
  const m = residuals(cons, x, index).length;
  const J = Array.from({ length: m }, () => new Array(x.length).fill(0));
  for (let j = 0; j < x.length; j++) {
    const h = FD * Math.max(1, Math.abs(x[j]));
    const xp = x.slice();
    const xm = x.slice();
    xp[j] += h;
    xm[j] -= h;
    const fp = residuals(cons, xp, index);
    const fm = residuals(cons, xm, index);
    for (let i = 0; i < m; i++) J[i][j] = (fp[i] - fm[i]) / (2 * h);
  }
  return J;
}

/** Solve A d = b (A square, symmetric positive definite after damping) by Gaussian elimination with pivoting. */
function linsolve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-18) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let q = c; q <= n; q++) M[r][q] -= k * M[c][q];
    }
  }
  const d = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let q = r + 1; q < n; q++) s -= M[r][q] * d[q];
    d[r] = s / M[r][r];
  }
  return d;
}

/** Levenberg-Marquardt from x0. Returns { x, residual, iterations }. */
function lm(cons, x0, index, maxIter = 200) {
  let x = x0.slice();
  let f = residuals(cons, x, index);
  let c = cost(f);
  let lambda = 1e-3;
  let it = 0;
  for (; it < maxIter && maxAbs(f) > TOL; it++) {
    const J = jacobian(cons, x, index);
    const n = x.length;
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    for (let i = 0; i < J.length; i++) {
      for (let a = 0; a < n; a++) {
        if (J[i][a] === 0) continue;
        g[a] += J[i][a] * f[i];
        for (let b = 0; b < n; b++) H[a][b] += J[i][a] * J[i][b];
      }
    }
    let accepted = false;
    for (let tries = 0; tries < 12 && !accepted; tries++) {
      const dmax = Math.max(1e-9, ...H.map((row, i) => row[i])); // the same damping for every variable (not scaled by each one's own sensitivity), so a step that has freedom moves things the least, not the ones the constraint hardly touches
      const A = H.map((row, i) => row.map((v, j) => (i === j ? v + lambda * dmax : v)));
      const d = linsolve(A, g.map((v) => -v));
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
      for (const c of hard) {
        const r = lm(hard.filter((k) => k !== c), x0, index, 80);
        if (maxAbs(residuals(hard.filter((k) => k !== c), r.x, index)) <= 1e-6) conflicts.push(c.id);
      }
    }
    return { status: "conflict", ...toResult(x0), dof: null, redundant: [], conflicts, residual: maxAbs(hardOnly), iterations: first.iterations };
  }
  const { dof, redundant } = analyse(hard, first.x, index, n);
  return { status: "ok", ...toResult(first.x), dof, redundant, conflicts: [], residual: maxAbs(hardOnly), iterations: first.iterations };
}
