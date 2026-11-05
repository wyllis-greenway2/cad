// The one event bus: layers call down; events travel up through this (`dec_clean_engine_design` section 1).
export type Unsubscribe = () => void;
export interface Bus<Events extends Record<string, unknown>> {
  on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void): Unsubscribe;
  emit<K extends keyof Events>(type: K, e: Events[K]): void;
}
export function createBus<Events extends Record<string, unknown>>(): Bus<Events> {
  const subs = new Map<keyof Events, Set<(e: never) => void>>();
  return {
    on(type, fn) {
      const set = subs.get(type) ?? new Set();
      set.add(fn as (e: never) => void);
      subs.set(type, set);
      return () => set.delete(fn as (e: never) => void);
    },
    emit(type, e) {
      for (const fn of [...(subs.get(type) ?? [])]) fn(e as never);
    },
  };
}
