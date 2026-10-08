/** Optional floor-specific source for the Issues surface and its menu entry. */
export interface IssueBoardSource {
  title: string;
  count: number;
  canvas: HTMLCanvasElement;
  open(): void;
}
let source: IssueBoardSource | undefined;
const listeners = new Set<() => void>();
export const issueBoardSource = () => source;
export function setIssueBoardSource(next?: IssueBoardSource) {
  source = next;
  for (const listener of listeners) listener();
}
export function onIssueBoardSource(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
