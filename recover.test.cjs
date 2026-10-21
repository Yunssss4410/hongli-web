'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{recover}=require('./recover.cjs');
const at=()=>new Date('2026-09-30T08:00:00Z');
const done=(base={})=>({...base,status:'confirmed',generatedAt:at().toISOString(),calendar:{'2026-09-30':true},confirmed:{asof:'2026-09-30',model:{state:{pending:null},latestReview:{date:'2026-09-29'}}}});
test('recovery stops immediately on complete current confirmation',async()=>{let calls=0;const result=await recover({now:at,attempt:async()=>{calls++;return done();},sleep:()=>assert.fail('must not wait')});assert.equal(calls,1);assert.equal(result.status,'confirmed');});
test('provisional retries use 120 seconds and carry state and conflict latch',async()=>{
 const confirmed={asof:'2026-09-29',model:{state:{shares:0,waiting:true}}};const seed={status:'error',confirmed,dividendHealth:{blocked:true}};let n=0;const waits=[];
 const result=await recover({now:at,previous:seed,sleep:async ms=>waits.push(ms),attempt:async o=>{n++;assert.deepEqual(o.previous.confirmed,confirmed);assert.equal(o.previous.dividendHealth.blocked,true);assert.equal(o.recovery.attempt,n);return n===3?done(o.previous):{...o.previous,status:'provisional'};}});
 assert.equal(result.status,'confirmed');assert.equal(n,3);assert.deepEqual(waits,[120000,120000]);
});
test('exhausted recovery returns diagnostic state, never invents confirmation',async()=>{let n=0;const waits=[];const old={asof:'2026-09-29'};const result=await recover({now:at,previous:{status:'provisional',confirmed:old},sleep:async ms=>waits.push(ms),attempt:async o=>{n++;return {...o.previous,status:'provisional'};}});assert.equal(n,12);assert.equal(waits.length,11);assert.equal(result.status,'provisional');assert.equal(result.confirmed,old);});
test('transport crash can recover, without resetting the previous confirmed state',async()=>{let n=0;const seed={confirmed:{asof:'2026-09-29'}};const r=await recover({now:at,previous:seed,sleep:async()=>{},attempt:async o=>{assert.equal(o.previous,seed);if(++n===1)throw Error('network');return done();}});assert.equal(n,2);assert.equal(r.status,'confirmed');});
test('final crash fails job rather than publishing earlier intermediate file',async()=>{let n=0;await assert.rejects(recover({maxAttempts:2,sleep:async()=>{},attempt:async()=>{if(++n===1)return {status:'provisional'};throw Error('disk write failed');}}),/disk write failed/);});
test('persistent network failure is bounded',async()=>{let n=0;await assert.rejects(recover({sleep:async()=>{},attempt:async()=>{n++;throw Error('offline');}}),/offline/);assert.equal(n,12);});
test('invalid retry budget is rejected',async()=>{await assert.rejects(recover({maxAttempts:0,attempt:()=>assert.fail()}),/budget/);await assert.rejects(recover({maxAttempts:13,attempt:()=>assert.fail()}),/budget/);await assert.rejects(recover({intervalMs:0,attempt:()=>assert.fail()}),/budget/);await assert.rejects(recover({maxElapsedMs:Infinity,attempt:()=>assert.fail()}),/budget/);});
test('old confirmed status cannot stop recovery before the current close and Tuesday review',async()=>{
 let n=0;const old=done();old.generatedAt='2026-09-29T08:00:00Z';old.confirmed.asof='2026-09-29';old.confirmed.model.latestReview.date='2026-09-22';
 const result=await recover({now:at,sleep:async()=>{},attempt:async()=>++n===1?old:done()});assert.equal(n,2);assert.equal(result.confirmed.asof,'2026-09-30');
});
test('wall-clock deadline bounds recovery even when each network attempt is slow',async()=>{
 let time=Date.parse(at()),calls=0;const seed={status:'provisional'};
 const result=await recover({now:()=>new Date(time),maxElapsedMs:5*60000,sleep:async ms=>{time+=ms;},attempt:async()=>{calls++;time+=2*60000;return seed;}});
 assert.equal(calls,2);assert.equal(time-Date.parse(at()),6*60000);assert.equal(result.status,'provisional');
});
