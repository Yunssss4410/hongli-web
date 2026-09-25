'use strict';
const fs=require('node:fs'),path=require('node:path');
const p=require('./cloud-probe.cjs'),market=require('./market.cjs'),core=require('./strategy.cjs'),clock=require('./clock.cjs'),model=require('./model.cjs'),{chart}=require('./chart-domain.cjs'),contract=require('./contract.json');
const SITE='https://yunssss4410.github.io/hongli-web/snapshot.json';
function versionedHtml(html,read){return html.replace(/(src|href)="(style\.css|app\.js|chart\.js|buy-limit\.js|view-state\.js)"/g,(_,attr,file)=>`${attr}="${file}?v=${market.hash(read(file)).slice(0,16)}"`);}
async function previousSnapshot(){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(SITE+'?check='+Date.now(),{signal:c.signal,cache:'no-store',redirect:'error'});if(r.status===404)return null;if(!r.ok)throw Error('无法读取上次发布快照 HTTP '+r.status);const text=await r.text();if(text.length>2000000)throw Error('快照过大');const s=JSON.parse(text);if(s.schemaVersion!==1||!s.generatedAt)throw Error('上次快照格式异常');return s;}finally{clearTimeout(t);}}
async function acquire(previous,now){const raw={},sources={};await Promise.all(Object.entries(p.URLS).map(async([k,u])=>{if(k==='calendar'){const result=await require('./calendar-policy.cjs').acquireCalendar(previous,now);raw.calendarState=result;sources.calendar=result.source;return;}let error;for(let n=0;n<2;n++){try{const r=await p.request(u);raw[k]=r.text;const {text,...metadata}=r;sources[k]={status:'ok',...metadata};return;}catch(e){error=e.message;if(n===0)await new Promise(r=>setTimeout(r,1000));}}sources[k]={status:'error',error};}));return {raw,sources};}
function referenceQuote(s,simulation,now){const pending=simulation.state.pending;if(!pending||pending.side!=='BUY')return null;const local=clock.shanghai(now);if(pending.targetDate<local.date||(pending.targetDate===local.date&&local.time>='09:25:00'))return {status:'expired',targetDate:pending.targetDate};let ref=core.addDays(pending.targetDate,-1);for(let i=0;i<25;i++,ref=core.addDays(ref,-1)){if(s.calendar[ref]===undefined)return {status:'unknown_calendar'};if(s.calendar[ref])break;}if(s.asof<ref)return {status:'waiting',referenceDate:ref,targetDate:pending.targetDate};const bar=s.bars.find(b=>b.date===ref);if(!bar)return {status:'missing'};const distribution=s.events.filter(e=>e.ex_date===pending.targetDate).reduce((a,e)=>a+e.cash_per_share,0);return {status:'ready',referenceDate:ref,targetDate:pending.targetDate,close:bar.close,distribution,reference:bar.close-distribution,defaultPercent:1};}
function published(previous,now,raw,sources){
 const output={schemaVersion:1,version:contract.version,generatedAt:now.toISOString(),status:'error',sources,error:null,contract,contractHash:market.hash(contract),calendar:previous?.calendar||{},confirmed:previous?.confirmed||null,preview:null,acceptedHashes:previous?.acceptedHashes||{},publicationLog:previous?.publicationLog||[]};
 output.calendarCache=raw.calendarState?.cache||previous?.calendarCache||null;
 try{
  const result=market.assemble(raw,now,previous),s=result.snapshot;output.calendar=s.calendar;output.expected=s.asof;output.audit=result.audit;
  const local=clock.shanghai(now),through=local.time>='15:00:00'?local.date:core.addDays(local.date,-1);
  if(result.status==='provisional'){
   output.status='provisional';output.preview={asof:s.asof,chart:chart(s,now)};
   let tue=through;while(core.weekday(tue)!==1)tue=core.addDays(tue,-1);
   output.preview.review={date:tue,signal:core.review(core.prepare(s.bars,s.events),tue)};
   return output;
  }
  let simulation=model.replay(s,{evaluationThrough:through});
  const pending=simulation.state.pending;
  if(pending?.targetDate===local.date&&local.time>='09:35:00'&&s.calendar[local.date]){
   const a=result.feeds.sina.find(b=>b.date===local.date),b=result.feeds.tencent.find(b=>b.date===local.date);
   if(a&&b&&Math.round(a.open*1000)===Math.round(b.open*1000))simulation=model.applyVerifiedOpen(simulation,a);
  }
  const old=previous?.confirmed,latest=simulation.latestReview;
  const reportKey=latest?market.hash(latest):null;
  const already=old?.reviewKey===reportKey;
  const liveReview=latest?.date===local.date&&local.time>='15:00:00';
  const confirmed={asof:s.asof,verifiedAt:now.toISOString(),close:s.bars.at(-1).close,model:simulation,chart:chart(s,now),quote:referenceQuote(s,simulation,now),reviewKey:reportKey,reviewPublishedAt:already?old.reviewPublishedAt:now.toISOString(),reviewOrigin:already?old.reviewOrigin:liveReview?'当日发布':'历史补算参考'};
  output.status='confirmed';output.confirmed=confirmed;output.acceptedHashes=result.acceptedHashes;
  const summary={at:now.toISOString(),asof:s.asof,state:simulation.state.shares?'holding':'empty',pending:simulation.state.pending,reviewDate:latest?.date||null};
  if(!old||old.asof!==s.asof||JSON.stringify(old.model.state)!==JSON.stringify(simulation.state))output.publicationLog=[...output.publicationLog,summary].slice(-120);
  return output;
 }catch(e){output.error=e.message;return output;}
}
async function build(){
 const fixtureArg=process.argv.find(a=>a.startsWith('--fixture='));
 const fixture=fixtureArg?JSON.parse(fs.readFileSync(fixtureArg.slice(10),'utf8')):null;
 if(fixture&&process.env.GITHUB_ACTIONS)throw Error('云端发布禁止测试数据');
 const now=fixture?new Date(fixture.now):new Date();
 const previous=fixture?.previous||(fixture?null:await previousSnapshot());
 const {raw,sources}=fixture?fixture:await acquire(previous,now);
 const output=published(previous,now,raw,sources);
 if(fixture)output.testOnly=true;
 fs.mkdirSync('site',{recursive:true});
 for(const f of ['index.html','style.css','app.js','chart.js','buy-limit.js','view-state.js'])fs.copyFileSync(f,path.join('site',f));
 fs.writeFileSync('site/index.html',versionedHtml(fs.readFileSync('index.html','utf8'),f=>fs.readFileSync(f,'utf8')));
 fs.writeFileSync('site/snapshot.json',JSON.stringify(output));fs.writeFileSync('site/.nojekyll','');
 fs.mkdirSync('validation-output',{recursive:true});
 const report={status:output.status,asof:output.confirmed?.asof||null,audit:output.audit,error:output.error,sources,bytes:fs.statSync('site/snapshot.json').size};
 fs.writeFileSync('validation-output/build-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Read-only strategy build\n\n```json\n'+JSON.stringify(report,null,2)+'\n```\n');
 // Diagnostic publication on a source failure is intentional; no stale state becomes a new instruction.
 return output;
}
module.exports={published,referenceQuote,versionedHtml};
if(require.main===module)build().catch(e=>{console.error(e.message);process.exitCode=1;});
