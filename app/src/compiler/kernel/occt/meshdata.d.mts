export interface MeshData { vertices: Float32Array; triangles: Uint32Array }
export function encodeMesh(mesh: MeshData): string;
export function decodeMesh(text: string): MeshData;
