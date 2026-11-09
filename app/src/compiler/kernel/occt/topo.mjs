// The faces and the edges of a shape, each once, in the order the explorer meets them. Replicad's own lists (`shape.faces`, `shape.edges`) ask the kernel whether each one found is the same as every one
// found before it, which for a body of a thousand edges is a million questions across the WebAssembly boundary (`in_250`: 0.8 s of the 1.2 s for a grid of a hundred and forty-four posts). The same
// answer is had by asking only those that share a hash.
import { getOC, downcast, Edge, Face, HASH_CODE_MAX } from "replicad";

function unique(shape, kind, wrap) {
  const oc = getOC();
  const explorer = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const out = [];
  try {
    const byHash = new Map();
    while (explorer.More()) {
      const item = explorer.Current();
      const h = oc.ReplicadShapeHasher.HashCode(item, HASH_CODE_MAX);
      const here = byHash.get(h);
      if (!here) byHash.set(h, [item]);
      else if (here.some((s) => s.IsSame(item))) { explorer.Next(); continue; }
      else here.push(item);
      out.push(wrap(downcast(item)));
      explorer.Next();
    }
  } finally {
    explorer.delete();
  }
  return out;
}

export const facesOf = (shape) => unique(shape, "TopAbs_FACE", (f) => new Face(f));
export const edgesOf = (shape) => unique(shape, "TopAbs_EDGE", (e) => new Edge(e));
