#!/usr/bin/env python3
"""Validate the project record (docs/decisions, docs/human-input.md, docs/handoff.md).

Stdlib only. Exits 1 if any rule is broken. Rules are described in CLAUDE.md.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEC_DIR = ROOT / "docs" / "decisions"
HUMAN_LOG = ROOT / "docs" / "human-input.md"
HANDOFF = ROOT / "docs" / "handoff.md"
ORIGIN_DIR = ROOT / "docs" / "origin"

KIND_PREFIX = {"principle": "prin_", "invariant": "inv_", "decision": "dec_", "question": "q_"}
STATUSES = {"accepted", "provisional", "open"}
ORIGINS = {"human", "ai-proposed-human-approved", "ai-unreviewed"}
HUMAN_BACKED = {"human", "ai-proposed-human-approved"}
INPUT_KINDS = {"directive", "approval", "preference", "rejection", "authored", "question"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
INPUT_HEADING = re.compile(r"^## (in_\d{3,})\s+[—-]+\s+(\d{4}-\d{2}-\d{2})\s+[—-]+\s+([a-z]+)\s*$")
HANDOFF_HEADING = re.compile(r"^## Handoff \d{3,}\s+[—-]+\s+\d{4}-\d{2}-\d{2}\s*$", re.M)

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def parse_entry(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return None, ""
    try:
        end = lines.index("---", 1)
    except ValueError:
        return None, ""
    meta, key = {}, None
    for raw in lines[1:end]:
        if not raw.strip():
            continue
        if raw[0] in " \t" and raw.strip().startswith("- "):
            if key is None:
                err(path.name, f"list item without a key: {raw.strip()}")
                continue
            if not isinstance(meta[key], list):
                meta[key] = [meta[key]] if meta[key] else []
            meta[key].append(raw.strip()[2:].strip())
        elif raw[0] not in " \t" and ":" in raw:
            k, _, v = raw.partition(":")
            key = k.strip()
            meta[key] = v.strip()
        else:
            err(path.name, f"cannot parse front matter line: {raw!r}")
    return meta, "\n".join(lines[end + 1:])


def as_list(value):
    if isinstance(value, list):
        return value
    return [v.strip() for v in value.split(",") if v.strip()] if value else []


def section(body, heading):
    m = re.search(rf"^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)", body, re.M | re.S)
    return m.group(1).strip() if m else ""


def check_human_log():
    ids = set()
    if not HUMAN_LOG.exists():
        err("docs/human-input.md", "missing")
        return ids
    text = HUMAN_LOG.read_text(encoding="utf-8")
    parts = re.split(r"^(?=## )", text, flags=re.M)
    for part in parts:
        first = part.split("\n", 1)[0]
        if not first.startswith("## in_"):
            continue
        m = INPUT_HEADING.match(first)
        if not m:
            err("human-input.md", f"bad heading: {first!r} (want '## in_001 — YYYY-MM-DD — kind')")
            continue
        iid, _, kind = m.groups()
        if iid in ids:
            err("human-input.md", f"duplicate id {iid}")
        ids.add(iid)
        if kind not in INPUT_KINDS:
            err("human-input.md", f"{iid}: kind {kind!r} not in {sorted(INPUT_KINDS)}")
        if not any(l.startswith(">") and l.strip(">").strip() for l in part.splitlines()):
            err("human-input.md", f"{iid}: no quoted (>) human text")
    return ids


def check_origin_hashes():
    sums = ORIGIN_DIR / "SHA256SUMS"
    if not sums.exists():
        err("docs/origin", "SHA256SUMS missing")
        return
    listed = set()
    for line in sums.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, _, name = line.partition("  ")
        listed.add(name)
        f = ORIGIN_DIR / name
        if not f.exists():
            err("docs/origin", f"{name} listed but missing")
        elif hashlib.sha256(f.read_bytes()).hexdigest() != digest:
            err("docs/origin", f"{name} was modified (hash mismatch); originals must stay untouched")
    for f in ORIGIN_DIR.iterdir():
        if f.name != "SHA256SUMS" and f.name not in listed:
            err("docs/origin", f"{f.name} is not listed in SHA256SUMS")


def check_entries(input_ids):
    entries = {}
    for path in sorted(DEC_DIR.glob("*.md")):
        if path.name.startswith("_"):
            continue
        meta, body = parse_entry(path)
        if meta is None:
            err(path.name, "missing or unterminated front matter")
            continue
        eid = meta.get("id", "")
        if eid != path.stem:
            err(path.name, f"id {eid!r} must equal the file name")
        if eid in entries:
            err(path.name, f"duplicate id {eid}")
        entries[eid] = (path, meta, body)

    incoming = {eid: [] for eid in entries}
    graph = {}
    for eid, (path, meta, body) in entries.items():
        n = path.name
        kind, status, origin = meta.get("kind", ""), meta.get("status", ""), meta.get("origin", "")
        if kind not in KIND_PREFIX:
            err(n, f"kind {kind!r} not in {sorted(KIND_PREFIX)}")
        elif not eid.startswith(KIND_PREFIX[kind]):
            err(n, f"id must start with {KIND_PREFIX[kind]!r} for kind {kind}")
        if status not in STATUSES:
            err(n, f"status {status!r} not in {sorted(STATUSES)}")
        if origin not in ORIGINS:
            err(n, f"origin {origin!r} not in {sorted(ORIGINS)}")
        if not DATE_RE.match(meta.get("date", "")):
            err(n, "date must be YYYY-MM-DD")
        if not re.search(r"^# \S", body, re.M):
            err(n, "missing '# Title' heading")
        if (kind == "question") != (status == "open"):
            err(n, "kind 'question' must have status 'open' (and only questions may be open)")
        if status == "accepted" and origin not in HUMAN_BACKED:
            err(n, f"cannot be accepted with origin {origin!r}: needs human origin or human approval")
        refs = [r for r in as_list(meta.get("human_input", "")) if r != "in_000"]
        for r in refs:
            if r not in input_ids:
                err(n, f"human_input {r} not found in human-input.md")
        if origin in HUMAN_BACKED and not refs:
            err(n, f"origin {origin!r} requires at least one human_input reference")

        graph[eid] = []
        for item in as_list(meta.get("depends_on", [])):
            target, _, note = item.partition(":")
            target, note = target.strip(), note.strip()
            if target not in entries:
                err(n, f"depends_on {target!r} does not exist")
                continue
            if not note:
                err(n, f"depends_on {target} has no causal note")
            if status == "accepted" and entries[target][1].get("status") == "open":
                err(n, f"accepted entry depends on open question {target}")
            graph[eid].append(target)
            incoming[target].append(eid)
        alt = meta.get("alternative_to", "")
        if alt and alt not in entries:
            err(n, f"alternative_to {alt!r} does not exist")

    for eid, deps in incoming.items():
        if deps and not section(entries[eid][2], "Rationale"):
            err(entries[eid][0].name, f"has dependents ({', '.join(deps)}) but no '## Rationale'")

    state = {}

    def visit(node, trail):
        if state.get(node) == 2:
            return
        if state.get(node) == 1:
            err("decisions", "dependency cycle: " + " -> ".join(trail + [node]))
            return
        state[node] = 1
        for nxt in graph.get(node, []):
            visit(nxt, trail + [node])
        state[node] = 2

    for node in graph:
        visit(node, [])
    return entries


def check_handoff():
    if not HANDOFF.exists() or not HANDOFF_HEADING.search(HANDOFF.read_text(encoding="utf-8")):
        err("docs/handoff.md", "needs at least one '## Handoff NNN — YYYY-MM-DD' entry")


def main():
    input_ids = check_human_log()
    check_origin_hashes()
    entries = check_entries(input_ids)
    check_handoff()
    if errors:
        print(f"{len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"OK: {len(entries)} entries, {len(input_ids)} human inputs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
