// Loads the OCCT WASM build once and hands it to replicad.
import initOC from "replicad-opencascadejs";
import { setOC } from "replicad";

let ready;
// The kernel's WebAssembly is our own build of the same package with the IGES reader and writer bound (`app/vendor/occt/`, recipe in `tools/kernel-build/`); the package's own loader script is used with it. In a browser the caller says where the file is (`web.mjs`); here it is found beside the app.
const wasmFile = new URL("../../../../vendor/occt/replicad_single.wasm", import.meta.url);
export function loadOC(options = {}) {
  if (!ready) {
    ready = initOC({ locateFile: (f) => (f.endsWith(".wasm") ? decodeURIComponent(wasmFile.pathname) : f), ...options }).then((oc) => {
      setOC(oc);
      return oc;
    });
  }
  return ready;
}
