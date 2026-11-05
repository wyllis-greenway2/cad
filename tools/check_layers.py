#!/usr/bin/env python3
"""Enforce the layer rules of the clean app (`app/src`, inv_layer_adjacency, dec_clean_engine_design).

Each layer may import only the layers listed below; only `ui` and `platform` may use the browser (window, document, DOM, three.js);
only the kernel adapter folder (`compiler/kernel/occt`) may import a kernel library. Run: python3 tools/check_layers.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "app" / "src"
# top to bottom (the human's blueprint): ui, interaction, compiler, operation, platform; math and shared are support layers
ALLOWED = {
    "math": set(),
    "shared": set(),
    "operation": {"shared"},
    "compiler": {"operation", "math", "shared"},
    "interaction": {"compiler", "operation", "math", "shared"},
    "ui": {"interaction", "shared"},
    "platform": {"shared"},
}
BROWSER = re.compile(r"\b(window|document|navigator|localStorage|sessionStorage|requestAnimationFrame|HTMLElement|HTMLCanvasElement|addEventListener)\b")
IMPORT = re.compile(r"""^\s*(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]""", re.M)
KERNEL_PKGS = ("replicad", "replicad-opencascadejs", "opencascade")


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def main() -> int:
    problems = []
    if not ROOT.exists():
        print("OK: no app/src yet")
        return 0
    files = [p for p in ROOT.rglob("*.ts")]
    for f in files:
        rel = f.relative_to(ROOT)
        layer = rel.parts[0]
        if layer not in ALLOWED:
            problems.append(f"{rel}: not inside a known layer folder ({', '.join(sorted(ALLOWED))})")
            continue
        text = f.read_text()
        code = strip_comments(text)
        for spec in IMPORT.findall(code):
            if spec.startswith("."):
                target = (f.parent / spec).resolve()
                try:
                    tl = target.relative_to(ROOT).parts[0]
                except ValueError:
                    problems.append(f"{rel}: imports {spec} outside app/src")
                    continue
                if tl != layer and tl not in ALLOWED[layer]:
                    problems.append(f"{rel}: the {layer} layer may not import the {tl} layer ({spec})")
            else:
                bare = spec.split("/")[0] if not spec.startswith("@") else "/".join(spec.split("/")[:2])
                if spec.startswith("node:"):
                    if layer in ("ui",):
                        problems.append(f"{rel}: the ui layer may not import {spec}")
                    continue
                in_adapter = rel.parts[:4] == ("compiler", "kernel", "occt") or rel.parts[:3] == ("compiler", "kernel", "occt")
                if bare in KERNEL_PKGS and not in_adapter:
                    problems.append(f"{rel}: only compiler/kernel/occt may import {spec}")
                elif bare not in KERNEL_PKGS and layer not in ("ui", "platform"):
                    problems.append(f"{rel}: the {layer} layer may not import the package {spec}")
        if layer not in ("ui", "platform") and BROWSER.search(code):
            problems.append(f"{rel}: browser API in the {layer} layer ({BROWSER.search(code).group(1)})")
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        return 1
    print(f"OK: {len(files)} files follow the layer rules")
    return 0


if __name__ == "__main__":
    sys.exit(main())
