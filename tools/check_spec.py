#!/usr/bin/env python3
"""Check a section's requirements against its tests, and sections' claimed inputs against each other.

  python3 tools/check_spec.py            errors (exit 1): a malformed row, a row naming a contract that is not listed, a test with no requirement or with an unknown one,
                                         two sections claiming the same input; and a report of the rows that need a test and have none (not an error until --strict)
  python3 tools/check_spec.py --strict   the rows without a test are errors too
  python3 tools/check_spec.py --selftest check that the checker itself finds what it should

A test names the rows it protects in its title, test("[C8 C9] ...", ...). A test with no row is an orphan: delete it or give it its requirement (CLAUDE.md, "the record").
Rows marked `hand` or `later` need no test; a row marked `unit` or `browser` and `built` does.
"""
import sys, tempfile
from pathlib import Path
import spec_lib as S

NEXT = S.ROOT / "next"


def claims_conflicts(specs):
    seen, out = {}, []
    for sp in specs:
        for dev, cs in sp.claims.items():
            for c in cs:
                if c.endswith("(shared)"):
                    continue
                k = (dev.lower(), c.lower())
                if k in seen and seen[k] != sp.path.name:
                    out.append(f"input claimed by two sections: {dev}: {c} ({seen[k]} and {sp.path.name}); one of them must say how they differ, or mark the claim '(shared)'")
                seen.setdefault(k, sp.path.name)
    return out


def check(specs, tests, strict=False, quiet=False, files_exist=True):
    errors, uncovered = [], []
    rows = {rid: (sp, r) for sp in specs for rid, r in sp.rows.items()}
    for sp in specs:
        errors += [f"{sp.path.name}: {e}" for e in sp.errors]
        for rid, r in sp.rows.items():
            for name in r["contracts"]:
                if name not in sp.contracts:
                    errors.append(f"{sp.path.name}: {rid} lists the contract '{name}', which is not in the Contracts list")
        for name, f in sp.contracts.items():
            if files_exist and not (NEXT / f).is_file():
                errors.append(f"{sp.path.name}: the contract '{name}' names a file that is not there: {f}")
    tagged = set()
    for f, titles in tests.items():
        for title, ids in titles.items():
            if not ids:
                errors.append(f"{f.name}: the test '{title}' names no requirement (an orphan: delete it or tag it [ID])")
            for i in ids:
                if i not in rows:
                    errors.append(f"{f.name}: the test '{title}' names {i}, which is not a requirement")
                else:
                    tagged.add(i)
    for rid, (sp, r) in rows.items():
        if sp.needs_test(rid) and rid not in tagged:
            uncovered.append(rid)
    errors += claims_conflicts(specs)
    if strict:
        errors += [f"{i} needs a {rows[i][1]['test']} test and has none" for i in uncovered]
    if not quiet:
        needs = [rid for rid, (sp, r) in rows.items() if sp.needs_test(rid)]
        print(f"{len(rows)} requirement rows; {len(needs)} need a test; {len(needs) - len(uncovered)} have one; {sum(len(t) for t in tests.values())} tests in {len(tests)} files")
        if uncovered:
            print("rows that need a test and have none: " + " ".join(uncovered))
        for e in errors:
            print("ERROR: " + e)
        if not errors:
            print("OK")
    return errors


def selftest():
    def mk(d, name, claims):
        (d / "docs" / "rebuild").mkdir(parents=True, exist_ok=True)
        (d / "docs" / "rebuild" / name).write_text(
            "## Contracts\n- `Intents` (`src/input.ts`): x\n## Inputs this section claims\n" + claims + "\n## A\n| ID | Requirement | Source | Inputs | Contracts | Test | Status |\n|---|---|---|---|---|---|---|\n"
            "| X1 | a thing | in_1 | | `Intents.orbit` | unit | built |\n| X2 | b thing | in_1 | | `Nope` | unit | built |\n| X3 | c | in_1 | | | later | later |\n| X4 | bad | in_1 | | | weird | built |\n")
    with tempfile.TemporaryDirectory() as t:
        d = Path(t)
        mk(d, "a_requirements.md", "- mouse: wheel; hover\n")
        mk(d, "b_requirements.md", "- mouse: Wheel; middle-drag (shared)\n")
        sp = S.specs(d)
        assert len(sp) == 2 and set(sp[0].rows) == {"X1", "X2", "X3", "X4"}, "rows are read"
        assert sp[0].rows["X1"]["contracts"] == ["Intents"], "a contract name is the part before the dot"
        assert any("claimed by two sections" in e for e in claims_conflicts(sp)), "a claim made twice is found"
        assert not any("middle-drag" in e for e in claims_conflicts(sp)), "a shared claim is let through"
        assert any("weird" in e for e in sp[0].errors), "a bad test kind is found"
        errs = check([sp[0]], {Path("x.test.ts"): {"orphan": set(), "tagged [X9]": {"X9"}, "ok [X1]": {"X1"}}}, quiet=True, files_exist=False)
        assert any("names no requirement" in e for e in errs), "an orphan test is found"
        assert any("X9, which is not a requirement" in e for e in errs), "a test naming no row is found"
        assert any("'Nope', which is not in the Contracts list" in e for e in errs), "an unknown contract is found"
        assert not any("X1 needs" in e for e in check([sp[0]], {Path("x.test.ts"): {"ok [X1]": {"X1"}}}, strict=True, quiet=True, files_exist=False)), "a covered row is covered"
    print("selftest OK")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return
    sp = S.specs()
    tests = S.tests_of(NEXT / "test")
    errors = check(sp, tests, strict="--strict" in sys.argv)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
