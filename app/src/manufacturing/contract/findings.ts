// Findings (`dec_manufacturing_contract` point 5): what a route says about a part. They advise and never block (`in_546`). One list in the UI, fed by every route.
import type { GeometryRef } from "./part.ts";
import type { ParamValue } from "./params.ts";

/** `info`: worth knowing. `caution`: probably wants a change. `warning`: likely to fail or to damage something. None of them stops anything. */
export type Severity = "info" | "caution" | "warning";

/** A change a route suggests. It is data only: the app turns it into an ordinary edit the user approves (`dec_manufacturing_version`), a route never edits the model. */
export interface Fix {
  label: string;
  /** which kind of edit (named by the app, e.g. "thicken", "split"), and its numbers */
  action: string;
  values: Record<string, ParamValue>;
}

export interface Finding {
  /** the same problem gets the same id on every run, so the UI can keep it dismissed */
  id: string;
  severity: Severity;
  message: string;
  /** what to highlight in the viewport */
  refs: GeometryRef[];
  fix?: Fix;
}
