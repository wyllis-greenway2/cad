// Imported shape text kept small in the project (`dec_exchange_gaps`): the text of a STEP or BREP file travels with every save and every build of the model, and in the browser's autosave; deflated and written in base64 it is about a fifth of the size (a 12.8 MB STEP of 5,120 faces: 2.7 MB). Text that is not packed (a project saved before this) is read as it is.
import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";

const MARK = "z:";
const CHUNK = 0x8000;

/** The text packed: `z:` and the base64 of its deflate. */
export function pack(text) {
  const bytes = deflateSync(strToU8(text), { level: 6 });
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  return MARK + btoa(parts.join(""));
}

/** The text of what `pack` made, or the text itself when it was never packed. */
export function unpack(data) {
  const s = String(data);
  if (!s.startsWith(MARK)) return s;
  const bin = atob(s.slice(MARK.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return strFromU8(inflateSync(bytes));
}
