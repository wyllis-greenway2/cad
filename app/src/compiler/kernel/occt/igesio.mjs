// IGES, read and written by the kernel (`dec_exchange_gaps`): the old exchange format of older CAD, CAM and CNC systems. Needs the kernel build with the IGES reader and writer bound (`tools/kernel-build/`).
import { getOC, localGC, cast, makeSolid } from "replicad";
import { shellsOf } from "./topo.mjs";

/**
 * The bytes of an IGES file of `shapes` (replicad shapes), as ASCII text. `solids` false (the usual): the faces are written as trimmed surfaces (IGES entities 143 and 144), which nearly every program that reads IGES reads; true: the solids as B-rep solids (entity 186), which only the better programs read. `unit` is "MM" or "IN".
 * Throws when OCCT cannot write it.
 */
export function writeIgesFile(shapes, { unit = "MM", solids = false } = {}) {
  const oc = getOC();
  const writer = new oc.IGESControl_Writer(unit === "IN" ? "IN" : "MM", solids ? 1 : 0);
  const file = `export-${Math.random().toString(36).slice(2)}.igs`;
  try {
    const progress = new oc.Message_ProgressRange();
    let added = 0;
    for (const { shape } of shapes) if (writer.AddShape(shape.wrapped, progress)) added++;
    progress.delete();
    if (!added) throw new Error("the kernel could not write any of the bodies to the IGES file");
    writer.ComputeModel();
    if (!writer.Write(file, false)) throw new Error("the kernel could not write the IGES file");
    return oc.FS.readFile(`/${file}`);
  } finally {
    try { oc.FS.unlink(`/${file}`); } catch { /* it was not written */ }
    writer.delete();
  }
}

/**
 * The solids in the text of an IGES file, in millimetres (the reader converts the file's own unit). IGES mostly holds surfaces: when the file has solids they are taken; when it has only faces, they are sewn into a solid when they close up (the usual way a body is sent as IGES). Throws with the reason when there is no solid, or the surfaces do not close.
 * `isValid` checks a solid (the interpreter's own check).
 */
export function readIgesSolids(text, isValid) {
  const s = String(text);
  if (!/^.{72}S\s*0*1\s*\r?\n/.test(s)) throw new Error("this is not an IGES file (its first line should end with S and a line number in columns 73 to 80)");
  const oc = getOC();
  const [r, gc] = localGC();
  const file = `import-${Math.random().toString(36).slice(2)}.igs`;
  oc.FS.writeFile(`/${file}`, new TextEncoder().encode(s));
  let shape;
  try {
    const reader = r(new oc.IGESControl_Reader());
    if (reader.ReadFile(file) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error("the IGES file could not be read (it may be damaged)");
    reader.TransferRoots(r(new oc.Message_ProgressRange()));
    shape = cast(r(reader.OneShape()));
  } finally {
    try { oc.FS.unlink(`/${file}`); } catch { /* it was not written */ }
  }
  let solids = shape.solids ?? [];
  if (!solids.length) {
    const faces = shape.faces ?? [];
    if (!faces.length) { gc(); throw new Error("this IGES file has no surfaces or solids in it that the app can use (only curves, or entities it does not read)"); }
    // surfaces only (how a body is usually sent as IGES): sewn along their shared edges into shells, each closed shell a solid; tried at a tight gap and then a looser one
    for (const gap of [1e-4, 1e-2]) {
      solids = sewnSolids(faces, gap, isValid);
      if (solids.length) break;
    }
    gc();
    if (!solids.length) throw new Error(`this IGES file has ${faces.length} surface${faces.length === 1 ? "" : "s"} that do not close up into a solid (a gap between them, or an open shell): the app imports solids`);
  } else gc();
  solids.forEach((sd, i) => { if (!isValid(sd)) throw new Error(`body ${i + 1} of the IGES file is not a valid solid (it has gaps or folds)`); });
  return solids;
}

/** The valid solids made by sewing faces together at a gap (mm): one for each closed shell that comes out. */
function sewnSolids(faces, gap, isValid) {
  const oc = getOC();
  const sewing = new oc.BRepBuilderAPI_Sewing(gap, true, true, true, false);
  const progress = new oc.Message_ProgressRange();
  try {
    for (const f of faces) sewing.Add(f.wrapped);
    sewing.Perform(progress);
    const out = [];
    for (const shell of shellsOf(cast(sewing.SewedShape()))) {
      try { const sol = makeSolid([shell]); if (isValid(sol)) out.push(sol); } catch { /* this shell is open: it is not a solid */ }
    }
    return out;
  } catch { return []; } finally { progress.delete(); sewing.delete(); }
}
