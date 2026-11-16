#!/usr/bin/env python3
"""Enforces inv_manufacturing_boundary: manufacturing modules and the app meet only at the contract.

Rules, for `app/src/manufacturing/` and everything that imports it:
  1. Code under manufacturing/ imports only code under manufacturing/ and the permitted libraries (PERMITTED_LIBS, empty until one is recorded in docs/licenses.md).
     It may not reach the compiler, the kernel, the interaction layer, the UI or the platform, nor any other package, nor `node:` modules, and may not use browser APIs.
  2. manufacturing/contract/ imports nothing outside manufacturing/contract/ and holds only types and constants: no classes, no Map, Set, Promise or Date (plain data survives structuredClone and a worker).
  3. The rest of src/ imports manufacturing only through manufacturing/index.ts (the contract and, later, the registry), never from a route's or the contract's own files.
  4. A route (manufacturing/routes/<name>/) imports only its own folder, contract/ and core/ (the plumbing shared by routes), never another route.
Tests under app/test may import anything. Run: python3 tools/check_manufacturing_boundary.py [--root PATH to app/src]   (exit 1 with a list on any violation)
"""
import re
import sys
from pathlib import Path

PERMITTED_LIBS: set[str] = set()  # e.g. {"clipper2-wasm"}: add only after docs/licenses.md records the licence (rule 10)
DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "app" / "src"
IMPORT = re.compile(r"""^\s*(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)""", re.M)
BROWSER = re.compile(r"\b(window|document|navigator|localStorage|sessionStorage|requestAnimationFrame|HTMLElement|addEventListener|fetch)\b")
NOT_PLAIN = re.compile(r"\b(class|Map|Set|WeakMap|WeakSet|Promise|Date)\b")


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def check(root: Path) -> list[str]:
    mroot = root / "manufacturing"
    problems: list[str] = []
    for f in sorted(root.rglob("*.ts")):
        rel = f.relative_to(root)
        inside = rel.parts[0] == "manufacturing"
        code = strip_comments(f.read_text())
        for m in IMPORT.finditer(code):
            spec = m.group(1) or m.group(2)
            if spec.startswith("."):
                target = (f.parent / spec).resolve()
                try:
                    trel = target.relative_to(root.resolve())
                except ValueError:
                    problems.append(f"{rel}: imports {spec} outside src")
                    continue
                into = bool(trel.parts) and trel.parts[0] == "manufacturing"
                if inside and not into:
                    problems.append(f"{rel}: a manufacturing module imports {spec}, outside manufacturing/ (only the contract crosses)")
                    continue
                if not inside and into:
                    door = trel.parts[1:] in ((), ("index",), ("index.ts",))
                    if not door:
                        problems.append(f"{rel}: imports {spec}: go through manufacturing/index.ts, not into a module's own files")
                    continue
                if inside:
                    parts = rel.parts  # manufacturing/<area>/...
                    area = parts[1] if len(parts) > 2 else ""
                    tparts = trel.parts[1:]
                    if area == "contract" and not (tparts and tparts[0] == "contract"):
                        problems.append(f"{rel}: the contract imports {spec}; it may import only its own folder")
                    if area == "routes" and len(parts) > 3:
                        own = parts[2]
                        ok_area = tparts[:1] in (("contract",), ("core",)) or (tparts[:2] == ("routes", own))
                        if not ok_area:
                            problems.append(f"{rel}: route '{own}' imports {spec}; a route may use only its own folder, contract/ and core/")
            elif inside:
                bare = spec.split("/")[0] if not spec.startswith("@") else "/".join(spec.split("/")[:2])
                if spec.startswith("node:") or bare not in PERMITTED_LIBS:
                    problems.append(f"{rel}: a manufacturing module imports the package '{spec}' (permitted libraries: {sorted(PERMITTED_LIBS) or 'none yet'})")
        if inside:
            if BROWSER.search(code):
                problems.append(f"{rel}: a manufacturing module uses a browser API ({BROWSER.search(code).group(1)})")
            if len(rel.parts) > 2 and rel.parts[1] == "contract" and NOT_PLAIN.search(code):
                problems.append(f"{rel}: the contract is plain data and types ({NOT_PLAIN.search(code).group(1)} is not)")
    return problems


def main() -> int:
    root = DEFAULT_ROOT
    if "--root" in sys.argv:
        root = Path(sys.argv[sys.argv.index("--root") + 1]).resolve()
    if not (root / "manufacturing").exists():
        print("OK: no manufacturing modules yet")
        return 0
    problems = check(root)
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        return 1
    n = len(list((root / "manufacturing").rglob("*.ts")))
    print(f"OK: {n} manufacturing files keep the boundary (inv_manufacturing_boundary)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
