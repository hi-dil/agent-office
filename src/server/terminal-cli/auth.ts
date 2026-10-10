import { createInterface } from 'node:readline/promises';
import type { Office } from '../tunnel/office.js';

/** Credentials are used for this command only; never reuse another account's saved tunnel session. */
export async function authenticate(office: Office, name?: string, password = process.env.AGENT_OFFICE_PASSWORD): Promise<void> {
  if (password === undefined) {
    if (!process.stdin.isTTY) throw new Error('Run in a terminal to enter the password, or set AGENT_OFFICE_PASSWORD.');
    const options = await office.loginOptions();
    if (name === undefined && (options.accounts || !options.shared)) {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try { name = (await rl.question('Account name (blank for office password): ')).trim(); }
      finally { rl.close(); }
    }
    password = await hiddenPassword();
  }
  const error = await office.signIn(name ?? '', password);
  if (error) throw new Error(error);
}

function hiddenPassword(): Promise<string> {
  const { stdin, stderr } = process;
  const wasRaw = !!stdin.isRaw;
  const encoding = stdin.readableEncoding;
  return new Promise((resolve, reject) => {
    let typed = '';
    function cleanup() {
      stdin.off('data', data);
      process.off('SIGTERM', cancel); process.off('SIGHUP', cancel); process.off('SIGINT', cancel);
      stdin.setRawMode(wasRaw); stdin.pause(); stdin.setEncoding(encoding ?? undefined);
      stderr.write('\n');
    }
    function cancel() { cleanup(); reject(new Error('Sign-in cancelled.')); }
    function data(text: string) {
      if (text.startsWith('\x1b')) return;
      for (const ch of text) {
        if (ch === '\r' || ch === '\n') { cleanup(); resolve(typed); return; }
        if (ch === '\x03' || ch === '\x04') return cancel();
        if (ch === '\x7f' || ch === '\b') typed = [...typed].slice(0, -1).join('');
        else if (ch >= ' ') typed += ch;
      }
    }
    stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.on('data', data); stdin.resume();
    process.on('SIGTERM', cancel); process.on('SIGHUP', cancel); process.on('SIGINT', cancel);
    stderr.write('Office password: ');
  });
}
