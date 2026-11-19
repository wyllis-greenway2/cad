// The 3MF file (`dec_export_formats`): a zip (stored, no compression) of three small files, one object, units millimetre, the axes of the model (Z up). Pure data in, bytes out.

const te = new TextEncoder();
const escape = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (v: number): string => String(Math.round(v * 1e6) / 1e6 + 0); // (a millionth of a mm; no "-0")

let table: Uint32Array | null = null;
/** The CRC-32 of the bytes (what a zip entry carries). */
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with the files stored as they are, in the order given. */
export function zipStored(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  for (const f of files) {
    const name = te.encode(f.name);
    const crc = crc32(f.data);
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); // (version 2.0, names are UTF-8)
    h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); // (stored; time 0:00, date 1980-01-01)
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    head.set(name, 30);
    const dir = new Uint8Array(46 + name.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true);
    d.setUint16(10, 0, true); d.setUint16(12, 0, true); d.setUint16(14, 0x21, true);
    d.setUint32(16, crc, true); d.setUint32(20, f.data.length, true); d.setUint32(24, f.data.length, true);
    d.setUint16(28, name.length, true); d.setUint32(42, at, true);
    dir.set(name, 46);
    parts.push(head, f.data);
    central.push(dir);
    at += head.length + f.data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, at, true);
  const out = new Uint8Array(at + size + 22);
  let o = 0;
  for (const p of [...parts, ...central, end]) { out.set(p, o); o += p.length; }
  return out;
}

/** The file for a mesh: `vertices` x y z for each corner, `triangles` three corner numbers for each triangle (counter-clockwise seen from outside, as 3MF wants). */
export function threeMfBytes(vertices: ArrayLike<number>, triangles: ArrayLike<number>, title: string, units: "mm" | "in" = "mm"): Uint8Array {
  return threeMfObjects([{ name: "", vertices, triangles }], title, units);
}

/** The file for several bodies (`dec_export_more_3mf`): an object for each, named, all built where they stand (slicers list them apart, each can be moved, set up or left out of the print on its own). One body is one unnamed object, as before. */
export function threeMfObjects(objects: readonly { name: string; vertices: ArrayLike<number>; triangles: ArrayLike<number> }[], title: string, units: "mm" | "in" = "mm"): Uint8Array {
  const parts = objects.map((o, n) => meshXml(o.vertices, o.triangles, n + 1, o.name));
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="${units === "in" ? "inch" : "millimeter"}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Title">${escape(title)}</metadata>\n<metadata name="Application">CAD</metadata>\n<resources>\n${parts.join("\n")}\n</resources>\n<build>\n${objects.map((_, n) => `<item objectid="${n + 1}"/>`).join("\n")}\n</build>\n</model>\n`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n`;
  return zipStored([{ name: "[Content_Types].xml", data: te.encode(types) }, { name: "_rels/.rels", data: te.encode(rels) }, { name: "3D/3dmodel.model", data: te.encode(model) }]);
}

/** One `<object>` of a mesh. The kernel's mesh has its own corners for each face; the file joins the ones at the same place (to a millionth of a mm), so the mesh is one connected piece and the file is smaller. */
function meshXml(vertices: ArrayLike<number>, triangles: ArrayLike<number>, id: number, name: string): string {
  const v: string[] = [];
  const at = new Map<string, number>();
  const renumber = new Map<number, number>();
  const corner = (i: number): number => {
    const known = renumber.get(i);
    if (known !== undefined) return known;
    const [x, y, z] = [num(vertices[3 * i]!), num(vertices[3 * i + 1]!), num(vertices[3 * i + 2]!)];
    const key = `${x},${y},${z}`;
    let n = at.get(key);
    if (n === undefined) { n = v.length; at.set(key, n); v.push(`<vertex x="${x}" y="${y}" z="${z}"/>`); }
    renumber.set(i, n);
    return n;
  };
  const t: string[] = [];
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    const [a, b, c] = [corner(triangles[i]!), corner(triangles[i + 1]!), corner(triangles[i + 2]!)];
    if (a !== b && b !== c && a !== c) t.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`); // (a sliver that has become a line is left out)
  }
  return `<object id="${id}"${name ? ` name="${escape(name)}"` : ""} type="model">\n<mesh>\n<vertices>\n${v.join("\n")}\n</vertices>\n<triangles>\n${t.join("\n")}\n</triangles>\n</mesh>\n</object>`;
}
