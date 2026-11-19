// The STEP file written by the kernel (`dec_export_more`): the bodies as products of one assembly, each named, with no colour, in the schema asked for.
// replicad's own `exportSTEP` gives every shape the colour red when none is given (an exported part opened red in other programs) and always AP242; this is its writer without the colour and with the schema as a choice.
import { getOC } from "replicad";

/** The schemas offered: OCCT's `write.step.schema` numbers (1 AP214CD, 2 AP214DIS, 3 AP203, 4 AP214IS, 5 AP242DIS). */
export const STEP_SCHEMAS = { ap203: 3, ap214: 4, ap242: 5 };

/** The bytes of a STEP file of `shapes` (`{ shape, name }`, replicad shapes), in the unit `unit` ("MM" or "INCH") with the model in `modelUnit`, in `schema` ("ap203", "ap214" or "ap242"). Throws when OCCT cannot write it. */
export function writeStepFile(shapes, { unit = "MM", modelUnit = "MM", schema = "ap214" } = {}) {
  const oc = getOC();
  const wrapString = (s) => new oc.TCollection_ExtendedString(s, true);
  const doc = new oc.TDocStd_Document(wrapString("XmlOcaf"));
  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
  const tool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
  for (const { shape, name } of shapes) {
    const node = tool.NewShape();
    tool.SetShape(node, shape.wrapped);
    oc.TDataStd_Name.Set(node, wrapString(name || "body"));
    // (no colour is set: a part with none opens in the viewer's own colour)
  }
  tool.UpdateAssemblies();
  new oc.STEPCAFControl_Writer().delete(); // (a writer sets up OCCT's STEP parameters when it is made, so the unit is set after one, not before: replicad does the same)
  oc.Interface_Static.SetCVal("xstep.cascade.unit", modelUnit.toUpperCase());
  oc.Interface_Static.SetCVal("write.step.unit", unit.toUpperCase());
  const session = new oc.XSControl_WorkSession();
  const writer = new oc.STEPCAFControl_Writer(session, false);
  writer.SetColorMode(false);
  writer.SetLayerMode(false);
  writer.SetNameMode(true);
  oc.Interface_Static.SetIVal("write.surfacecurve.mode", 1);
  oc.Interface_Static.SetIVal("write.precision.mode", 0);
  oc.Interface_Static.SetIVal("write.step.assembly", 2);
  oc.Interface_Static.SetIVal("write.step.schema", STEP_SCHEMAS[schema] ?? STEP_SCHEMAS.ap214);
  const file = `export-${Math.random().toString(36).slice(2)}.step`;
  const progress = new oc.Message_ProgressRange();
  try {
    if (!writer.Perform(doc, file, progress)) throw new Error("the kernel could not write the STEP file");
    return oc.FS.readFile(`/${file}`);
  } finally {
    try { oc.FS.unlink(`/${file}`); } catch { /* it was not written */ }
    progress.delete(); writer.delete(); session.delete();
  }
}
