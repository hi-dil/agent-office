import type { Terminal } from '@xterm/xterm';
import './terminal-font.css';

export const TERMINAL_FALLBACK_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const FAMILY = '"Office JetBrains Mono Nerd Font"';

/** Switch only after both faces load, so xterm measures the actual font's cells. */
export function bindTerminalFont(term: Terminal, refit: () => void): () => void {
  let disposed = false;
  if (document.fonts) {
    void Promise.all([
      document.fonts.load(`14px ${FAMILY}`),
      document.fonts.load(`700 14px ${FAMILY}`),
    ]).then((faces) => {
      if (disposed || faces.some((loaded) => !loaded.length)) return;
      term.options.fontFamily = `${FAMILY}, ${TERMINAL_FALLBACK_FONT}`;
      refit();
      term.refresh(0, term.rows - 1);
    }, () => { /* Keep the system monospace font if downloading fails. */ });
  }
  return () => { disposed = true; };
}
