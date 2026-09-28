import { asanaTaskPrompt, type AsanaState, type AsanaTask } from '../../shared/asana';
import type { AgentProvider, AgentEffort } from '../../shared/protocol';
import { store } from '../state';
import { h, openModal, timeAgo, toast, type Modal } from './dom';
import { openAsk } from './ask';

interface Actions {
  assign(prompt: string, title: string): void;
  queue(prompt: string, title: string, provider?: AgentProvider, model?: string, effort?: AgentEffort): void;
}

export function openAsanaBoard(actions: Actions) {
  const floor = store.floor;
  if (!floor || !store.project) return;
  const controller = new AbortController();
  let closed = false;
  let busy = false;
  let editing = false;
  let state: AsanaState | undefined;
  let detail: Modal | undefined;
  const body = h('div.body');
  const status = h('span.board-status', { role: 'status' }, 'Loading…');
  const notice = h('div.asana-notice', { role: 'alert', hidden: true });
  const projectLink = h('a', { target: '_blank', rel: 'noopener noreferrer', hidden: true }, 'Open project in Asana ↗');
  const refresh = h('button.btn', { type: 'button', onclick: () => void request('POST', undefined, true) }, 'Refresh');
  const connection = h('button.btn', { type: 'button', hidden: !store.me.admin, onclick: () => { editing = !editing; renderSettings(); } }, 'Connection');
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close Asana board' }, '✕');
  const project = h('input', { type: 'text', id: 'asana-project', 'aria-label': 'Asana project URL or ID', placeholder: 'https://app.asana.com/…', required: true, maxlength: 2048 });
  const token = h('input', { type: 'password', id: 'asana-token', 'aria-label': 'Personal access token', autocomplete: 'new-password', maxlength: 4096 });
  const save = h('button.btn.primary', { type: 'submit' }, 'Connect Asana');
  const disconnect = h('button.btn.danger', { type: 'button', onclick: () => void request('DELETE') }, 'Disconnect');
  const form = h('form.asana-setup', { hidden: true },
    h('p', {}, 'Connect an Asana project to this floor. Tasks can be handed to workers here.'),
    h('label', { for: 'asana-project' }, 'Asana project URL or ID'), project,
    h('label', { for: 'asana-token' }, 'Personal access token'), token,
    h('p.asana-help', {}, h('a', { href: 'https://app.asana.com/0/my-apps', target: '_blank', rel: 'noopener noreferrer' }, 'Create a token in Asana ↗'), ' · Saved on the office server. Leave blank to keep the saved token.'),
    h('div.asana-buttons', {}, save, disconnect));
  const el = h('div.modal.board.asana-board', { role: 'dialog', 'aria-label': 'Asana tasks' },
    h('header', {}, h('h2', {}, 'Asana tasks'), status, refresh, connection, close),
    h('div.asana-project-link', {}, projectLink), notice, form, body);

  function renderSettings() {
    form.hidden = !store.me.admin || (!editing && !!state?.hasToken);
    save.textContent = state?.hasToken ? 'Save connection' : 'Connect Asana';
    disconnect.hidden = !state?.project;
    connection.hidden = !store.me.admin;
  }

  function render() {
    status.textContent = busy ? 'Loading…' : state?.fetchedAt ? `Updated ${timeAgo(state.fetchedAt)}` : '';
    refresh.disabled = busy || !state?.hasToken;
    save.disabled = busy;
    disconnect.disabled = busy;
    project.disabled = busy;
    token.disabled = busy;
    renderSettings();
    body.replaceChildren();
    if (!state) { body.append(h('p.board-error', {}, busy ? 'Loading Asana…' : 'Could not load the Asana board.')); return; }
    if (state.project) {
      projectLink.href = state.project.url;
      projectLink.textContent = `${state.project.name} ↗`;
    }
    projectLink.hidden = !state.project;
    if (!state.hasToken) {
      body.append(h('p.board-error', {}, store.me.admin ? 'Connect Asana above to load this project’s tasks.' : 'Ask an office admin to connect an Asana project to this floor.'));
      return;
    }
    if (!state.items.length) { body.append(h('p.board-error', {}, state.error ? 'Tasks could not be loaded.' : 'No incomplete tasks in this project.')); return; }
    const columns = new Map<string, AsanaTask[]>();
    for (const task of state.items) {
      const list = columns.get(task.section) ?? [];
      list.push(task); columns.set(task.section, list);
    }
    for (const [section, tasks] of columns) {
      body.append(h('section.column', {}, h('h4', {}, section, h('span', {}, tasks.length)),
        h('ul', {}, ...tasks.map(task => h('li', {}, h('button.card.asana-card', { type: 'button', onclick: () => openTask(task) },
          h('span.ttl', {}, task.name), h('span.meta', {}, [task.assignee ? `👤 ${task.assignee}` : 'Unassigned', task.dueOn ? `Due ${task.dueOn}` : ''].filter(Boolean).join(' · '))))))));
    }
  }

  function showNotice(text: string) { notice.textContent = text; notice.hidden = !text; }
  async function request(method = 'GET', payload?: { project: string; token: string }, force = false) {
    if (busy || closed || store.floor !== floor) return;
    busy = true; render();
    try {
      const response = await fetch(`/api/asana${force ? '/refresh' : ''}?floor=${encodeURIComponent(floor!)}`, {
        method, headers: payload ? { 'content-type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Asana.');
      if (closed || store.floor !== floor) return;
      state = data;
      if (method !== 'GET') { editing = false; token.value = ''; detail?.close(); }
      if (!editing) project.value = state?.project?.gid ?? '';
      showNotice([state?.error, state?.truncated ? 'Showing the first 1,000 incomplete tasks. Open Asana to see the rest.' : ''].filter(Boolean).join(' '));
    } catch (err) {
      if (!closed) showNotice((err as Error).message || 'Could not reach the office. Try again.');
    } finally {
      // Never retain the submitted token in the form after a request (including failed validation).
      if (payload) token.value = '';
      busy = false;
      if (!closed) render();
    }
  }

  function openTask(task: AsanaTask) {
    if (closed || store.floor !== floor) return;
    const prompt = asanaTaskPrompt(task);
    const taskClose = h('button.btn.close', { 'aria-label': 'Close task' }, '✕');
    const assign = h('button.btn.primary', { type: 'button', onclick: () => {
      if (store.floor !== floor) return;
      detail?.close(); actions.assign(prompt, task.name);
    } }, 'Hand to worker');
    const queue = h('button.btn', { type: 'button', onclick: () => {
      detail?.close();
      openAsk({ title: 'Queue Asana task', initial: prompt, newDesk: 'Next free worker', workers: [], providerOption: true, worktreeOption: false,
        onSubmit: (text, _to, _worktree, provider, model, effort) => {
          if (store.floor !== floor) { toast('Return to the task’s floor before queueing it.', 'warn'); return; }
          actions.queue(text, `Asana: ${task.name}`.slice(0, 200), provider, model, effort);
        } });
    } }, 'Add to queue');
    detail = openModal(h('div.modal.asana-task', { role: 'dialog', 'aria-label': task.name },
      h('header', {}, h('h2', {}, task.name), taskClose),
      h('div.body', {}, h('p', {}, [task.section, task.assignee, task.dueOn ? `Due ${task.dueOn}` : ''].filter(Boolean).join(' · ')),
        h('a', { href: task.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open task in Asana ↗'),
        h('p.asana-description', {}, task.notes || 'No description provided.')),
      h('footer', {}, queue, assign)), { doing: 'reading an Asana task' });
    taskClose.addEventListener('click', () => detail?.close());
  }

  form.addEventListener('submit', e => { e.preventDefault(); void request('POST', { project: project.value, token: token.value }); });
  const modal = openModal(el, { doing: 'at the Asana board', onClose: () => {
    closed = true; controller.abort(); clearInterval(timer); unsubscribe(); unsubMe(); detail?.close(); token.value = '';
  } });
  const unsubscribe = store.on('floor', () => { if (store.floor !== floor) modal.close(); });
  const unsubMe = store.on('me', renderSettings);
  const timer = setInterval(() => { if (!editing && token.value === '') void request(); }, 90_000);
  close.addEventListener('click', () => modal.close());
  void request();
}
