import {execFile} from 'node:child_process';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import type {GitSummary} from '../shared/git-summary.js';

export function parseGitSummary(text: string, at = Date.now()): GitSummary {
  const result: GitSummary = {changed:0, staged:0, unstaged:0, untracked:0, conflicts:0, at};
  const records=text.split('\0');
  for(let i=0;i<records.length;i++) {
    const record=records[i];
    if(record.startsWith('# branch.head ')) result.branch=record.slice(14)==='(detached)'?'Detached HEAD':record.slice(14);
    else if(record.startsWith('# branch.upstream ')) result.upstream=record.slice(18);
    else if(record.startsWith('# branch.ab ')) {
      const match=/^# branch.ab \+(\d+) -(\d+)$/.exec(record);
      if(match){result.ahead=Number(match[1]);result.behind=Number(match[2]);}
    } else if(record.startsWith('? ')){result.changed++;result.untracked++;}
    else if(record.startsWith('u ')){result.changed++;result.conflicts++;}
    else if(record.startsWith('1 ')||record.startsWith('2 ')) {
      result.changed++;
      const xy=record.split(' ',3)[1];
      if(xy[0]!=='.')result.staged++;
      if(xy[1]!=='.')result.unstaged++;
      if(record.startsWith('2 '))i++; // Rename's original path is a separate NUL-delimited record.
    }
  }
  return result;
}

function git(dir: string,args: string[]): Promise<string> {
  return new Promise((resolve,reject)=>execFile('git',args,{cwd:dir,encoding:'utf8',timeout:10_000,maxBuffer:8*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}},(error,out)=>error?reject(error):resolve(out)));
}

/** Coalesces reads from viewers; only local Git metadata is inspected. */
export class GitSummaryReader {
  private cached?: GitSummary;
  private pending?: Promise<GitSummary>;
  constructor(private dir: string) {}
  read(): Promise<GitSummary> {
    if(this.pending)return this.pending;
    if(this.cached && Date.now()-this.cached.at<5000)return Promise.resolve(this.cached);
    this.pending=this.inspect().then(value=>this.cached=value).finally(()=>{this.pending=undefined;});
    return this.pending;
  }
  private async inspect(): Promise<GitSummary> {
    try {
      const [text,fetchPath]=await Promise.all([
        git(this.dir,['status','--porcelain=v2','--branch','-z','--untracked-files=all']),
        git(this.dir,['rev-parse','--git-path','FETCH_HEAD']).catch(()=>''),
      ]);
      const summary=parseGitSummary(text);
      if(fetchPath.trim())summary.fetchedAt=(await stat(path.resolve(this.dir,fetchPath.trim())).catch(()=>undefined))?.mtimeMs;
      return summary;
    }catch{return {...parseGitSummary(''),error:'Git status unavailable'};}
  }
}
