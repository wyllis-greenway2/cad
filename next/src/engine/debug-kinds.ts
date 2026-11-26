// Step kinds that misbehave on purpose, loaded only when the worker is started for testing (`workerData.debug`): they let the host's limits be tried.
import { Body } from "./lineage.ts";
import { kinds } from "./steps.ts";
const body = (inputs: unknown[]) => inputs.find((v) => v instanceof Body) as Body;
/** takes `ms` milliseconds doing nothing useful, then passes its body on */
kinds["debugHang"] = {
  outputs: "body",
  run: (inputs, { step }) => {
    const until = Date.now() + Number(step.params.ms ?? 0);
    while (Date.now() < until) {
      /* busy */
    }
    return body(inputs);
  },
};
/** takes the worker down: out of memory or a crash in the kernel looks like this to the host */
kinds["debugCrash"] = {
  outputs: "body",
  run: () => {
    process.exit(3);
  },
};
/** takes the worker down only when its number `at` is above 100: a question (a trial that sets it) can stop the kernel while the recipe as it is runs fine */
kinds["debugCrashAbove"] = {
  outputs: "body",
  run: (inputs, { step }) => {
    if (Number(step.params.at ?? 0) > 100) process.exit(3);
    return body(inputs);
  },
};
