// The library's fuse, cut and intersect, made once (`in_450`). The library builds `BRepAlgoAPI_Fuse(a, b)`, and that constructor already runs the whole algorithm; it then sets the glue and calls `Build()`, which runs it again:
// every boolean was made twice (and the glue, which tells the kernel that two shapes share only faces, came too late to spare the first). Here the builder is made with no shapes, told them and the glue, and built once.
// The result is the same as the library's (a test compares them); `options` are the library's (`simplify`, `optimisation`). This file replaces the three methods of the library's 3D shapes and nothing else.
import { getOC, cast, isShape3D, _3DShape } from "replicad";
import { stage } from "./stages.mjs";

function made(kind, a, b, options = {}) {
  const oc = getOC();
  const builder = kind === "fuse" ? new oc.BRepAlgoAPI_Fuse() : kind === "cut" ? new oc.BRepAlgoAPI_Cut() : new oc.BRepAlgoAPI_Common();
  const args = new oc.NCollection_List_TopoDS_Shape();
  const tools = new oc.NCollection_List_TopoDS_Shape();
  try {
    args.Append(a.wrapped);
    tools.Append(b.wrapped);
    builder.SetArguments(args);
    builder.SetTools(tools);
    if (options.optimisation === "commonFace") builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
    if (options.optimisation === "sameFace") builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
    stage(`${kind}: the boolean`, () => builder.Build());
    if (options.simplify !== false) stage(`${kind}: merging faces in one surface`, () => builder.SimplifyResult(true, true, 0.001));
    const shape = cast(builder.Shape());
    if (!isShape3D(shape)) throw new Error(`Could not ${kind === "common" ? "intersect" : kind} as a 3d shape`);
    return shape;
  } finally { args.delete(); tools.delete(); builder.delete(); }
}

_3DShape.prototype.fuse = function (other, options = {}) { return made("fuse", this, other, options); };
_3DShape.prototype.cut = function (tool, options = {}) { return made("cut", this, tool, options); };
_3DShape.prototype.intersect = function (tool, options = {}) { return made("common", this, tool, options); };
