import { DROP_MAX_BYTES, droppedPaths } from '../../shared/drops';

/** Upload clipboard, picker and dropped files once, before xterm's text-only paste handler. */
export function bindTerminalFiles(host: HTMLElement, button: HTMLButtonElement, options: {
  floor: string; worker: string; modal: HTMLElement; backdrop: HTMLElement; prompt?: HTMLInputElement;
  active(): boolean; paste(text: string): void; notice(text: string, error?: boolean): void;
}): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  let pending = false;
  let dragDepth = 0;
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.multiple = true;
  picker.hidden = true;
  host.append(picker);

  async function upload(files: File[], prompt?: HTMLInputElement) {
    if (!files.length) return;
    if (pending) return options.notice('Wait for the current file upload', true);
    if (!options.active()) return options.notice('Wait for the terminal to connect', true);
    const oversized = files.find(file => file.size > DROP_MAX_BYTES);
    if (oversized) return options.notice(`${oversized.name || 'That file'} is too big (${DROP_MAX_BYTES / 1024 / 1024} MB at most)`, true);
    pending = true;
    button.disabled = true;
    button.textContent = 'Uploading…';
    options.modal.classList.add('uploading');
    try {
      const paths: string[] = [];
      for (const file of files) {
        const query = new URLSearchParams({ floor: options.floor, worker: options.worker, name: file.name });
        const response = await fetch(`/api/term/drop?${query}`, {
          method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file, signal,
        });
        const result = await response.json().catch(() => ({})) as { path?: string; error?: string };
        if (!response.ok || !result.path) throw new Error(result.error || 'File upload failed');
        paths.push(result.path);
      }
      if (signal.aborted || !options.active()) return;
      // Paths are escaped for shells and never submitted. Keep edits made while the upload ran.
      const text = `${droppedPaths(paths)} `;
      if (prompt) {
        const start = prompt.selectionStart ?? prompt.value.length;
        const end = prompt.selectionEnd ?? start;
        const separator = start > 0 && !/\s/.test(prompt.value[start - 1]) ? ' ' : '';
        prompt.setRangeText(separator + text, start, end, 'end');
        prompt.dispatchEvent(new Event('input', { bubbles: true }));
      } else options.paste(text);
      options.notice(`${paths.length === 1 ? 'File path' : 'File paths'} added. Add your instructions, then ${prompt ? 'tap Send' : 'press Enter'}.`);
    } catch (error) {
      if (!signal.aborted) options.notice(error instanceof Error ? error.message : 'File upload failed', true);
    } finally {
      pending = false;
      button.disabled = false;
      button.textContent = '📎 Attach files';
      options.modal.classList.remove('uploading');
      picker.value = '';
    }
  }

  const paste = (event: ClipboardEvent) => {
    const data = event.clipboardData;
    let files = Array.from(data?.files ?? []);
    if (!files.length) files = Array.from(data?.items ?? []).flatMap(item => {
      const file = item.kind === 'file' ? item.getAsFile() : null;
      return file ? [file] : [];
    });
    if (!files.length) return; // Plain text retains normal browser/xterm behavior.
    event.preventDefault();
    event.stopImmediatePropagation();
    void upload(files, event.currentTarget === options.prompt ? options.prompt : undefined);
  };
  host.addEventListener('paste', paste, { capture: true, signal });
  options.prompt?.addEventListener('paste', paste, { capture: true, signal });
  button.addEventListener('click', () => picker.click(), { signal });
  picker.addEventListener('change', () => { void upload(Array.from(picker.files ?? []), options.prompt); }, { signal });

  const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');
  const dragEnd = () => {
    dragDepth = 0;
    options.modal.classList.remove('dropping');
  };
  // Keep the whole backdrop as a drop zone so near misses cannot navigate away from the office.
  options.backdrop.addEventListener('dragenter', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth++;
    options.modal.classList.add('dropping');
  }, { signal });
  options.backdrop.addEventListener('dragover', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
  }, { signal });
  options.backdrop.addEventListener('dragleave', event => {
    if (hasFiles(event) && --dragDepth <= 0) dragEnd();
  }, { signal });
  options.backdrop.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragEnd();
    void upload(Array.from(event.dataTransfer!.files), options.prompt);
  }, { signal });
  return () => {
    abort.abort();
    picker.remove();
    dragEnd();
  };
}
