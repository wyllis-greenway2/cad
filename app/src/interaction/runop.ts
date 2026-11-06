// Making the step of an operation (`operations.opCommand`) and handing it to the session. Pulling or pushing a face the body already has changes the step that made it (`faceedit.ts`); if
// the steps after it cannot take the new size, the old way is used instead (a prism is added), and it says so.
import type { Session } from "./session.ts";
import { scene as sceneOf, run } from "./session.ts";
import type { Command } from "../operation/commands.ts";
import type { Op } from "./operations.ts";
import { opCommand } from "./operations.ts";

/** Run the step of `op` on `sess`. Returns the new session and whether it fell back to a prism; null when the operation has no step yet. */
export function runOp(sess: Session, op: Op): { session: Session; cmd: Command } | null {
  const cmd = opCommand(sceneOf(sess), op);
  if (!cmd) return null;
  if (!op.edit || op.noEdit) return { session: run(sess, cmd), cmd };
  const edited = run(sess, cmd, { watchAll: true });
  if (!edited.message) return { session: edited, cmd };
  const prism = opCommand(sceneOf(sess), { ...op, noEdit: true });
  if (!prism) return { session: edited, cmd };
  const made = run(sess, prism);
  return { session: made.message ? edited : { ...made, message: "the step that made this face could not take that size: a push / pull was added instead" }, cmd: prism };
}
