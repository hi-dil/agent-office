import type { DiskUsage } from '../../../shared/disk';

/** Disk capacity changes slowly; keep it separate from CPU history and skip hidden tabs. */
export function watchDisk(changed: (disk: DiskUsage | null) => void): () => void {
  let stopped = false;
  let pending: AbortController | undefined;
  async function refresh() {
    if (document.hidden || pending || stopped) return;
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/machine-disk', { signal: controller.signal });
      if (!response.ok) throw new Error('Disk reading unavailable');
      const { disk } = await response.json() as { disk: DiskUsage | null };
      if (!stopped) changed(disk);
    } catch {
      if (!stopped) changed(null);
    } finally {
      clearTimeout(timeout);
      pending = undefined;
    }
  }
  const visible = () => { if (!document.hidden) void refresh(); };
  document.addEventListener('visibilitychange', visible);
  const timer = setInterval(() => void refresh(), 15_000);
  void refresh();
  return () => { stopped = true; pending?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
}

const gb = (bytes: number) => `${(bytes / 2 ** 30).toFixed(1)} GiB`;

/** A compact capacity bar beneath CPU and memory, with an explicit unavailable state. */
export function drawDisk(g: CanvasRenderingContext2D, disk: DiskUsage | null | undefined) {
  const x = 30, y = 355, w = 860;
  g.fillStyle = '#25283d';
  g.beginPath(); g.roundRect(x, y, w, 82, 14); g.fill();
  g.textAlign = 'left'; g.fillStyle = '#ffffff';
  g.font = '800 25px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText('Disk', x + 18, y + 30);
  g.font = '700 22px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillStyle = '#9aa0b8';
  g.fillText(disk ? `${gb(disk.used)} of ${gb(disk.total)} · ${gb(disk.available)} available` : disk === undefined ? 'Reading disk…' : 'Disk reading unavailable', x + 95, y + 30);
  if (!disk) return;
  const color = disk.percent >= 90 ? '#ef476f' : disk.percent >= 70 ? '#ffd166' : '#06d6a0';
  g.textAlign = 'right'; g.fillStyle = color; g.fillText(`${disk.percent}%`, x + w - 18, y + 30);
  g.fillStyle = '#3a3d55'; g.fillRect(x + 18, y + 49, w - 36, 14);
  g.fillStyle = color; g.fillRect(x + 18, y + 49, (w - 36) * Math.min(100, Math.max(0, disk.percent)) / 100, 14);
}
