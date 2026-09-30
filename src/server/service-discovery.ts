import path from 'node:path';

export interface ServiceProject { id: string; dir: string }
export interface DockerService {
  id: string; floorId: string; root: string; cwd: string; host: string; port: number; command: string;
}

export function projectForDirectory(cwd: string, projects: ServiceProject[]): ServiceProject | undefined {
  return projects.filter(p => {
    const relative = path.relative(p.dir, cwd);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  }).sort((a, b) => b.dir.length - a.dir.length)[0];
}

/** Only published ports from containers belonging to an office checkout are candidates. */
export function dockerServices(text: string, projects: ServiceProject[]): DockerService[] {
  const result: DockerService[] = [];
  for (const line of text.split('\n')) {
    try {
      const c = JSON.parse(line);
      if (typeof c.dir !== 'string' || !path.isAbsolute(c.dir) || typeof c.id !== 'string') continue;
      const project = projectForDirectory(c.dir, projects);
      if (!project || !c.ports || typeof c.ports !== 'object') continue;
      const seen = new Set<number>();
      for (const [containerPort, bindings] of Object.entries(c.ports)) {
        if (!containerPort.endsWith('/tcp') || !Array.isArray(bindings)) continue;
        for (const binding of bindings) {
          const port = Number(binding?.HostPort);
          if (!Number.isInteger(port) || port < 1 || port > 65535 || seen.has(port) || typeof binding?.HostIp !== 'string') continue;
          const host = ['', '0.0.0.0', '::'].includes(binding.HostIp) ? '127.0.0.1' : binding.HostIp;
          seen.add(port);
          result.push({ id: c.id, floorId: project.id, root: project.dir, cwd: c.dir, host, port, command: `Docker · ${String(c.service || c.name || 'container').replace(/^\//, '').slice(0, 70)}` });
        }
      }
    } catch { /* Docker unavailable or an incomplete record: keep host discovery working. */ }
  }
  return result;
}

/** VM/proxy processes multiplex unrelated projects; their cwd cannot establish ownership. */
export function isContainerProxy(args: string): boolean {
  return /OrbStack|com\.docker\.backend|docker-proxy|vpnkit|rootlesskit/.test(args);
}
