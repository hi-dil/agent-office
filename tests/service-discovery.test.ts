import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockerServices, projectForDirectory, isContainerProxy } from '../src/server/service-discovery.js';
const projects = [{ id: 'shrm', dir: '/work/shrm' }, { id: 'nested', dir: '/work/shrm/other' }];
test('matches the nearest project and excludes unrelated prefix siblings', () => {
  assert.equal(projectForDirectory('/work/shrm/.worktrees/feature', projects)?.id, 'shrm');
  assert.equal(projectForDirectory('/work/shrm/other/src', projects)?.id, 'nested');
  assert.equal(projectForDirectory('/work/shrm-other', projects), undefined);
});
test('Docker discovery uses Compose directory labels and published TCP bindings only', () => {
  const text = JSON.stringify({ id:'abc', name:'/shrm-nginx-1', dir:'/work/shrm', service:'nginx', ports: {
    '80/tcp':[{HostIp:'100.71.28.27',HostPort:'8180'}], '443/tcp':null,
    '53/udp':[{HostIp:'0.0.0.0',HostPort:'5353'}],
  }}) + '\n' + JSON.stringify({id:'other',dir:'/work/unrelated',ports:{'80/tcp':[{HostIp:'',HostPort:'9000'}]}});
  const services=dockerServices(text,projects);
  assert.equal(services.length,1);
  assert.equal(services[0].floorId,'shrm');
  assert.equal(services[0].host,'100.71.28.27');
  assert.equal(services[0].port,8180);
  assert.match(services[0].command,/Docker.*nginx/);
});
test('Docker wildcard addresses use loopback and malformed records are ignored', () => {
  const result=dockerServices('bad json\n'+JSON.stringify({id:'abc',dir:'/work/shrm',service:'vite',ports:{'5173/tcp':[{HostIp:'0.0.0.0',HostPort:'5177'},{HostIp:'::',HostPort:'5177'}]}}),projects);
  assert.equal(result.length,1);
  assert.equal(result[0].host,'127.0.0.1');
});

test('shared Docker host proxies cannot be attributed using their working directory', () => {
  assert.equal(isContainerProxy('/Applications/OrbStack.app/Contents/MacOS/OrbStack Helper vmgr'), true);
  assert.equal(isContainerProxy('/usr/bin/docker-proxy -host-port 8180'), true);
  assert.equal(isContainerProxy('node /work/shrm/node_modules/.bin/vite'), false);
});
