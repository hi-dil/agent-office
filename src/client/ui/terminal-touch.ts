import type { Terminal } from '@xterm/xterm';

/** xterm 6 handles wheels but not touch swipes. Scroll history locally and route TUI gestures as wheels. */
export function bindTerminalTouch(term: Terminal): () => void {
  const screen = term.element?.querySelector<HTMLElement>('.xterm-screen');
  if (!screen) return () => {};
  const controller = new AbortController();
  const { signal } = controller;
  let gesture: { id: number; x: number; y: number; scrolling: boolean; remainder: number } | undefined;
  const reset = () => { gesture = undefined; };

  screen.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return reset();
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, scrolling: false, remainder: 0 };
  }, { passive: true, signal });
  screen.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 1) return reset();
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) return reset();
    const deltaY = gesture.y - touch.clientY;
    if (!gesture.scrolling) {
      const deltaX = Math.abs(touch.clientX - gesture.x);
      // Leave taps, long presses, horizontal gestures and pinch zoom to the browser.
      if (Math.max(deltaX, Math.abs(deltaY)) < 6) return;
      if (deltaX > Math.abs(deltaY)) return reset();
      gesture.scrolling = true;
    }
    // Keep the page still and suppress the compatibility click that would open the keyboard.
    event.preventDefault();
    gesture.y = touch.clientY;
    if (term.buffer.active.type === 'normal' && term.modes.mouseTrackingMode === 'none') {
      const rowHeight = screen.getBoundingClientRect().height / term.rows;
      if (rowHeight <= 0) return;
      gesture.remainder += deltaY;
      const lines = Math.trunc(gesture.remainder / rowHeight);
      if (lines) term.scrollLines(lines);
      gesture.remainder -= lines * rowHeight;
      return;
    }
    screen.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY,
      clientX: touch.clientX, clientY: touch.clientY,
    }));
  }, { passive: false, signal });
  screen.addEventListener('touchend', reset, { passive: true, signal });
  screen.addEventListener('touchcancel', reset, { passive: true, signal });
  return () => { reset(); controller.abort(); };
}
