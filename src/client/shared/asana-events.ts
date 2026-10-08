/** A successful board request may change the wall's task list or source. */
const listeners = new Set<() => void>();
export function asanaChanged() { for (const fn of listeners) fn(); }
export function onAsanaChanged(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
