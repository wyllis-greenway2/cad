---
id: inv_manufacturing_boundary
kind: invariant
status: accepted
origin: ai-proposed-human-approved
human_input: in_543, in_544, in_561, in_562
date: 2026-11-16
depends_on:
  - dec_manufacturing_contract: this is the rule that keeps the contract the only way in and out
  - inv_kernel_boundary: same method for the same reason, one folder and one data format, checked mechanically
alternative_to:
---
# Manufacturing modules and the app meet only at the contract

**Accepted by the human (`in_561`) as proposed by the AI (`in_543`); checked by a script since `in_562`.** Code of a manufacturing module (a route, the toolpath types, profiles, post-processors) may import only the contract types, other code of its own, and permitted libraries. It may not import the compiler, the kernel, the interaction layer or the UI. The app may import a module only through the registry, never its internals. Nothing a kernel or the app made (objects, handles, ids) crosses; only plain data does. **Checked mechanically** by `python3 tools/check_manufacturing_boundary.py` (in `npm run check`; `--root` points it at another tree, as its tests do) and by `tools/check_layers.py`, where `manufacturing` is a layer that imports nothing outside itself and that only `interaction` and the composition root may import. The script's rules: (1) code under `app/src/manufacturing/` imports only itself and the permitted libraries (none yet; a library is added to the script's list after `docs/licenses.md` records its licence), no browser API; (2) `manufacturing/contract/` imports only its own folder and holds types and constants (no class, Map, Set, Promise, Date); (3) the rest of `src/` imports only `manufacturing/index.ts`; (4) a route (`manufacturing/routes/<name>/`) imports only its own folder, `contract/` and `core/`, never another route. Tests may import anything.

## Rationale

Without a mechanical rule, one convenient import ties a slicer to OCCT or to a UI file and the modules stop being replaceable. This is the same reasoning as `inv_kernel_boundary`, applied to the other side of the model.
