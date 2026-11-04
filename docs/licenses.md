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
| replicad | 1.2.0 | MIT | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui` | Friendly API over OCCT. Prototype only; we may call OCCT directly instead. |
| replicad-opencascadejs | 1.1.0 | **LGPL-2.1-only** | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui` | OCCT compiled to WASM (about 23 MB, 7 MB gzipped). The LGPL obligations below apply. |
| three | 0.187.0 | MIT | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui`, `prototypes/cad-ui` | Rendering. |
| vite | 8.3.5 | MIT | `prototypes/kernel-slice`, `prototypes/sketch-extrude`, `prototypes/cad-ui`, `prototypes/cad-ui` | Dev server and bundler; build time only. |

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
