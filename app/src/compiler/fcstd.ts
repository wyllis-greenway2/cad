// Reading a FreeCAD document (`dec_exchange_gaps`): an `.FCStd` is a zip with `Document.xml` (the objects and, for those with a shape, the name of the `.brp` file that holds it), `GuiDocument.xml` (what is shown) and the `.brp` files (OpenCASCADE BREP text).
// Only the finished shapes are taken, not the sketches and the intermediate steps of a recipe: the shapes shown, or when the file says nothing about that, the ones no other object is made from. FreeCAD's recipe itself (its sketches and constraints) is not read.
import { unzip } from "./meshfile.ts";
import type { Parsed } from "./meshfile.ts";

export interface FcShape { name: string; label: string; brep: string }

const decode = (b: Uint8Array): string => new TextDecoder("utf-8").decode(b);

/** The finished shapes of an FCStd file, each with its name, its label and its BREP text; or why not. */
export async function parseFcstd(bytes: Uint8Array): Promise<Parsed<FcShape[]>> {
  const z = await unzip(bytes);
  if (!z.ok) return { ok: false, error: `this is not an FCStd file (${z.error})` };
  const docBytes = z.value.get("Document.xml");
  if (!docBytes) return { ok: false, error: "this is not an FCStd file (no Document.xml in it)" };
  const doc = decode(docBytes);
  const objects: { name: string; label: string; file?: string }[] = [];
  const data = doc.slice(Math.max(0, doc.indexOf("<ObjectData")));
  for (const m of data.matchAll(/<Object\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/Object>/g)) {
    const body = m[2]!;
    const file = /<Part\s+file="([^"]+)"/.exec(body)?.[1];
    const label = /<Property\s+name="Label"[^>]*>\s*<String\s+value="([^"]*)"/.exec(body)?.[1] ?? m[1]!;
    objects.push({ name: m[1]!, label, ...(file ? { file } : {}) });
  }
  const madeFrom = new Set<string>(); // (objects another object depends on: the steps of a recipe)
  for (const m of doc.matchAll(/<ObjectDeps\s+Name="[^"]+"[^>]*>([\s\S]*?)<\/ObjectDeps>/g)) for (const d of m[1]!.matchAll(/<Dep\s+Name="([^"]+)"/g)) madeFrom.add(d[1]!);
  const guiBytes = z.value.get("GuiDocument.xml");
  const shown = new Set<string>();
  let said = false;
  if (guiBytes) {
    for (const m of decode(guiBytes).matchAll(/<ViewProvider\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/ViewProvider>/g)) {
      const v = /<Property\s+name="Visibility"[^>]*>\s*<Bool\s+value="(true|false)"/.exec(m[2]!)?.[1];
      if (v !== undefined) said = true;
      if (v !== "false") shown.add(m[1]!);
    }
  }
  const withShape = objects.filter((o) => o.file && z.value.has(o.file));
  let chosen = said ? withShape.filter((o) => shown.has(o.name)) : withShape.filter((o) => !madeFrom.has(o.name));
  if (!chosen.length) chosen = withShape.filter((o) => !madeFrom.has(o.name)); // (everything hidden: the finished ones anyway)
  if (!chosen.length) return { ok: false, error: withShape.length ? "this FreeCAD document has no finished shape to import" : "this FreeCAD document has no shapes in it (no .brp files)" };
  const notes = [`${chosen.length} shape${chosen.length === 1 ? "" : "s"} of ${withShape.length} in the document (${said ? "the ones shown" : "the finished ones"}); the document's recipe, sketches and constraints are not read`];
  return { ok: true, value: chosen.map((o) => ({ name: o.name, label: o.label, brep: decode(z.value.get(o.file!)!) })), notes };
}
