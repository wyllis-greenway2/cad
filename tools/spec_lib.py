"""Reading a section's requirements (docs/rebuild/*_requirements.md) and its tests: shared by check_spec.py and affected_tests.py.

A requirements file has: a "Contracts" list (`Name` (`file`): what), an "Inputs this section claims" list (device: claim; claim), and tables of rows
| ID | Requirement | Source | Inputs | Contracts | Test | Status |.
A test names the rows it protects in its title: test("[C8 C9] zoom is flight's forward", ...).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROW = re.compile(r"^\| ([A-Z]+\d+) \|")
TAG = re.compile(r"\[([A-Z]+\d+(?:[ ,]+[A-Z]+\d+)*)\]")
KINDS = {"unit", "browser", "hand", "later"}
STATUSES = {"built", "later", "hand"}


class Spec:
    def __init__(self, path: Path):
        self.path = path
        self.rows = {}      # id -> dict
        self.errors = []
        self.contracts = {}  # name -> file (relative to the section's root, e.g. src/view.ts)
        self.claims = {}     # device -> set of claims
        self._parse(path.read_text(encoding="utf-8"))

    def _parse(self, text: str):
        section = None
        for line in text.split("\n"):
            if line.startswith("## "):
                section = line[3:].strip().lower()
                continue
            if section and section.startswith("contracts"):
                m = re.match(r"^- `(\w+)` \(`([^`]+)`\)", line)
                if m:
                    self.contracts[m.group(1)] = m.group(2)
            elif section and section.startswith("inputs this section claims"):
                m = re.match(r"^- ([^:]+): (.+)$", line)
                if m:
                    self.claims[m.group(1).strip()] = {c.strip() for c in m.group(2).split(";") if c.strip()}
            m = ROW.match(line)
            if m:
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if len(cells) != 7:
                    self.errors.append(f"{m.group(1)}: {len(cells)} columns, not 7")
                    continue
                rid, req, src, inputs, contracts, test, status = cells
                if rid in self.rows:
                    self.errors.append(f"{rid}: listed twice")
                if test not in KINDS:
                    self.errors.append(f"{rid}: test kind '{test}' is not one of {sorted(KINDS)}")
                if status not in STATUSES:
                    self.errors.append(f"{rid}: status '{status}' is not one of {sorted(STATUSES)}")
                names = re.findall(r"`([^`]+)`", contracts)
                self.rows[rid] = {"id": rid, "text": req, "source": src, "inputs": inputs, "test": test, "status": status,
                                  "contracts": sorted({n.split(".")[0] for n in names}), "settings_groups": sorted({n.split(".", 1)[1] for n in names if n.startswith("settings.")})}

    def needs_test(self, rid: str) -> bool:
        r = self.rows[rid]
        return r["test"] in ("unit", "browser") and r["status"] == "built"


def specs(root: Path = ROOT) -> list:
    return [Spec(p) for p in sorted((root / "docs" / "rebuild").glob("*_requirements.md"))]


def tests_of(test_dir: Path) -> dict:
    """test file -> {title: set(requirement ids)} for every test("...") in it."""
    out = {}
    for f in sorted(test_dir.glob("*.test.ts")):
        titles = {}
        for m in re.finditer(r"""\btest\(\s*(["'`])(.*?)\1""", f.read_text(encoding="utf-8")):
            titles[m.group(2)] = {i for tag in TAG.findall(m.group(2)) for i in re.split(r"[ ,]+", tag) if i}
        out[f] = titles
    return out
