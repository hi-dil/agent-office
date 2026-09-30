import type {GitSummary} from '../shared/git-summary';
import {store} from './state';

/** Keeps the wall display on the active floor, even if an old request returns after a move. */
export function watchGitSummary(render: (state?: GitSummary) => void): () => void {
  let active: AbortController | undefined;
  let closed=false;
  let currentFloor: string | null=null;
  const refresh=async()=>{
    const floor=store.floor;
    if(active && currentFloor===floor)return;
    active?.abort(); currentFloor=floor;
    if(!floor){active=undefined;render();return;}
    const request=new AbortController();active=request;
    const timeout=setTimeout(()=>request.abort(),12000);
    try {
      const response=await fetch(`/api/git-summary?${new URLSearchParams({floor})}`,{signal:request.signal,cache:'no-store'});
      if(!response.ok)throw Error('Git status unavailable');
      const state: GitSummary=await response.json();
      if(!closed && active===request && store.floor===floor)render(state);
    }catch{
      if(!closed && active===request && store.floor===floor)render({changed:0,staged:0,unstaged:0,untracked:0,conflicts:0,at:Date.now(),error:'Git status unavailable'});
    }finally{clearTimeout(timeout);if(active===request)active=undefined;}
  };
  const unsubscribe=store.on('floor',()=>{render();void refresh();});
  const timer=setInterval(()=>{if(!document.hidden)void refresh();},10000);
  void refresh();
  return ()=>{closed=true;active?.abort();clearInterval(timer);unsubscribe();};
}
