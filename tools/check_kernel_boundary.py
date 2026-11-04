#!/usr/bin/env python3
"""Enforces inv_kernel_boundary: nothing outside the kernel adapter may import the kernel library.

Rules (for prototypes/cad-ui, the current app):
  1. Only files under src/kernel/occt/ may import `replicad`, `replicad-opencascadejs` or any OCCT package.
  2. Only files directly in src/kernel/ (index.mjs, client.js) may import from `kernel/occt/`.
  3. Files under src/kernel/occt/ must not import the app (anything outside src/kernel/occt/).
Run: python3 tools/check_kernel_boundary.py     (exit 1 with a list on any violation)
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "prototypes" / "cad-ui"
LIB = re.compile(r"""(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["'](replicad[^"']*|[^"']*opencascade[^"']*)["']""")
OCCT_PATH = re.compile(r"""(?:from\s+|import\s*\(\s*|new URL\(\s*)["']([^"']*kernel/occt/[^"']*|\./occt/[^"']*)["']""")
REL_IMPORT = re.compile(r"""(?:from\s+|import\s*\(\s*)["'](\.[^"']*)["']""")

problems = []
for path in sorted(list((ROOT / "src").rglob("*")) + list((ROOT / "test").rglob("*")) + [ROOT / "index.html"]):
    if not path.is_file() or path.suffix not in {".js", ".mjs", ".html"}:
        continue
    rel = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    in_adapter = rel.startswith("src/kernel/occt/")
    in_kernel_top = re.fullmatch(r"src/kernel/[^/]+\.(?:m?js)", rel) is not None
    for m in LIB.finditer(text):
        if not in_adapter:
            problems.append(f"{rel}: imports the kernel library '{m.group(1)}' (only src/kernel/occt/ may)")
    for m in OCCT_PATH.finditer(text):
        if not (in_adapter or in_kernel_top):
            problems.append(f"{rel}: reaches into the OCCT adapter '{m.group(1)}' (go through src/kernel/index.mjs or client.js)")
    if in_adapter:
        for m in REL_IMPORT.finditer(text):
            target = (path.parent / m.group(1)).resolve()
            if not str(target).startswith(str((ROOT / "src" / "kernel" / "occt").resolve())):
                problems.append(f"{rel}: the adapter imports the app '{m.group(1)}'")

if problems:
    print(f"{len(problems)} problem(s):")
    for p in problems:
        print("  -", p)
    sys.exit(1)
print("OK: the kernel boundary holds (inv_kernel_boundary)")
