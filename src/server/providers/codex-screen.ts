/** Recognize Codex's input area, not quoted prompts earlier in the conversation. */
export function codexReady(text: string): boolean {
  const footer = text.trimEnd().split('\n').slice(-8).join('\n');
  const status = footer.split('\n').filter(line => !/^\s*›/.test(line)).join('\n');
  if (codexBlocked(footer)) return false;
  return /^\s*›[^\n]*$/m.test(footer) && /(?:\bReady\s*[·•]|\d+% context left)/.test(status)
    && !/esc to interrupt|Would you like|Do you want|approve|Allow once|Sign in/i.test(status);
}

/** Match setup menu lines, not a draft or conversation mentioning login or trust. */
export function codexBlocked(text: string): string | undefined {
  const lines = text.split('\n').map(line => line.trim().replace(/^│\s*|\s*│$/g, '')
    .replace(/^(?:[›❯>]\s*)?\d+[.)]\s*/, ''));
  if (lines.some(line => /^(?:Sign in with ChatGPT|Sign in with a device code|Provide your own API key|Paste your API key)\s*:?$/i.test(line))) {
    return 'Sign in to Codex — open the terminal';
  }
  if (lines.some(line => /^(?:Do you trust (?:the contents of this directory|this (?:folder|directory))\?|Enable hooks for this session\??|Approve hooks for this session\??)$/i.test(line))) {
    return 'Review Codex setup permissions — open the terminal';
  }
  return undefined;
}
