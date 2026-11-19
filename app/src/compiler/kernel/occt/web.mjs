// Starting the kernel in the browser: tells the WASM loader where the .wasm file is (the bundler gives its URL).
import wasmUrl from "../../../../vendor/occt/replicad_single.wasm?url"; // (our own build with IGES: `app/vendor/occt/`)
import { init, heapBytes } from "./evaluate.mjs";
export { heapBytes };

export const initWeb = () => init({ locateFile: () => wasmUrl });
