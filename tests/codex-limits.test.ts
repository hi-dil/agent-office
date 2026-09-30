import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCodexLimits} from '../src/server/codex-limits.js';
test('Codex usage keeps percentages and converts weekly reset timestamps to milliseconds',()=>{
 const state=parseCodexLimits({rateLimits:{planType:'pro',primary:{usedPercent:12,windowDurationMins:300,resetsAt:1800000000},secondary:{usedPercent:47,windowDurationMins:10080,resetsAt:1800100000}}},123);
 assert.equal(state.plan,'pro');assert.equal(state.at,123);
 assert.deepEqual(state.windows[1],{label:'Week',pct:47,resetsAt:1800100000000});
});
test('unknown or absent limits are not represented as zero usage',()=>{
 assert.equal(parseCodexLimits({}).windows.length,0);
 assert.equal(parseCodexLimits({rateLimits:{secondary:{usedPercent:'12',windowDurationMins:10080}}}).windows.length,0);
 assert.equal(parseCodexLimits({rateLimits:{secondary:{usedPercent:55,windowDurationMins:null}}}).windows[0].label,'Secondary');
});
test('prefers the Codex bucket and excludes unrelated quota buckets',()=>{
 const state=parseCodexLimits({rateLimits:{secondary:{usedPercent:1,windowDurationMins:10080}},rateLimitsByLimitId:{codex:{secondary:{usedPercent:80,windowDurationMins:10080}}}});
 assert.equal(state.windows[0].pct,80);
});

test('weekly limits can be reported in the primary window',()=>{
 assert.equal(parseCodexLimits({rateLimits:{primary:{usedPercent:17,windowDurationMins:10080,resetsAt:1800000000}}}).windows[0].label,'Week');
});
