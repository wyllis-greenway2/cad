// What a file is, by what is in it (`dec_exchange_gaps`): a file dropped on the page or chosen may have no ending, a wrong one (`.txt`, `.dat`) or one an e-mail program added; the program reads it as what it is. Pure bytes in, a kind out.
import { unzip } from "../compiler/meshfile.ts";

export type FileKind = "step" | "stl" | "3mf" | "obj" | "brep" | "fcstd" | "svg" | "dxf";
const ENDING: Record<FileKind, string> = { step: "step", stl: "stl", "3mf": "3mf", obj: "obj", brep: "brep", fcstd: "FCStd", svg: "svg", dxf: "dxf" };

/** The kind of file these bytes are, or null when they are none the app reads. */
export async function sniffKind(bytes: Uint8Array): Promise<FileKind | null> {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const lead = head.replace(/^﻿/, "").trimStart();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) { // a zip: 3MF and FreeCAD are both
    const z = await unzip(bytes);
    if (!z.ok) return null;
    if ([...z.value.keys()].some((k) => k === "3D/3dmodel.model" || /\.model$/i.test(k))) return "3mf";
    if (z.value.has("Document.xml")) return "fcstd";
    return null;
  }
  if (lead.startsWith("ISO-10303-21")) return "step";
  if (head.startsWith("AutoCAD Binary DXF")) return "dxf";
  if (/^0\r?\n\s*SECTION\r?\n\s*2\r?\n/.test(lead)) return "dxf";
  if (/^CASCADE Topology/.test(lead)) return "brep";
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(lead) || (/^<\?xml/i.test(lead) && /<svg[\s>]/i.test(head))) return "svg";
  if (bytes.length >= 84) { // a binary STL says its triangle count, and the file is exactly that long (its header may begin with "solid" all the same)
    const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    if (bytes.length === 84 + 50 * n && n > 0) return "stl";
  }
  if (/^solid\b/i.test(lead) && /\bfacet\s+normal\b/i.test(head + new TextDecoder("latin1").decode(bytes.subarray(4096, Math.min(bytes.length, 8192))))) return "stl";
  const rows = head.split(/\r?\n/).map((l) => l.trim());
  if (rows.some((l) => /^v\s+[-+\d.eE]+\s+[-+\d.eE]+\s+[-+\d.eE]+/.test(l)) && rows.some((l) => /^(f|vt|vn|o|g)\s/.test(l))) return "obj";
  return null;
}

/** The name to read a file under: its own when its ending already says what it is, else the same name with the ending of what it is (`part.dat` with an STL in it is `part.stl`); the name unchanged when the bytes are none the app knows (the ending then decides, and says so). */
export async function nameFor(name: string, bytes: Uint8Array, kindOfName: (n: string) => FileKind | null): Promise<string> {
  const sniffed = await sniffKind(bytes);
  if (!sniffed || kindOfName(name) === sniffed) return name;
  return `${name.replace(/\.[^./\\]*$/, "")}.${ENDING[sniffed]}`;
}
