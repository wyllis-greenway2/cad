// The web implementation of files and storage (`dec_platform_web_portable`): a download for saving, a file picker for opening, and the browser's local storage (used for small settings such as the scroll mode; a project is never kept there, every load starts fresh).
// The File System Access API is not used (Safari and mobile web views lack it). A desktop or mobile wrapper provides its own version of these two services.
export interface FileService {
  /** Offer `text` to the user as a file called `name`. */
  save(name: string, text: string): void;
  /** Offer `bytes` to the user as a file called `name` (`type`: its media type). */
  saveBytes(name: string, bytes: Uint8Array, type: string): void;
  /** Let the user choose a file; resolves to its text, or null if they cancel. */
  open(): Promise<string | null>;
}
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const webFiles: FileService = {
  save(name, text) { download(name, new Blob([text], { type: "application/json" })); },
  saveBytes(name, bytes, type) { download(name, new Blob([bytes as BlobPart], { type })); },
  open() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json,.cad";
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        void f.text().then(resolve, () => resolve(null));
      });
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  },
};

export const webStore: KeyValueStore = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage may be full or unavailable: the autosave is a convenience */ }
  },
};
