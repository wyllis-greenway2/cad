#!/usr/bin/env python3
"""List (and with --run, run) the test files that depend on what changed.

A test goes stale when a file it depends on, but does not name, is changed by someone else (the rod maker was remade and the engine's volume test, which
reaches it only through the engine model, kept checking the old rod: `in_1383`). This follows the imports: every test file that imports, directly or through
other files, a changed file is affected.

  python3 tools/affected_tests.py                 changed since the branch point from origin's default branch (or --base REF)
  python3 tools/affected_tests.py --base HEAD~5   changed since a commit
  python3 tools/affected_tests.py --files app/src/operation/modelrod.ts   the tests that depend on those files
  python3 tools/affected_tests.py --depth 3        how many imports away a test may be (default 2; a file imported by almost everything reaches every test at some distance)
  python3 tools/affected_tests.py --run           run the affected tests (node --test), exit 1 if any fails
  python3 tools/affected_tests.py --since-merge   changed by the last merge commit (what the other session brought in)

Run it at the end of a session and after merging another session's work (`CLAUDE.md`, rule 12).
"""
import re, subprocess, sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
IMPORT = re.compile(r"""(?:from|import)\s*\(?\s*["']([^"']+)["']""")
EXTS = (".ts", ".mjs", ".js", ".tsx")


def resolve(frm: Path, spec: str):
    if not spec.startswith("."):
        return None
    base = (frm.parent / spec).resolve()
    for cand in [base, *(Path(str(base) + e) for e in EXTS), *(base / ("index" + e) for e in EXTS)]:
        if cand.is_file():
            return cand
    return None


def graph():
    files = [p for d in ("src", "test") for p in (APP / d).rglob("*") if p.is_file() and p.suffix in EXTS]
    rev = {}
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for spec in IMPORT.findall(text):
            t = resolve(f, spec)
            if t:
                rev.setdefault(t, set()).add(f)
    return files, rev


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True).stdout.strip()


def changed(base, since_merge):
    if since_merge:
        names = git("diff", "--name-only", "HEAD^1", "HEAD")
    else:
        if not base:
            branch = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}") or "origin/main"
            base = git("merge-base", "HEAD", branch) or "HEAD~1"
        names = git("diff", "--name-only", base)
        names += "\n" + git("ls-files", "--others", "--exclude-standard")
    return [ROOT / n for n in names.splitlines() if n]


def main():
    args = sys.argv[1:]
    base = args[args.index("--base") + 1] if "--base" in args else None
    files, rev = graph()
    named = [ROOT / a for a in args[args.index("--files") + 1:] if not a.startswith("--")] if "--files" in args else None
    seeds = [p.resolve() for p in (named if named is not None else changed(base, "--since-merge" in args)) if p.suffix in EXTS and APP in p.resolve().parents]
    depth_max = int(args[args.index("--depth") + 1]) if "--depth" in args else 2
    dist = {p: 0 for p in seeds}
    todo = list(seeds)
    while todo:  # (breadth first: how many imports lie between the changed file and the test)
        cur = todo.pop(0)
        for d in rev.get(cur, ()):
            if d not in dist:
                dist[d] = dist[cur] + 1
                todo.append(d)
    all_tests = {p: n for p, n in dist.items() if p.parent == APP / "test" and ".test." in p.name}
    near = sorted(str(p.relative_to(APP)) for p, n in all_tests.items() if n <= depth_max)
    tests = near
    print(f"{len(seeds)} changed files; {len(near)} test files within {depth_max} imports of them ({len(all_tests)} reach them at any distance; --depth N widens)")
    for t in tests:
        print("  " + t)
    if "--run" in args and tests:
        sys.exit(subprocess.call(["node", "--experimental-strip-types", "--test", *tests], cwd=APP))


if __name__ == "__main__":
    main()
