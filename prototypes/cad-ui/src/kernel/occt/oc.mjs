// Loads the OCCT WASM build once and hands it to replicad.
import initOC from "replicad-opencascadejs";
import { setOC } from "replicad";

let ready;
export function loadOC(options = {}) {
  if (!ready) {
    ready = initOC(options).then((oc) => {
      setOC(oc);
      return oc;
    });
  }
  return ready;
}
