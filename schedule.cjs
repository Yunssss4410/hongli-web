'use strict';
const {shanghai,instant}=require('./clock.cjs');
const {freshness}=require('./view-state.js');
const SCHEDULES=[
 {cron:'53 14 * * 1-5',kind:'close'},
 {cron:'3,13,33 15 * * 1-5',kind:'close'},
 {cron:'3,33 16 * * 1-5',kind:'close'},
 {cron:'13 17,18,20,22 * * 1-5',kind:'close'},
 {cron:'35,45 9 * * 1-5',kind:'open'}
];
const TIMEZONE='Asia/Shanghai',CLOSE_CHECK_TIME='15:03:00';
function context(env={},now=new Date()){
 const local=shanghai(now),cron=String(env.SCHEDULE_CRON||'').slice(0,160);
 const known=SCHEDULES.find(s=>s.cron===cron);
 const scheduled=env.GITHUB_EVENT_NAME==='schedule';
 // Unknown legacy schedules remain visible; never interpret their text as code.
 const kind=scheduled?(known?.kind||(local.time>='14:00:00'?'close':'diagnostic')):'manual';
 const notBefore=instant(local.date,kind==='close'?CLOSE_CHECK_TIME:kind==='open'?'09:35:00':local.time);
 const runId=/^\d+$/.test(env.GITHUB_RUN_ID||'')?env.GITHUB_RUN_ID:null;
 const repo=/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY||'')?env.GITHUB_REPOSITORY:null;
 return {schemaVersion:1,event:env.GITHUB_EVENT_NAME||'local',cron:cron||null,timezone:TIMEZONE,kind,
  recognized:!scheduled||Boolean(known),targetDate:local.date,startedAt:now.toISOString(),notBefore,
  runId,runAttempt:env.GITHUB_RUN_ATTEMPT||null,runUrl:runId&&repo?`https://github.com/${repo}/actions/runs/${runId}`:null,
  commit:env.GITHUB_SHA||null};
}
async function waitForWindow(plan,{now=()=>new Date(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),maxWaitMs=35*60000}={}){
 const initial=now().getTime(),target=Date.parse(plan.notBefore);
 if(!Number.isFinite(target))throw Error('Invalid dispatch window');
 if(target-initial>maxWaitMs)throw Error('Scheduled task started too early; refusing to report the previous close as today');
 while(now().getTime()<target)await sleep(Math.min(30000,target-now().getTime()));
 return {...plan,windowOpenedAt:now().toISOString(),waitedSeconds:Math.max(0,Math.round((now().getTime()-initial)/1000))};
}
function completion(snapshot,now=new Date(),plan=snapshot.dispatch){
 const f=freshness(snapshot,now);
 const targetOpen=plan?.kind==='close'&&snapshot.calendar?.[plan.targetDate]===true;
 const targetMissing=Boolean(targetOpen&&(!snapshot.confirmed||snapshot.confirmed.asof<plan.targetDate));
 const beforeWindow=Boolean(plan&&Date.parse(plan.notBefore)>now.getTime());
 return {complete:f.ready&&!targetMissing&&!beforeWindow,expectedDate:targetOpen?plan.targetDate:f.expected,
  expectedReview:f.expectedReview,reviewDate:snapshot.confirmed?.model?.latestReview?.date||null,
  reason:beforeWindow?'等待收盘后的检查窗口':targetMissing?'本次目标交易日尚未确认':f.reviewStale?'应有的周二复盘尚未完成':f.due?'开盘执行尚未核验':!f.ready?(snapshot.error||'数据校验尚未通过'):null};
}
module.exports={SCHEDULES,TIMEZONE,CLOSE_CHECK_TIME,context,waitForWindow,completion};
if(require.main===module){
 const fs=require('node:fs');
 const plan=context(process.env);
 console.log('Dispatch '+JSON.stringify(plan));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Dispatch and target\n\n```json\n'+JSON.stringify(plan,null,2)+'\n```\n');
 waitForWindow(plan).then(result=>{fs.mkdirSync('validation-output',{recursive:true});fs.writeFileSync('validation-output/dispatch.json',JSON.stringify(result));console.log('Window '+JSON.stringify(result));}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
