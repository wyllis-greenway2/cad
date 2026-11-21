import * as L from "../lineage-occt/lib.mjs";
const { oc } = L;
const chain = (o)=>{let s=[];for(let p=Object.getPrototypeOf(o);p&&p!==Object.prototype;p=Object.getPrototypeOf(p))s.push(Object.getOwnPropertyNames(p).filter(x=>!/^(constructor|isAliasOf|clone|delete|isDeleted|deleteLater)$/.test(x)).join(","));return s};
const rect = L.draw([0,0]).lineTo([10,0]).lineTo([10,5]).lineTo([0,5]).close().sketchOnPlane("XZ").face().wrapped;
// revolve of a face about Z
const rv = new oc.BRepPrimAPI_MakeRevol(rect, new oc.gp_Ax1(new oc.gp_Pnt(-5,0,0), new oc.gp_Dir(0,0,1)), Math.PI*2, false);
console.log("revol", chain(rv)[0]); console.log("faces", L.facesOf(rv.Shape()).length);
// loft
console.log("ThruSections ctor", typeof oc.BRepOffsetAPI_ThruSections);
const ts = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6); console.log("thru", chain(ts)[0]);
// thick solid
const th = new oc.BRepOffsetAPI_MakeThickSolid(); console.log("thick", chain(th)[0]);
const pp = oc.BRepOffsetAPI_MakePipe; console.log("pipe", typeof pp, "pipeshell", typeof oc.BRepOffsetAPI_MakePipeShell);
console.log("wire builders:", Object.keys(oc).filter(k=>/^BRepBuilderAPI_Make(Wire|Edge|Polygon|Face)|^GC_MakeArc|^BRepBuilderAPI_Transform|^Geom_(Circle|TrimmedCurve)/.test(k)).join(" "));
