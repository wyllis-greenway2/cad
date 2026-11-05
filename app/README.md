# The clean app (`app/`)

Production code for the rebuild described in `docs/decisions/dec_clean_engine_design.md`; the behaviours it must reproduce are in `docs/decisions/dec_interaction_spec.md`. The prototype in `prototypes/cad-ui` is the frozen reference (frozen when phase 4 runs).

TypeScript, run directly by Node's type stripping (no build step for tests). Type check with `npm run typecheck`, tests with `npm test`, layer rules with `npm run layers`.

## Layers (`src/`, the human's layers, `inv_layer_adjacency`)
`math` (pure functions) - `operation` (the graph: parts, relations, steps, commands, history; the source of truth) - `compiler` (graph to geometry: the solver, the kernel adapter, the body parts) - `interaction` (selection, picking, intents, tools, camera logic, the actions service) - `ui` (the view) - `platform` (files, storage, input events), and `shared` (types every layer may use).
Who may import whom is enforced by `tools/check_layers.py`. Only `ui` and `platform` may use the browser (`window`, `document`, DOM, three.js).
