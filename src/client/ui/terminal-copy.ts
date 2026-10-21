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

  const copy = async () => {
    const text = term.getSelection();
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
  return () => { controller.abort(); selection.dispose(); button.remove(); };
}
