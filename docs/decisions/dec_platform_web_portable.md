---
id: dec_platform_web_portable
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_004, in_005, in_006
date: 2026-11-04
depends_on:
  - prin_never_box_in: portability across shells is an application of the keep-pieces-swappable principle
  - inv_layer_adjacency: the strict platform interface is the Platform layer boundary
---
# Web first, with a portable core ("Option A, with Option B's discipline")

Build one web-technology codebase and run it in the browser first, then wrap it for desktop (Tauri
preferred), and for Android and iOS only if users ask. The discipline that keeps this open: the kernel,
operation graph and constraint logic contain no DOM, file or OS code and can compile to both WASM and
native; one strict Platform interface (files, storage, clipboard, license, input) has one implementation
per target; the UI is responsive, with touch and mouse as separate input profiles; the JSON file format
moves freely between targets.

The stack specifics that came with the recommendation (TypeScript, Three.js, geometry in WASM inside a
Web Worker, Tauri) are the AI's defaults. The human approved the approach; revisit the tools freely.

## Rationale
The human asked whether a browser version is reasonable and whether the same code can become native apps
(`in_004`, `in_005`) and approved the AI's recommendation (`in_006`). Browser-first gives the fastest
prototype, link-only trials and cross-platform reach; the portable-core rules avoid being locked into a
browser's memory and speed limits. Known limits: WASM memory cap, slower geometry than native,
browser file-access gaps, and app-store fees on mobile.
