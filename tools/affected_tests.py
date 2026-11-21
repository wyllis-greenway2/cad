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
  python3 tools/affected_tests.py --root next     the rebuild (next/): as above, and also the tests of every requirement row that lists a contract whose file changed
                                                  (docs/rebuild/*_requirements.md: `Intents` (`src/input.ts`) ...), and for a change in settings.ts, the rows that list the settings groups changed

Run it at the end of a session and after merging another session's work (`CLAUDE.md`, rule 12).
"""
import re, subprocess, sys, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / ("next" if "--root" in sys.argv and sys.argv[sys.argv.index("--root") + 1] == "next" else "app")
NEXT_MODE = APP.name == "next"
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


def settings_groups_changed(base):
    """The top-level groups of settings.ts that the diff touches (None: it cannot tell, so all of them)."""
    path = APP / "src" / "settings.ts"
    if not path.is_file():
        return None
    if base is None:
        return None  # (no base to diff against: cannot tell which groups, so all)
    out = git("diff", "-U0", base, "--", str(path.relative_to(ROOT)))
    lines = path.read_text(encoding="utf-8").split("\n")
    starts = [(i + 1, m.group(1)) for i, l in enumerate(lines) for m in [re.match(r"^  (\w+): [{\[]?", l)] if m]
    def group_at(n):
        g = None
        for ln, name in starts:
            if ln <= n:
                g = name
        return g
    groups = set()
    for m in re.finditer(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@", out, re.M):
        a, b = int(m.group(1)), int(m.group(2) or 1)
        for n in range(a, a + max(b, 1)):
            groups.add(group_at(n))
    return None if not out.strip() else {g for g in groups if g}


def spec_selected(seeds, base):
    """(test file -> why) for the requirement rows whose contracts' files are among `seeds` (and, for settings.ts, whose settings groups changed)."""
    import spec_lib as S
    why = {}
    tests = S.tests_of(APP / "test")
    seed_rel = {str(p.relative_to(APP)) for p in seeds if APP in p.parents}
    groups = settings_groups_changed(base) if "src/settings.ts" in seed_rel else set()
    for sp in S.specs():
        changed_contracts = {n for n, f in sp.contracts.items() if f in seed_rel}
        for rid, r in sp.rows.items():
            hit = [c for c in r["contracts"] if c in changed_contracts and c != "settings"]
            if "settings" in changed_contracts and "settings" in r["contracts"]:
                if groups is None or not r["settings_groups"] or set(r["settings_groups"]) & groups:
                    hit.append("settings" + ("." + ",".join(sorted(set(r["settings_groups"]) & groups)) if groups and r["settings_groups"] else ""))
            if not hit:
                continue
            for f, titles in tests.items():
                if any(rid in ids for ids in titles.values()):
                    why.setdefault(f, set()).add(f"{rid} lists {', '.join(hit)}")
    return why


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
    why = {}
    if NEXT_MODE:
        base_for_diff = base
        if not base_for_diff and "--files" not in args and "--since-merge" not in args:
            branch = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}") or "origin/main"
            base_for_diff = git("merge-base", "HEAD", branch) or "HEAD~1"
        if "--since-merge" in args:
            base_for_diff = "HEAD^1"
        why = spec_selected(seeds, base_for_diff)
        tests = sorted(set(tests) | {str(f.relative_to(APP)) for f in why})
    print(f"{len(seeds)} changed files; {len(near)} test files within {depth_max} imports of them ({len(all_tests)} reach them at any distance; --depth N widens)"
          + (f"; {len(why)} more by the requirements' contracts" if NEXT_MODE else ""))
    browser = [t for t in tests if t.endswith(".browser.ts")]
    if "--browser" not in args:
        tests = [t for t in tests if t not in browser]
        if browser:
            print(f"  ({len(browser)} browser test file(s) not run: add --browser, before pushing)")
    for t in tests:
        reasons = sorted(why.get(APP / t, ()))
        print("  " + t + (("   [" + "; ".join(reasons) + "]") if reasons else ""))
    if "--run" in args and tests:
        sys.exit(subprocess.call(["node", "--experimental-strip-types", "--test", "--test-timeout=60000", "--test-concurrency=1", *tests], cwd=APP))


if __name__ == "__main__":
    main()
