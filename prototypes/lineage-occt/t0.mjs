import * as L from "./lib.mjs";
const face = L.draw([0,0]).lineTo([20,0]).lineTo([20,10]).lineTo([0,10]).close().sketchOnPlane("XY").face().wrapped;
const p = L.prism(face,[0,0,5],()=>"e",'A');
console.log(L.facesOf(p.shape).length, p.extra.map(e=>e.id));
const m = L.carry(p.mk, [], p.shape, 'A', p.extra);
console.log(m.entries.map(e=>e.id), m.log, L.valid(m.shape));
