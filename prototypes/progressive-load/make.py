# Prototype (thrown away, `in_914`): a project of N boxes apart, each a sketch and a push in "new" mode, as the app saves them. Usage: python3 make.py N out.json
import json, sys
n, out = int(sys.argv[1]), sys.argv[2]
cols = int(n ** 0.5) + 1
cmds = []
for k in range(n):
    e = f"e_{2 * k + 1:03d}"; sid = f"s_{2 * k + 2:03d}"
    x, y = (k % cols) * 12, (k // cols) * 12
    pts = [(x, y), (x + 8, y), (x + 8, y + 8), (x, y + 8)]
    parts = [{"type": "addPart", "part": {"origin": "drawn", "plane": "w/XY", "movable": True, "ref": f"d/{e}.p{i}", "kind": "corner", "at": [p[0], p[1], 0]}} for i, p in enumerate(pts)]
    parts += [{"type": "addPart", "part": {"origin": "drawn", "plane": "w/XY", "movable": True, "ref": f"d/{e}.s{i}", "kind": "line", "a": f"d/{e}.p{i}", "b": f"d/{e}.p{(i + 1) % 4}"}} for i in range(4)]
    cmds.append({"type": "batch", "commands": parts})
    step = {"id": sid, "type": "extrude", "parts": [f"d/{e}.s0", f"d/{e}.s3", f"d/{e}.s2", f"d/{e}.s1"], "params": {"depth": 4 + (k % 7)}}
    if k > 0: step["params"]["mode"] = "new"
    cmds.append({"type": "addStep", "step": step})
json.dump({"format": "cad-project", "version": 1, "base": {"version": 1, "counter": 0, "parts": [], "relations": [], "steps": []}, "commands": cmds, "cursor": len(cmds)}, open(out, "w"))
print(n, "boxes,", len(cmds), "commands")
