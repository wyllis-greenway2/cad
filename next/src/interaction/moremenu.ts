// The "..." menu (`q_lean_ui`, `in_1569`): the one list for what is not an operation on the model: new, open, save, export. Pure: what there is to choose, and whether each can be chosen now (with the reason in words when it cannot).
export interface MoreItem { id: "new" | "open" | "save" | "export:stl" | "export:step"; label: string; icon: string; enabled: boolean; why?: string }
export function moreItems(s: { hasModel: boolean; hasBody: boolean }): MoreItem[] {
  const noBody = "there is no body yet: extrude something first", empty = "there is nothing to save yet";
  return [
    { id: "new", label: "New", icon: "add", enabled: s.hasModel, ...(s.hasModel ? {} : { why: "nothing is made yet" }) },
    { id: "open", label: "Open a file…", icon: "open", enabled: true },
    { id: "save", label: "Save to a file", icon: "save", enabled: s.hasModel, ...(s.hasModel ? {} : { why: empty }) },
    { id: "export:stl", label: "Export STL (to print)", icon: "exportFile", enabled: s.hasBody, ...(s.hasBody ? {} : { why: noBody }) },
    { id: "export:step", label: "Export STEP (to another CAD program)", icon: "exportFile", enabled: s.hasBody, ...(s.hasBody ? {} : { why: noBody }) },
  ];
}
