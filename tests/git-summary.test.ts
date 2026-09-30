import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseGitSummary} from '../src/server/git-summary.js';
test('counts changed files once, including staged/unstaged edits, renames, untracked and conflicts',()=>{
 const text=['# branch.head main','# branch.upstream origin/main','# branch.ab +3 -2','1 MM N... 100644 100644 100644 abc abc both.txt','2 R. N... 100644 100644 100644 abc abc R100 new name','old name','? untracked\nfile','u UU N... 100644 100644 100644 100644 abc abc abc conflicted'].join('\0')+'\0';
 const s=parseGitSummary(text,123);
 assert.equal(s.changed,4);assert.equal(s.staged,2);assert.equal(s.unstaged,1);assert.equal(s.untracked,1);assert.equal(s.conflicts,1);
 assert.equal(s.ahead,3);assert.equal(s.behind,2);assert.equal(s.upstream,'origin/main');
});
test('missing upstream and detached HEAD do not pretend push/pull counts are zero',()=>{
 const s=parseGitSummary('# branch.head (detached)\0',1);
 assert.equal(s.branch,'Detached HEAD');assert.equal(s.ahead,undefined);assert.equal(s.behind,undefined);assert.equal(s.changed,0);
});

test('reads real repository status and cached origin ahead/behind counts without fetching',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const path=await import('node:path');
 const {execFileSync}=await import('node:child_process');
 const {GitSummaryReader}=await import('../src/server/git-summary.js');
 const dir=await mkdtemp(path.join(tmpdir(),'office-git-summary-'));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,stdio:'pipe'}).toString().trim();
 try {
  git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('config','commit.gpgsign','false');
  await writeFile(path.join(dir,'tracked.txt'),'one');git('add','.');git('commit','-m','base');
  git('remote','add','origin',path.join(dir,'no-network-remote'));
  git('update-ref','refs/remotes/origin/main','HEAD');git('branch','--set-upstream-to=origin/main');
  await writeFile(path.join(dir,'tracked.txt'),'two');git('commit','-am','ahead');
  await writeFile(path.join(dir,'tracked.txt'),'three');await writeFile(path.join(dir,'new file.txt'),'new');
  const summary=await new GitSummaryReader(dir).read();
  assert.equal(summary.error,undefined);assert.equal(summary.branch,'main');assert.equal(summary.changed,2);
  assert.equal(summary.unstaged,1);assert.equal(summary.untracked,1);assert.equal(summary.ahead,1);assert.equal(summary.behind,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
