'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {SCHEDULES,context,waitForWindow,completion}=require('./schedule.cjs');
function fresh(){return {status:'confirmed',generatedAt:'2026-10-20T07:10:00Z',calendar:{'2026-10-19':true,'2026-10-20':true},confirmed:{asof:'2026-10-20',model:{state:{pending:null},latestReview:{date:'2026-10-20',decision:{action:'HOLD'}}}}};}
test('production cron expressions match explicit Shanghai scheduling policy',()=>{
 const workflow=fs.readFileSync('.github/workflows/publish.yml','utf8');
 assert.deepEqual([...workflow.matchAll(/cron:\s*'([^']+)'/g)].map(m=>m[1]),SCHEDULES.map(s=>s.cron));
 assert.equal((workflow.match(/timezone: Asia\/Shanghai/g)||[]).length,SCHEDULES.length);
 assert.match(workflow,/data-ready/);assert.match(workflow,/node schedule\.cjs/);
});
test('unexpected 14:30 launch targets 15:03 rather than accepting yesterday',async()=>{
 const plan=context({GITHUB_EVENT_NAME:'schedule',SCHEDULE_CRON:SCHEDULES[0].cron},new Date('2026-10-20T06:30:00Z'));
 assert.equal(plan.notBefore,'2026-10-20T07:03:00.000Z');
 let time=Date.parse(plan.startedAt),waits=0;
 const result=await waitForWindow(plan,{now:()=>new Date(time),sleep:async ms=>{time+=ms;waits++;}});
 assert.equal(result.windowOpenedAt,plan.notBefore);assert.equal(result.waitedSeconds,33*60);assert.equal(waits,66);
 const s=fresh();s.generatedAt=plan.startedAt;s.confirmed.asof='2026-10-19';s.confirmed.model.latestReview.date='2026-10-13';
 assert.equal(completion(s,new Date(plan.startedAt),plan).complete,false);
});
test('manual catch-up and delayed evening launches do not sleep',async()=>{
 for(const event of ['push','workflow_dispatch','schedule']){
  const plan=context({GITHUB_EVENT_NAME:event,SCHEDULE_CRON:SCHEDULES[3].cron},new Date('2026-10-20T14:13:00Z'));
  await waitForWindow(plan,{now:()=>new Date(plan.startedAt),sleep:()=>assert.fail('late task must run immediately')});
 }
});
test('far-too-early dispatch fails instead of waiting without bounds',async()=>{
 const plan=context({GITHUB_EVENT_NAME:'schedule',SCHEDULE_CRON:SCHEDULES[0].cron},new Date('2026-10-20T00:00:00Z'));
 await assert.rejects(waitForWindow(plan,{now:()=>new Date(plan.startedAt)}),/too early/);
});
test('missing Tuesday review, unknown calendar, test snapshots and unverified execution cannot complete',()=>{
 const now=new Date('2026-10-20T08:00:00Z');assert.equal(completion(fresh(),now).complete,true);
 for(const change of [s=>s.confirmed.model.latestReview.date='2026-10-13',s=>s.calendar={},s=>s.testOnly=true,s=>s.confirmed.model.state.pending={targetDate:'2026-10-20'}]){const s=fresh();change(s);assert.equal(completion(s,now).complete,false);}
});
test('holiday Tuesday is complete only with an explicit holiday review, not missing daily bars',()=>{
 const s=fresh();s.calendar['2026-10-20']=false;s.confirmed.asof='2026-10-19';s.confirmed.model.latestReview.decision={action:'SKIP_HOLIDAY'};
 const now=new Date('2026-10-20T08:00:00Z'),plan=context({GITHUB_EVENT_NAME:'schedule',SCHEDULE_CRON:SCHEDULES[1].cron},now);
 assert.equal(completion(s,now,plan).complete,true);s.confirmed.model.latestReview.decision.action='Unknown';assert.equal(completion(s,now,plan).complete,false);
});
test('dispatch metadata records cron and run link, without accepting arbitrary repository URLs',()=>{
 const plan=context({GITHUB_EVENT_NAME:'schedule',SCHEDULE_CRON:'legacy cron',GITHUB_RUN_ID:'123',GITHUB_REPOSITORY:'Yunssss4410/hongli-web'},new Date('2026-10-20T06:30:00Z'));
 assert.equal(plan.recognized,false);assert.equal(plan.kind,'close');assert.equal(plan.runUrl,'https://github.com/Yunssss4410/hongli-web/actions/runs/123');
 assert.equal(context({GITHUB_RUN_ID:'x',GITHUB_REPOSITORY:'https://evil.test'}).runUrl,null);
});
