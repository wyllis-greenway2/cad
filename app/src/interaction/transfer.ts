// The Import and Export dialogs (`dec_import_export_menu`, `in_528`): what each asks, from what is selected and what there is, and what is done with the answers. A dialog is a description (fields with their choices); the page draws it and
// hands back the values. Pure: a session in, descriptions and files out.
import type { Kernel, StepSchema } from "../compiler/kernel/adapter.ts";
import { zipStored } from "../compiler/threemf.ts";
import type { Session } from "./session.ts";
import { scene as sceneOf } from "./session.ts";
import { canExport, selectedBodies } from "./exportstl.ts";
import { exportFile, fileName, FORMATS } from "./exportfile.ts";
import type { ExportFormat, FileOutcome, Quality, Units } from "./exportfile.ts";
import { exportFlat, canExportFlat, sketchPieces } from "./exportsketch.ts";
import { importAny, IMPORT_DEFAULTS, IMPORT_KINDS } from "./importfile.ts";
import type { ImportOptions, ImportOutcome } from "./importfile.ts";
import { units as numberSystem } from "../shared/units.ts";

export type FieldValue = string | number | boolean;
export interface Field {
  id: string;
  label: string;
  type: "choice" | "text" | "number" | "check" | "picture";
  /** a choice can carry a drawing (`image`: inline SVG made by the program), shown as a card when the field's `layout` is "cards" */
  choices?: { value: string; label: string; /** why it cannot be chosen now */ disabled?: string; image?: string }[];
  /** how a choice is laid out: a list of radio buttons (the default), cards with a drawing each, or small chips in a row */
  layout?: "cards" | "chips";
  /** for a picture: the SVG to show (made by the program, never typed by a person) */
  value: FieldValue;
  /** a line under it: what it means or what will happen */
  note?: string;
  /** shown, not edited */
  readonly?: boolean;
}
export interface Dialog { title: string; ok: string; fields: Field[] }

// ---------- export ----------
/** `project`: the model and its history as one file to open again, with what the page knew when it was saved (`in_1077`: a file to send when something is to be looked into). */
export type ExportKind = ExportFormat | "svg" | "dxf" | "project";
export interface ExportOptions { format: ExportKind; what: "all" | "selected"; units: Units; quality: Quality; perBody: boolean; /** a DXF with the pieces that meet joined into one path each */ joined: boolean; /** a STEP file's schema */ schema: StepSchema; /** an IGES file's faces as surfaces or solids */ iges: "surfaces" | "solids"; name: string }
export const EXPORT_DEFAULTS: ExportOptions = { format: "project", what: "all", units: "mm", quality: "fine", perBody: false, joined: true, schema: "ap214", iges: "surfaces", name: "" };
const FLAT_KINDS = new Set<ExportKind>(["svg", "dxf"]);
const NOTHING_3D = "nothing to export yet: make a body";
const NOTHING_FLAT = "nothing to export yet: draw something, or select a sketch or a flat face of a body";

/** The names of the bodies of the model. */
const bodyIds = (s: Session): string[] => Object.values(sceneOf(s).parts).flatMap((p) => (p.kind === "body" && p.id ? [p.id] : []));

/** The options made to fit what there is: a format that has nothing to export is not kept, `selected` only with a selection, the file name has no path in it. */
export function fitExport(s: Session, given: Partial<ExportOptions>): ExportOptions {
  const o: ExportOptions = { ...EXPORT_DEFAULTS, ...given }; // (what is not given, or was never kept, is the usual)
  const ok = (k: ExportKind): boolean => (k === "project" ? true : FLAT_KINDS.has(k) ? canExportFlat(s) : canExport(s));
  const format = ok(o.format) ? o.format : (["stl", "3mf", "obj", "step", "iges", "brep", "svg", "dxf", "project"] as const).find(ok) ?? o.format;
  const what = o.what === "selected" && selectedBodies(s) ? "selected" : "all";
  const count = what === "selected" ? selectedBodies(s)!.length : bodyIds(s).length;
  return { ...o, format, what, perBody: o.perBody && count > 1 && !FLAT_KINDS.has(format) && format !== "project", name: o.name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[A-Za-z0-9]{1,5}$/, "") };
}

export function exportDialog(s: Session, o0: Partial<ExportOptions>): Dialog {
  const o = fitExport(s, o0);
  const flat = FLAT_KINDS.has(o.format);
  const [can3d, canFlat] = [canExport(s), canExportFlat(s)];
  const sel = selectedBodies(s);
  const fields: Field[] = [
    { id: "format", label: "Format", type: "choice", value: o.format, choices: [
      { value: "project", label: "Project (.json): the whole model, to open again, and what is needed to look into a problem" },
      { value: "stl", label: "STL: for slicers and printers", ...(can3d ? {} : { disabled: NOTHING_3D }) },
      { value: "3mf", label: "3MF: for slicers (units, one file)", ...(can3d ? {} : { disabled: NOTHING_3D }) },
      { value: "obj", label: "OBJ: a mesh, for Blender and other mesh programs", ...(can3d ? {} : { disabled: NOTHING_3D }) },
      { value: "step", label: "STEP: for other CAD programs and shops (exact)", ...(can3d ? {} : { disabled: NOTHING_3D }) },
      { value: "iges", label: "IGES: for older CAD, CAM and CNC systems", ...(can3d ? {} : { disabled: NOTHING_3D }) },
      { value: "brep", label: "BREP: exact, for FreeCAD and other OpenCASCADE programs", ...(can3d ? {} : { disabled: NOTHING_3D }) },
      { value: "svg", label: "SVG: a flat drawing, for laser and vinyl", ...(canFlat ? {} : { disabled: NOTHING_FLAT }) },
      { value: "dxf", label: "DXF: a flat drawing, for CAD and CNC", ...(canFlat ? {} : { disabled: NOTHING_FLAT }) },
    ] },
  ];
  if (o.format === "project") {
    fields.push({ id: "name", label: "File name", type: "text", value: o.name || "model", note: ".json is added. It holds the model's history and the state of the page (the view, the selection, what the kernel answered, the last things done), so a problem can be looked into from this one file" });
    return { title: "Export", ok: "Export", fields };
  }
  if (!flat) {
    const total = bodyIds(s).length;
    fields.push({ id: "what", label: "What", type: "choice", value: o.what, choices: [
      { value: "all", label: `Everything (${total} bod${total === 1 ? "y" : "ies"})` },
      { value: "selected", label: sel ? `Only the selected bod${sel.length === 1 ? "y" : "ies"} (${sel.length})` : "Only the selected bodies", ...(sel ? {} : { disabled: total < 2 ? "there is only one body" : "select a body first" }) },
    ] });
  } else {
    const r = sketchPieces(sceneOf(s), s.click.selection);
    fields.push({ id: "about", label: "What", type: "text", readonly: true, value: r.ok ? `${r.what}: ${r.pieces.length} piece${r.pieces.length === 1 ? "" : "s"}` : "", note: "the selected sketch or flat face; with nothing selected, the whole drawing (when it is on one plane)" });
  }
  if (o.format !== "brep") fields.push({ id: "units", label: "Units", type: "choice", value: o.units, choices: [{ value: "mm", label: "Millimetres" }, { value: "in", label: "Inches" }] }); // (a BREP has no unit)
  if (o.format === "iges") fields.push({ id: "iges", label: "IGES body as", type: "choice", value: o.iges, choices: [{ value: "surfaces", label: "Trimmed surfaces: nearly every program reads them" }, { value: "solids", label: "B-rep solids: only the better programs read them" }] });
  if (o.format === "step") fields.push({ id: "schema", label: "STEP version", type: "choice", value: o.schema, choices: [{ value: "ap214", label: "AP214: the one nearly every program reads" }, { value: "ap203", label: "AP203: the oldest, for old CAM and CAD" }, { value: "ap242", label: "AP242: the current one" }] });
  if (o.format === "dxf") fields.push({ id: "joined", label: "Outlines", type: "check", value: o.joined, note: "joined into one path each (a cutter or router follows it without lifting); off: separate lines and arcs" });
  if (o.format === "stl" || o.format === "3mf" || o.format === "obj") fields.push({ id: "quality", label: "Mesh quality", type: "choice", value: o.quality, choices: [{ value: "fine", label: "Fine (0.01 mm from the true surface)" }, { value: "medium", label: "Medium (0.05 mm)" }, { value: "coarse", label: "Coarse (0.2 mm: small files)" }] });
  if (!flat) {
    const count = o.what === "selected" ? sel?.length ?? 0 : bodyIds(s).length;
    if (count > 1) fields.push({ id: "perBody", label: "Files", type: "check", value: o.perBody, note: `a file for each of the ${count} bodies, together in one zip` }); // (with one body there is nothing to choose)
  }
  fields.push({ id: "name", label: "File name", type: "text", value: o.name || (flat ? "sketch" : "model"), note: `.${flat ? o.format : FORMATS[o.format as ExportFormat].ext} is added` });
  return { title: "Export", ok: "Export", fields };
}

/** The file (or the zip of files) the options ask for. */
export async function exportWith(s: Session, kernel: Kernel, o0: Partial<ExportOptions>): Promise<FileOutcome> {
  const o = fitExport(s, o0);
  const base = o.name || (FLAT_KINDS.has(o.format) ? "sketch" : "model");
  if (o.format === "project") return { ok: false, error: "a project is written by the page, which knows its own state" } as FileOutcome;
  if (o.format === "svg" || o.format === "dxf") return exportFlat(s, o.format, `${base}.${o.format}`, o.units, o.joined);
  const format = o.format as ExportFormat;
  const only = o.what === "selected" ? selectedBodies(s) : undefined;
  const choices = { units: o.units, quality: o.quality, schema: o.schema, iges: o.iges };
  if (!o.perBody) return exportFile(s, kernel, format, only, `${base}.${FORMATS[format].ext}`, choices);
  const ids = only ?? bodyIds(s);
  const files: { name: string; data: Uint8Array }[] = [];
  for (const id of ids) {
    const r = await exportFile(s, kernel, format, [id], `${base}-${id}.${FORMATS[format].ext}`, choices);
    if (!r.ok) return r;
    files.push({ name: r.name, data: r.bytes });
  }
  const bytes = zipStored(files);
  return { ok: true, name: `${base}.zip`, bytes, mime: "application/zip", message: `exported ${files.length} files (${FORMATS[format].label}, ${o.units}) in ${base}.zip: ${files.map((f) => f.name).join(", ")}` };
}

// ---------- import ----------
export const KIND_OF = (name: string): "step" | "iges" | "stl" | "3mf" | "obj" | "brep" | "fcstd" | "svg" | "dxf" | null => {
  const e = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  return e === "step" || e === "stp" ? "step" : e === "igs" || e === "iges" ? "iges" : e === "brp" ? "brep" : e === "stl" || e === "3mf" || e === "obj" || e === "brep" || e === "fcstd" || e === "svg" || e === "dxf" ? e : null;
};

/** Fit a number the person typed: more than nothing. */
const fitImport = (given: Partial<ImportOptions>): ImportOptions => ({ ...IMPORT_DEFAULTS, ...given, repair: given.repair ?? true, reduce: given.reduce ?? true, scale: Number.isFinite(given.scale) && given.scale! > 1e-6 && given.scale! < 1e4 ? given.scale! : 1 });

export function importDialog(name: string, o0: Partial<ImportOptions>): Dialog {
  const o = fitImport(o0);
  const kind = KIND_OF(name);
  const fields: Field[] = [{ id: "file", label: "File", type: "text", readonly: true, value: name }];
  const units = (fileSays: string): Field => ({ id: "units", label: "Units", type: "choice", value: o.units, choices: [{ value: "file", label: fileSays }, { value: "mm", label: "Millimetres" }, { value: "cm", label: "Centimetres" }, { value: "in", label: "Inches" }, { value: "m", label: "Metres" }] });
  if (kind === "stl" || kind === "obj" || kind === "brep" || kind === "fcstd") fields.push({ id: "units", label: "Units", type: "choice", value: o.units === "file" ? numberSystem.system : o.units, choices: [{ value: "mm", label: kind === "fcstd" ? "Millimetres (FreeCAD keeps millimetres)" : "Millimetres (an STL, OBJ or BREP has no units of its own)" }, { value: "cm", label: "Centimetres" }, { value: "in", label: "Inches" }, { value: "m", label: "Metres" }] });
  else if (kind === "3mf") fields.push(units("As the file says"));
  else if (kind === "svg") fields.push(units("As the file says (its size, or 96 to the inch)"));
  else if (kind === "dxf") fields.push(units("As the file says (its INSUNITS, else millimetres)"));
  fields.push({ id: "scale", label: "Scale by", type: "number", value: o.scale, note: "1 keeps the size; 2 makes it twice as big" });
  if (kind === "svg" || kind === "dxf") {
    fields.push({ id: "place", label: "Where", type: "choice", value: o.place === "floor" ? "center" : o.place, choices: [{ value: "file", label: "As in the file" }, { value: "center", label: "Its middle at the origin" }] });
    fields.push({ id: "plane", label: "On", type: "choice", value: o.plane, choices: [{ value: "selected", label: "The selected plane or face (else XY)" }, { value: "XY", label: "The XY plane (floor)" }, { value: "XZ", label: "The XZ plane (front)" }, { value: "YZ", label: "The YZ plane (side)" }] });
  } else {
    fields.push({ id: "place", label: "Where", type: "choice", value: o.place, choices: [{ value: "file", label: "As in the file" }, { value: "center", label: "Its middle at the origin" }, { value: "floor", label: "Standing on the XY plane, centred" }] });
  }
  if (kind === "stl" || kind === "3mf" || kind === "obj") {
    fields.push({ id: "repair", label: "Repair", type: "check", value: o.repair, note: "fill small holes in the surface (64 edges or fewer)" });
    fields.push({ id: "reduce", label: "Reduce big meshes", type: "check", value: o.reduce, note: "a mesh of over 12,000 triangles is reduced to fit: the shape changes a little (the volume is said); off: it is refused" });
  }
  return { title: `Import ${kind ? kind.toUpperCase() : ""}`.trim(), ok: "Import", fields };
}

/** Bring the file in with the options. */
export const importWith = (s: Session, name: string, bytes: Uint8Array, o: Partial<ImportOptions>): Promise<ImportOutcome> => importAny(s, name, bytes, fitImport(o));

export { IMPORT_DEFAULTS, IMPORT_KINDS };
