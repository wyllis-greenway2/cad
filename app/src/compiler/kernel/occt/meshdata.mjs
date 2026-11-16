// A triangle mesh as text that a step can keep (`dec_import_mesh`): the corner points as 32 bit floats and the triangles as 32 bit numbers, behind a small header, in base64. Plain JavaScript: the importer and the kernel both read it.

const CHUNK = 0x8000;
/** The mesh as one string: [number of points, number of triangles] then the points (x y z each) then the triangles (three point numbers each). */
export function encodeMesh(mesh) {
  const nv = mesh.vertices.length / 3, nt = mesh.triangles.length / 3;
  const bytes = new Uint8Array(8 + mesh.vertices.length * 4 + mesh.triangles.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, nv, true); view.setUint32(4, nt, true);
  mesh.vertices.forEach((v, i) => view.setFloat32(8 + 4 * i, v, true));
  mesh.triangles.forEach((t, i) => view.setUint32(8 + 4 * mesh.vertices.length + 4 * i, t, true));
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(out);
}

/** The mesh a string made by `encodeMesh` holds; throws when it is not one. */
export function decodeMesh(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length < 8) throw new Error("the mesh this step imported is damaged");
  const view = new DataView(bytes.buffer);
  const [nv, nt] = [view.getUint32(0, true), view.getUint32(4, true)];
  if (bytes.length !== 8 + nv * 12 + nt * 12) throw new Error("the mesh this step imported is damaged");
  const vertices = new Float32Array(nv * 3), triangles = new Uint32Array(nt * 3);
  for (let i = 0; i < vertices.length; i++) vertices[i] = view.getFloat32(8 + 4 * i, true);
  for (let i = 0; i < triangles.length; i++) triangles[i] = view.getUint32(8 + 4 * vertices.length + 4 * i, true);
  return { vertices, triangles };
}
