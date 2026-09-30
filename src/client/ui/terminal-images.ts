/** Capture image pastes before xterm's text-only handler. Plain text keeps its normal behavior. */
export function bindTerminalImages(host: HTMLElement, button: HTMLButtonElement, options: {
  floor: string; worker: string; active(): boolean; paste(text: string): void; notice(text: string, error?: boolean): void;
}): () => void {
  let disposed = false;
  let pending = false;
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/png,image/jpeg,image/gif,image/webp';
  const abort = new AbortController();
  async function upload(file: File) {
    if (pending) return options.notice('Wait for the current image upload', true);
    if (!options.active()) return options.notice('Wait for the terminal to connect', true);
    if (file.size > 10 * 1024 * 1024) return options.notice('Images must be under 10 MB', true);
    pending = true;
    button.disabled = true;
    button.textContent = 'Uploading…';
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read the image'));
        reader.readAsDataURL(file);
      });
      if (disposed) return;
      const params = new URLSearchParams({ floor: options.floor, worker: options.worker });
      const response = await fetch(`/api/terminal/image?${params}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: file.type, data }), signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Image upload failed');
      if (disposed || !options.active()) return;
      // Quote the local path so it also works when the terminal is a shell. Never submit it.
      const quoted = "'" + String(result.path).replace(/'/g, "'\\''") + "' ";
      options.paste(quoted);
      options.notice('Image path added. Add your instructions, then press Enter.');
    } catch (error) {
      if (!disposed) options.notice(error instanceof Error ? error.message : 'Image upload failed', true);
    } finally {
      pending = false;
      button.disabled = false;
      button.textContent = '📎 Attach image';
      picker.value = '';
    }
  }
  const paste = (event: ClipboardEvent) => {
    const item = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void upload(file);
  };
  const choose = () => picker.click();
  picker.addEventListener('change', () => { if (picker.files?.[0]) void upload(picker.files[0]); });
  host.addEventListener('paste', paste, true);
  button.addEventListener('click', choose);
  return () => {
    disposed = true;
    abort.abort();
    host.removeEventListener('paste', paste, true);
    button.removeEventListener('click', choose);
  };
}
