# Dependencies and licenses

Every dependency is recorded here before it is added (CLAUDE.md rule 10). This is a working record, not
legal advice: have an IP lawyer review it before any paid release (see `dec_human_input_log`, and the
planned licensing review).

## Policy
- **Allowed:** MIT, BSD, ISC, Apache-2.0, and similar permissive licenses. Keep the notices.
- **Allowed with care:** MPL-2.0 (file-level copyleft; fine if we don't modify the files and mostly for
  build tools), LGPL-2.1/3 (see OCCT below).
- **Not allowed:** GPL, AGPL (they would force the whole app to be open-sourced). Unknown or missing
  license: ask first.
- Ship a Licenses screen (About) listing every runtime dependency and its notice.
- Re-run `node tools/license_scan.mjs <node_modules dir>` whenever dependencies change. It exits 1 on
  GPL, AGPL or unknown licenses.

## Direct dependencies (as of 2026-11-04)

| Package | Version | License | Used in | Notes |
|---|---|---|---|---|
| replicad | 1.2.0 | MIT | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui`, `app/`, `next/` (the engine core, `in_1477`) | Friendly API over OCCT. Prototype only; we may call OCCT directly instead. |
| replicad-opencascadejs | 1.1.0 | **LGPL-2.1-only** | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui`, `app/`, `next/` (the engine core, `in_1477`) | OCCT compiled to WASM (about 23 MB, 7 MB gzipped). The LGPL obligations below apply. |
| manifold-3d | 3.5.5 | Apache-2.0 | `prototypes/mesh-fillet` (spike 2 only, not production) | Mesh booleans in WebAssembly (532 KB wasm), read from the package's own `package.json` on 2026-11-21; a spike of the mesh route (`in_1463`). Not adopted: a decision entry comes first. |
| fflate | 0.8.3 | MIT | `app/` | Deflate and inflate in plain code, for the packed text of an imported STEP or BREP (`compiler/kernel/occt/pack.mjs`). It was already there as a dependency of three; direct since 2026-11-19 (`in_1038`). |
| prettier | 3.x | MIT | `next/` (a dev tool only: the code formatter, `npm run format`; not shipped) | Formats the TypeScript so no line is a wall of code (`in_1626`). A development dependency, never in the built app. |
| replicad-opencascadejs, our own build | 1.1.0 recipe | **LGPL-2.1-only** | `app/vendor/occt/replicad_single.wasm` (25 MB) | The same OpenCASCADE package, linked again with three more symbols bound (`IGESControl_Writer`, `IGESControl_Controller`, `IGESControl_Reader`) so that IGES can be read and written (`dec_exchange_gaps`, `in_1038`). The package's own loader script is used with it. **The LGPL points above hold, and this is how:** it is still a separate `.wasm` file loaded at run time (point 3), the build recipe is published in the repository (`tools/kernel-build/`: the package's own recipe plus the three symbols), OCCT itself is not modified, and the Licenses screen's notice for OCCT covers it. Built 2026-11-19 on the human's machine from the image `ghcr.io/taucad/opencascade.js:canary-ebd263f1-single-threaded`. |
| three | 0.187.0 | MIT | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui`, `prototypes/cad-ui`, `app/` | Rendering. |
| vite | 8.3.5 | MIT | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui`, `prototypes/cad-ui`, `app/` | Dev server and bundler; build time only. |
| typescript | 5.x (dev only) | Apache-2.0 | `app/` | Type checking only (`tsc --noEmit`); nothing of it ships. Tests run TypeScript directly with Node's built-in type stripping, so no other tool is needed. Added 2026-11-05 (`in_099`). |
| @types/node | 22.x (dev only) | MIT | `app/` | Type declarations for `node:test` in the tests; nothing ships. Added 2026-11-05 (`in_099`). |
| @types/three | 0.187.x (dev only) | MIT | `app/` | Type declarations for three.js; nothing ships. Added 2026-11-05. |

Transitive dependencies (scan on 2026-11-04: 22 packages in the two OCCT prototypes and 22 in `cad-ui` (which now uses OCCT too, behind `src/kernel/occt/`); same license mix, no GPL/AGPL/unknown): MIT 14, ISC 3, Apache-2.0 1,
BSD-3-Clause 1, LGPL-2.1-only 1 (the OCCT build above), MPL-2.0 2. The two MPL-2.0 packages are
`lightningcss` (a CSS minifier used by Vite at build time; not shipped to users). No GPL, AGPL or
unknown licenses.

## OCCT (LGPL-2.1) obligations
OCCT can be used in closed-source commercial products if we:
1. Keep its copyright and license notices and show them in the app's Licenses screen.
2. Publish the source of any modifications we make to OCCT itself (we make none so far).
3. Let users replace the OCCT component with their own build ("relinking"). For WASM this means shipping
   OCCT as a **separate `.wasm` module** loaded by our app, not merged into our own code, and publishing
   the build recipe. Today's prototype does this by default (the `.wasm` file is a separate asset).
4. Keep our own code out of OCCT's source tree.

Open item: iOS and App Store rules make replacing libraries hard. Get legal advice before an iOS release.
The kernel stays behind our own interface (`prin_never_box_in`), so it can be swapped.

## Considered and not adopted
| Candidate | License | Verdict |
|---|---|---|
| SolveSpace libslvs (2D constraint solver) | GPLv3 | **Rejected**: would require open-sourcing the app. |
| planegcs (FreeCAD's solver) | LGPL | Not used: we write our own small solver (`dec_constraint_solver_small`). |
| Ceres Solver | BSD | Candidate for a custom solver. |
| Eigen | MPL-2.0 | Candidate math library for a custom solver. |
| opencascade.js (original package) | LGPL-2.1-only | Older (last published 2023); the replicad build is smaller and maintained. |
| Manifold | Apache-2.0 | Robust mesh booleans; mesh-only, so not a B-rep kernel. |
| clipper2-js 1.2.4 (a TypeScript port of Clipper2) | Boost Software License | **Not adopted** (`in_569`, 2026-11-16). The licence is permissive and allowed, but in a trial in Node its offset gave wrong results for a plain 10 mm square (`ClipperOffset` and `Clipper.InflatePaths` returned scrambled points, for a miter and a round join, either orientation). It was installed before this entry was written (rule 10 asks for the record first) and removed again the same session; nothing of it was committed. Offsetting is our own code in `manufacturing/core/offset.ts`. Clipper2 itself (the C++ original, Boost) or another port could be tried later. |
