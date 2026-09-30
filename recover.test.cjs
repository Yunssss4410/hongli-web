'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{recover}=require('./recover.cjs');
test('recovery stops immediately on confirmation',async()=>{let calls=0;const result=await recover({attempt:async()=>{calls++;return {status:'confirmed'};},sleep:()=>assert.fail('must not wait')});assert.equal(calls,1);assert.equal(result.status,'confirmed');});
test('provisional retries use 120 seconds and carry state and conflict latch',async()=>{
 const confirmed={asof:'2026-09-29',model:{state:{shares:0,waiting:true}}};const seed={status:'error',confirmed,dividendHealth:{blocked:true}};let n=0;const waits=[];
 const result=await recover({previous:seed,sleep:async ms=>waits.push(ms),attempt:async o=>{n++;assert.deepEqual(o.previous.confirmed,confirmed);assert.equal(o.previous.dividendHealth.blocked,true);assert.equal(o.recovery.attempt,n);return {...o.previous,status:n===3?'confirmed':'provisional'};}});
 assert.equal(result.status,'confirmed');assert.equal(n,3);assert.deepEqual(waits,[120000,120000]);
});
test('exhausted recovery returns diagnostic state, never invents confirmation',async()=>{let n=0;const waits=[];const old={asof:'2026-09-29'};const result=await recover({previous:{status:'provisional',confirmed:old},sleep:async ms=>waits.push(ms),attempt:async o=>{n++;return {...o.previous,status:'provisional'};}});assert.equal(n,8);assert.equal(waits.length,7);assert.equal(result.status,'provisional');assert.equal(result.confirmed,old);});
test('transport crash can recover, without resetting the previous confirmed state',async()=>{let n=0;const seed={confirmed:{asof:'2026-09-29'}};const r=await recover({previous:seed,sleep:async()=>{},attempt:async o=>{assert.equal(o.previous,seed);if(++n===1)throw Error('network');return {status:'confirmed'};}});assert.equal(n,2);assert.equal(r.status,'confirmed');});
test('final crash fails job rather than publishing earlier intermediate file',async()=>{let n=0;await assert.rejects(recover({maxAttempts:2,sleep:async()=>{},attempt:async()=>{if(++n===1)return {status:'provisional'};throw Error('disk write failed');}}),/disk write failed/);});
test('persistent network failure is bounded',async()=>{let n=0;await assert.rejects(recover({sleep:async()=>{},attempt:async()=>{n++;throw Error('offline');}}),/offline/);assert.equal(n,8);});
test('invalid retry budget is rejected',async()=>{await assert.rejects(recover({maxAttempts:0,attempt:()=>assert.fail()}),/budget/);await assert.rejects(recover({maxAttempts:9,attempt:()=>assert.fail()}),/budget/);});
