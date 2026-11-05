#!/usr/bin/env python3
"""Report dead code in the clean app (`app/src`): functions and values that are exported but nothing else imports (in src or in the tests), and files nothing imports.

Run: python3 tools/check_unused.py        (exit 1 if anything is reported, so it can be a check; use --list to see them without failing)
An export used only inside its own file should simply not be exported.
"""
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
SRC = APP / "src"
EXPORT = re.compile(r"^export\s+(?:async\s+)?(?:const|function|class|enum)\s+([A-Za-z0-9_]+)", re.M)  # types and interfaces are API surface, not dead code
EXPORT_LIST = re.compile(r"^export\s+\{([^}]*)\}", re.M)
ENTRY = {"main.ts"}


def words(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text))


def main() -> int:
    files = [p for p in SRC.rglob("*.ts")]
    tests = [p for p in (APP / "test").rglob("*") if p.suffix in {".ts", ".mjs"}]
    texts = {p: p.read_text() for p in files + tests}
    problems = []
    for f in files:
        own = texts[f]
        names = set(EXPORT.findall(own))
        for group in EXPORT_LIST.findall(own):
            names |= {n.strip().split(" as ")[-1].strip() for n in group.split(",") if n.strip()}
        for name in sorted(names):
            used = any(re.search(rf"\b{re.escape(name)}\b", t) for p, t in texts.items() if p != f)
            if not used:
                inside = len(re.findall(rf"\b{re.escape(name)}\b", own)) > 1
                problems.append(f"{f.relative_to(SRC)}: `{name}` is exported but nothing else uses it" + (" (used inside: just stop exporting it)" if inside else " (not used at all: delete it)"))
    # files nobody imports
    for f in files:
        rel = f.relative_to(SRC).as_posix()
        if rel in ENTRY or f.name.endswith(".d.ts"):
            continue
        stem = f.stem
        if not any(re.search(rf"""['"][^'"]*/{re.escape(stem)}(?:\.ts)?['"]""", t) for p, t in texts.items() if p != f):
            problems.append(f"{rel}: no file imports it")
    # the UI's window onto the lower layers (interaction/api.ts): every name in it must be used by the UI or the root
    api = (SRC / "interaction" / "api.ts").read_text()
    ui_text = "\n".join(t for p, t in texts.items() if "ui" in p.parts or p.name == "main.ts")
    for group in re.findall(r"^export\s+(?:type\s+)?\{([^}]*)\}", api, re.M):
        for n in (x.strip() for x in group.split(",") if x.strip()):
            if not re.search(rf"\b{re.escape(n)}\b", ui_text):
                problems.append(f"interaction/api.ts: `{n}` is re-exported for the UI but the UI never uses it")
    if problems:
        print(f"{len(problems)} item(s):")
        for p in problems:
            print("  -", p)
        return 0 if "--list" in sys.argv else 1
    print("OK: no unused exports or files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
