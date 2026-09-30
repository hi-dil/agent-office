import * as THREE from 'three';
import type {PlanLimits, ProviderPlanLimits} from '../../shared/protocol';
import {fmtReset} from '../ui/limits';

/** Two account-level weekly meters; missing data never looks like unused quota. */
export class PlanLimitsTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  constructor() {
    this.canvas.width = 1200; this.canvas.height = 300;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  render(state: PlanLimits) {
    const g = this.ctx;
    g.fillStyle = '#1e2636'; g.fillRect(0, 0, 1200, 300);
    this.provider('Codex', state.codex, 35);
    this.provider('Claude', state, 635);
    g.fillStyle = '#b7c8d4'; g.textAlign = 'center';
    g.font = '500 22px Nunito, system-ui, sans-serif';
    g.fillText('Account usage · E for details / refresh', 600, 282);
    this.texture.needsUpdate = true;
  }
  private provider(name: string, state: ProviderPlanLimits | undefined, x: number) {
    const g = this.ctx;
    const week = state?.windows.find(w => w.label.toLowerCase() === 'week');
    const stale = !!state?.at && (Date.now() - state.at > 10 * 60_000 || !!state.error || (!!week?.resetsAt && week.resetsAt <= Date.now()));
    g.textAlign = 'left'; g.fillStyle = '#fffaf3';
    g.font = '800 38px Nunito, system-ui, sans-serif'; g.fillText(`${name} · weekly`, x, 52);
    g.font = '900 45px Nunito, system-ui, sans-serif';
    const color = week ? week.pct >= 90 ? '#ef476f' : week.pct >= 75 ? '#ffd166' : '#7cf29a' : '#b7c8d4';
    g.fillStyle = color;
    g.fillText(week ? `${Math.round(week.pct)}% used${stale ? ' *' : ''}` : 'Unavailable', x, 114);
    g.fillStyle = '#394457'; g.fillRect(x, 137, 525, 17);
    if (week) { g.fillStyle = color; g.fillRect(x, 137, 525 * week.pct / 100, 17); }
    g.fillStyle = '#b7c8d4'; g.font = '500 24px Nunito, system-ui, sans-serif';
    g.fillText(week?.resetsAt ? `Resets ${fmtReset(week.resetsAt)}` : 'No weekly reset reported', x, 197);
    g.fillText(stale ? '* Last reported; awaiting refresh' : state?.at ? `Updated ${new Date(state.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : state?.error ? 'Provider unavailable · E for details' : 'Waiting for provider data', x, 232);
  }
}
