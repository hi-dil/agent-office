import type { Terminal } from '@xterm/xterm';
import { h, toast } from './dom';
import { IS_MAC } from './termkeys';

/** Copy xterm's selection, which is not a native browser text selection. */
export function bindTerminalCopy(term: Terminal, before: HTMLElement): () => void {
  // Mouse-aware CLIs disable normal selection. xterm uses Option on Mac, Shift elsewhere.
  term.options.macOptionClickForcesSelection = true;
  const hint = `Select text by dragging (${IS_MAC ? 'Option' : 'Shift'}-drag when the CLI handles the mouse), then copy with ${IS_MAC ? '⌘C' : 'Ctrl+Shift+C'} or this button`;
  const button = h('button.btn', { type: 'button', title: hint, 'aria-label': 'Copy selection' }, 'Copy');
  before.before(button);
  const controller = new AbortController();
  const { signal } = controller;
  const update = () => button.toggleAttribute('disabled', !term.hasSelection());
  const selection = term.onSelectionChange(update);
  update();

  const copy = async (text = term.getSelection()) => {
    if (!text) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // HTTP offices and denied clipboard permissions still support a native copy event.
      if (signal.aborted) return;
      const focused = document.activeElement;
      const textarea = h('textarea', { style: 'position:fixed;opacity:0', 'aria-hidden': 'true' });
      textarea.value = text;
      document.body.append(textarea);
      textarea.select();
      try { copied = document.execCommand('copy'); } catch { /* Report failure below. */ }
      finally {
        textarea.remove();
        if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
      }
    }
    if (!signal.aborted) toast(copied ? 'Copied selection' : 'Could not copy. Try the browser’s Copy action.', copied ? undefined : 'warn');
  };
  // CLIs that copy their own selection (Claude Code) send OSC 52; the server's clipboard is useless to a remote browser.
  // Only honour it right after this viewer used the terminal, so other spectators' clipboards are left alone.
  let lastInput = 0;
  const touched = () => { lastInput = Date.now(); };
  for (const type of ['pointerup', 'keydown'] as const) term.element?.addEventListener(type, touched, { capture: true, signal });
  const osc52 = term.parser.registerOscHandler(52, data => {
    const payload = data.slice(data.indexOf(';') + 1);
    if (payload === '?' || Date.now() - lastInput > 3000) return true;
    try {
      const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
      void copy(new TextDecoder().decode(bytes));
    } catch { /* Ignore malformed clipboard requests. */ }
    return true;
  });
  button.addEventListener('pointerdown', event => event.preventDefault(), { signal });
  button.addEventListener('click', () => { void copy(); term.focus(); }, { signal });
  term.element?.addEventListener('keydown', event => {
    if (event.isComposing || event.altKey || event.key.toLowerCase() !== 'c') return;
    if (!(event.ctrlKey || event.metaKey) || !term.hasSelection()) return;
    // Preserve Ctrl+C as interrupt when there is no selection. Never send copy to the PTY.
    event.preventDefault();
    event.stopPropagation();
    void copy();
  }, { capture: true, signal });
  return () => { controller.abort(); selection.dispose(); osc52.dispose(); button.remove(); };
}
