# The kernel interface

The app never touches a geometry library. It builds an **operation graph** (JSON) and gets a **result** (plain data) back. Today the kernel is OCCT (`occt/`);
a custom kernel replaces it by providing the same two things and passing `test/kernel-conformance.test.mjs` unchanged (`dec_kernel_hybrid`, `inv_kernel_boundary`).

## What lives where
- `index.ts`: the one place the app gets a kernel from: `{ name, init(options), evaluate(graph, tess) }` (types in `adapter.ts`); `web.ts` adds the browser start (`initKernelWeb`).
- `occt/`: the only code that may import OCCT or replicad. `interpreter.mjs` (graph to solids), `evaluate.mjs` (solids to the result), `oc.mjs` (loader), `web.mjs` (where the browser finds the .wasm). The kernel runs on the main thread today; a worker entry will be added when it matters (large models, phones).
- Outside `compiler/kernel/occt/`, nothing may import `replicad`, `opencascade` or the OCCT files (checked by `tools/check_layers.py`).
  The graph builder (`../graph.ts`), selection and the UI are kernel-agnostic and move to a new kernel unchanged.

## Input: `{ params: {}, ops: [...] }`
Ops run in order; each has `{ id, type, ... }` and may name an earlier op as `target` (a solid) or `profile` (a sketch). A failing op is reported and the ops that depend on it
are skipped (`upstream <id> failed`); independent ops still build. The final body is the last op that produced a solid, or none after a `clear`.

| type | fields | meaning |
|---|---|---|
| `sketch` | `shape` (`rect` w d, `circle` radius, `polygon` points), `at [u, v]`, and `plane` (`XY` `XZ` `YZ`) with `origin`, or `frame { origin, xDir, normal }` | a closed 2D shape on a plane (local u, v in mm) |
| `extrude` | `profile`, `distance`, `target?`, `mode` (`add` or `cut`) | pull a sketch along the plane's normal; cut removes it from `target` |
| `faceExtrude` | `target`, `ref`, `distance` | move a flat face along its normal (out adds, in cuts) |
| `faceTilt` | `target`, `ref`, `axis` (0..2), `angle` (deg) | turn a flat face about a world axis lying in it, through the face's middle |
| `edgeMod` | `target`, `ref { a, b, mid }`, `mode` (`fillet` or `chamfer`), `value` (mm) | round or bevel one line |
| `cylRadius` | `target`, `ref { kind: "cyl", axis, center, radius, lo, hi }`, `radius` | change the radius of a full round face |
| `cylDraft` | `target`, `ref` (as above), `angle` (deg) | taper a full round face, keeping its low end |
| `transform` | `target`, `mode` (`move` mm, `rotate` deg, `scale` factor), `axis`, `value` | whole body, about the box centre for rotate and scale |
| `cropBox` | `target`, `min`, `max` | keep the part inside a box (for measuring) |
| `clear` | none | delete the body; later ops start a new one |
| `hole` `fillet` `chamfer` `shell` | older query-based forms (`kernel-slice`) | kept for the corpus |

A flat-face `ref` is `{ n, d, point }`: the face's unit normal, its offset (`n . p = d`) and any point on it. A face is found by geometry, never by an id the kernel made up,
so references survive a change of kernel (and they can go stale if earlier steps move the face: `dec_stable_references`: named references are planned).

## Output: `evaluate(graph, tess)`
`{ ops: [{ id, type, error, ms }], finalId, volume, bbox: { min, max }, mesh: { vertices, normals, triangles } | null, faces, edges, vertices, totalMs }`
- `mesh`: Float32Array vertices and normals (xyz), Uint32Array triangle indices.
- `faces`: flat faces `{ start, count, n, d, ... }` and full round faces `{ type: "cyl", axis, center, radius, lo, hi, start, count }`; `start` and `count` are ranges into `mesh.triangles`.
- `edges`: `{ type, pts (flat xyz polyline), a, b, mid }`; `vertices`: `[x, y, z]` corners.
- Plain numbers and arrays only: no kernel objects, handles or ids; it survives `structuredClone` (a worker boundary).

## Moving to our own kernel
Write `compiler/kernel/<ours>/` with the same `init` and `evaluate`, point `index.ts` at it, and run the conformance suite (`app/test/kernel-conformance.test.mjs`). A hybrid (some ops ours, the rest OCCT)
is one adapter that dispatches per op type. Each op we replace is judged on the same suite plus any new cases we add for it.
