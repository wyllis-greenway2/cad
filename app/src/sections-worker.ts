// A worm wheel's sections, worked out in a thread of their own (`in_899`): the scan over the worm's turns is the page's heaviest work (a 100 tooth wheel 2.5 s, four times that on a slow device), and the page stays alive while this runs.
// `sections-warm.ts` is the other end.
import { wheelSections } from "./operation/wheelsections.ts";
import type { GearSpec } from "./operation/gear.ts";

self.onmessage = (e: MessageEvent<{ id: number; spec: GearSpec }>) => {
  const post = (self as unknown as { postMessage(m: unknown): void }).postMessage.bind(self);
  try { post({ id: e.data.id, result: wheelSections(e.data.spec) }); }
  catch (err) { post({ id: e.data.id, failed: String(err) }); }
};
