import * as THREE from 'three';
import type { GitSummary } from '../../../shared/git-summary';
import { timeAgo } from '../../ui/dom';
/** Live summary of the floor checkout; E opens the shared Git terminal. */
export class LazygitBoardTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  constructor() {
    this.canvas.width = 800; this.canvas.height = 600;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.render();
  }
  render(state?: GitSummary) {
    const g=this.ctx;
    g.fillStyle='#23303b';g.fillRect(0,0,800,600);g.textAlign='center';
    const text=(value: string,y: number,size: number,color='#fffaf3')=>{
      g.fillStyle=color;g.font=`800 ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
      g.fillText(clip(g,value,730),400,y);
    };
    text(state?.branch ?? 'Project Git status',70,42,'#7cf29a');
    if(!state || state.error) {
      text(state?.error ?? 'Loading…',250,42,'#b7c8d4');
    }else{
      text(`${state.changed} uncommitted ${state.changed===1?'file':'files'}`,166,54);
      text(`${state.staged} staged · ${state.unstaged} unstaged · ${state.untracked} new`,222,28,'#b7c8d4');
      if(state.conflicts)text(`${state.conflicts} conflicted`,263,28,'#ef476f');
      text(state.ahead===undefined||state.behind===undefined?'No upstream comparison':`↑ ${state.ahead} to push     ↓ ${state.behind} to pull`,340,42,'#7cf29a');
      text(state.upstream ? `vs ${state.upstream}` : 'No tracking branch configured',393,28,'#b7c8d4');
      text(state.fetchedAt ? `Fetched ${timeAgo(state.fetchedAt)} · cached refs` : 'Remote refs not fetched here yet',450,24,'#b7c8d4');
    }
    text('E  Open Git terminal',550,32,'#7cf29a');
    this.texture.needsUpdate=true;
  }
}

function clip(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
