// Starting the kernel in the browser: tells the WASM loader where the .wasm file is (the bundler gives its URL).
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { init, heapBytes } from "./evaluate.mjs";
export { heapBytes };

export const initWeb = () => init({ locateFile: () => wasmUrl });
