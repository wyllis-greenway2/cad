// The Reset camera button (`in_303`): it stands at the top of the view while nothing of the model is in sight, and a click takes the view back to the last thing that was. It only draws and reports the click.
import { PILL, choiceRow } from "./look.ts";

export function createResetView(host: HTMLElement, reset: () => void) {
  const pill = document.createElement("div");
  pill.style.cssText = PILL + ";top:12px;left:50%;transform:translateX(-50%)";
  const label = document.createElement("span");
  label.textContent = "Nothing in view:";
  const choice = document.createElement("span");
  pill.append(label, choice);
  host.appendChild(pill);
  choiceRow(choice, [{ id: "reset", text: "Reset camera", title: "Go back to the last thing that was in view", on: true }], reset);
  return { update(on: boolean) { pill.style.display = on ? "flex" : "none"; } };
}
