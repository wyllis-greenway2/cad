// The page's file service (the platform's part of `in_1569`): a file given to the person to keep, and a file taken from them. Text and bytes only; what is in them is `interaction/files.ts` and the engine's.
export function download(name: string, data: string | Uint8Array, mime = "application/octet-stream"): void {
  const blob = new Blob([data as BlobPart], { type: mime }),
    a = document.createElement("a"),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** The person chooses a file: its name and text (null: none chosen). The chooser is a hidden field the page keeps, so a dev check can give it a file. */
export function chooseFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    let input = document.getElementById("file-input") as HTMLInputElement | null;
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "file-input";
      input.accept = ".cad,.json,application/json,text/plain";
      input.style.cssText = "position:fixed;left:-1000px;top:0;opacity:0";
      document.body.appendChild(input);
    }
    const el = input;
    el.value = "";
    el.onchange = async () => {
      const f = el.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    el.click();
  });
}
export const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
