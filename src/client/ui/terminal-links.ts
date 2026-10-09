/** Use browser link navigation without xterm's blank-window opener. */
export function openTerminalLink(event: MouseEvent, uri: string): void {
  const url = new URL(uri, location.href);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  event.preventDefault();
  const link = document.createElement('a');
  link.href = url.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.hidden = true;
  document.body.append(link);
  try {
    link.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      ctrlKey: event.ctrlKey, metaKey: event.metaKey,
      shiftKey: event.shiftKey, altKey: event.altKey,
    }));
  } finally {
    link.remove();
  }
}
