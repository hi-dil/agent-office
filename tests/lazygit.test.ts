import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openProjectLazygit } from '../src/server/lazygit.js';
import type { WorkerInfo } from '../src/shared/protocol.js';
import { DESK_BY_ID, deskBuilt } from '../src/shared/layout.js';
test('reuses a running lazygit terminal and resumes an exited one', () => {
  const worker={id:'git',kind:'shell',tool:'lazygit',status:'idle'} as WorkerInfo;
  let resumes=0;
  const workers={list:()=>[worker],resume:()=>{resumes++;return undefined;},spawn:()=>{throw Error('must reuse');}};
  assert.equal(openProjectLazygit(workers,'Sam'),worker);
  assert.equal(resumes,0);
  worker.status='exited';
  assert.equal(openProjectLazygit(workers,'Sam'),worker);
  assert.equal(resumes,1);
});
test('starts lazygit in a free ordinary seat with a fixed tool and no worktree', () => {
  let args: unknown[]=[];
  const worker={id:'new'} as WorkerInfo;
  const result=openProjectLazygit({list:()=>[],resume:()=>undefined,spawn:(...a:unknown[])=>{args=a;return worker;}},'Sam');
  assert.equal(result,worker);
  assert.equal(args[1],'Sam');
  assert.equal(args[3],false);
  assert.equal(args[4],'shell');
  assert.equal(args[12],'lazygit');
});
test('skips unbuilt wing desks and preserves the signed-in owner', () => {
  const occupied = [...DESK_BY_ID.values()]
    .filter(d => !d.station && !d.room && !d.id.startsWith('bean'))
    .filter(d => deskBuilt(d, 0))
    .map(d => ({ id: d.id, deskId: d.id, kind: 'agent' } as WorkerInfo));
  let args: unknown[] = [];
  const result = openProjectLazygit({
    list: () => occupied,
    resume: () => undefined,
    spawn: (...a: unknown[]) => { args = a; return { id: 'git' } as WorkerInfo; },
  }, 'Sam', 0, 'account-1');
  assert.notEqual(typeof result, 'string');
  assert.equal(deskBuilt(DESK_BY_ID.get(args[0] as string)!, 0), true);
  assert.equal(args[9], 'account-1');
  assert.equal(args[12], 'lazygit');
});
