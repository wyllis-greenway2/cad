// A fine grain on the grey surfaces (`in_153`): a small tiling bump texture made in code, mapped by the surface's own coordinates (the two axes across the face it lies most nearly in),
// so the light and the reflected room break up a little as they cross it, as a slightly textured plastic does. Nothing is a picture file.
import * as THREE from "three";
import { settings } from "../../interaction/api.ts";

let cached: THREE.Texture | null = null;
/** A tiling normal map of fine random relief. */
export function grainTexture(): THREE.Texture {
  if (cached) return cached;
  const N = 128;
  const h = new Float32Array(N * N);
  for (let i = 0; i < h.length; i++) h[i] = Math.random();
  const soft = new Float32Array(N * N); // a light blur, so the grain is fine but not harsh
  const at = (a: Float32Array, x: number, y: number) => a[((y + N) % N) * N + ((x + N) % N)]!;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) soft[y * N + x] = (at(h, x, y) * 2 + at(h, x - 1, y) + at(h, x + 1, y) + at(h, x, y - 1) + at(h, x, y + 1)) / 6;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(soft, x + 1, y) - at(soft, x - 1, y)) * 6;
    const dy = (at(soft, x, y + 1) - at(soft, x, y - 1)) * 6;
    const l = Math.hypot(dx, dy, 1);
    const o = (y * N + x) * 4;
    img.data[o] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
    img.data[o + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255);
    img.data[o + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cached = t;
  return t;
}

/** Give a geometry the coordinates the grain is mapped by: across the face, in millimetres over the size of one tile. Needs normals. */
export function grainCoordinates(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  const k = 1 / settings.light.grainTileMm;
  for (let i = 0; i < pos.count; i++) {
    const [nx, ny, nz] = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [u, v] = nx >= ny && nx >= nz ? [y, z] : ny >= nz ? [x, z] : [x, y];
    uv[i * 2] = u * k;
    uv[i * 2 + 1] = v * k;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}
