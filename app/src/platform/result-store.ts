// The kernel's answers kept in the browser's own storage (IndexedDB), so that a model answered before is shown at once when it is opened again (`dec_description_cache`). Only this file knows IndexedDB; the kernel on its
// thread (`kernel-async.ts`) is given a `ResultStore` and asks it. The key is made of the kernel's stamp and a SHA-256 of the graph's text: never a short hash, so that two graphs never share an answer.
/** The parts of the kernel's answer that are looked at here (the platform layer knows nothing of the compiler: the answer itself passes through, `KernelResult` fits it). */
export interface KernelResult {
  ops: unknown[];
  totalMs: number;
  mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array } | null;
  faces: unknown[] | null;
  edges: { pts: Float32Array }[] | null;
  vertices: unknown[] | null;
}

export interface ResultStore<T extends KernelResult = KernelResult> {
  /** the answer kept for this graph text, or null (not there, or not what it should be) */
  get(graphText: string): Promise<T | null>;
  /** keep the answer for this graph text; written a moment after the last one asked, so a run of answers writes only the newest */
  put(graphText: string, result: T): void;
  /** forget everything */
  clear(): Promise<void>;
}

const DB = "cad-results";
const STORE = "answers";
const KEEP_ENTRIES = 12; // the newest answers kept
const KEEP_BYTES = 120 * 1024 * 1024;
const QUIET_MS = 1500;

const sha256 = async (text: string): Promise<string> => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
/** about how many bytes the answer takes in storage (its arrays) */
export function sizeOf(r: KernelResult): number {
  const m = r.mesh ? r.mesh.vertices.byteLength + r.mesh.normals.byteLength + r.mesh.triangles.byteLength : 0;
  const e = (r.edges ?? []).reduce((a, x) => a + x.pts.byteLength + 200, 0);
  return m + e + (r.faces?.length ?? 0) * 200 + (r.vertices?.length ?? 0) * 40;
}
/** Is this what an answer should be? (a kept one that is not is as if it were not there) */
export function looksRight(r: unknown): r is KernelResult {
  const x = r as Partial<KernelResult> | null;
  if (!x || typeof x !== "object" || !Array.isArray(x.ops) || typeof x.totalMs !== "number") return false;
  if (x.mesh && !(x.mesh.vertices instanceof Float32Array && x.mesh.normals instanceof Float32Array && x.mesh.triangles instanceof Uint32Array)) return false;
  if (x.edges && !x.edges.every((e) => e.pts instanceof Float32Array)) return false;
  return true;
}

const request = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** The store for this stamp of the kernel; null where the browser has no IndexedDB (or it is refused). */
export function openResultStore<T extends KernelResult = KernelResult>(stamp: string): ResultStore<T> | null {
  if (typeof indexedDB === "undefined" || typeof crypto === "undefined" || !crypto.subtle) return null;
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => db ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "key" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  let pending: { text: string; result: KernelResult } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const write = async () => {
    const job = pending;
    pending = null;
    timer = null;
    if (!job) return;
    try {
      const [d, key] = [await open(), `${stamp}:${await sha256(job.text)}`];
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, stamp, at: Date.now(), bytes: sizeOf(job.result), result: { ...job.result, fromCache: undefined } });
      await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
      await trim(d);
    } catch { /* the store is a help, not a need */ }
  };
  /** the oldest answers (and those of other stamps of the kernel) go until the newest few are left, within the bytes allowed */
  const trim = async (d: IDBDatabase) => {
    const all = await request(d.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<{ key: string; stamp: string; at: number; bytes: number }[]>);
    const meta = all.map((e) => ({ key: e.key, stamp: e.stamp, at: e.at, bytes: e.bytes })).sort((a, b) => b.at - a.at);
    let total = 0;
    const drop: string[] = [];
    meta.forEach((e, i) => { total += e.bytes; if (e.stamp !== stamp || i >= KEEP_ENTRIES || total > KEEP_BYTES) drop.push(e.key); });
    if (!drop.length) return;
    const tx = d.transaction(STORE, "readwrite");
    for (const k of drop) tx.objectStore(STORE).delete(k);
    await new Promise<void>((res) => { tx.oncomplete = () => res(); tx.onerror = () => res(); });
  };
  return {
    async get(text) {
      try {
        const [d, key] = [await open(), `${stamp}:${await sha256(text)}`];
        const found = await request(d.transaction(STORE, "readonly").objectStore(STORE).get(key) as IDBRequest<{ result: unknown } | undefined>);
        return found && looksRight(found.result) ? (found.result as T) : null;
      } catch { return null; }
    },
    put(text, result) {
      pending = { text, result };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void write(), QUIET_MS);
    },
    async clear() {
      try { const d = await open(); const tx = d.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear(); await new Promise<void>((res) => { tx.oncomplete = () => res(); tx.onerror = () => res(); }); } catch { /* nothing to clear */ }
    },
  };
}
