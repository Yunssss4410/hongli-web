const {test}=require('node:test'),assert=require('node:assert/strict'),{freshness}=require('./view-state.js');
function snapshot(){return {status:'confirmed',generatedAt:'2026-09-22T07:30:00Z',calendar:{'2026-09-21':true,'2026-09-22':true,'2026-09-23':true},confirmed:{asof:'2026-09-22',model:{state:{pending:null},latestReview:{date:'2026-09-22'}}}};}
test('fresh confirmed snapshot can show reference state',()=>{assert.equal(freshness(snapshot(),new Date('2026-09-22T08:00:00Z')).ready,true);});
test('missing Tuesday review is not disguised by fresh market data',()=>{const s=snapshot();s.confirmed.model.latestReview.date='2026-09-15';assert.equal(freshness(s,new Date('2026-09-22T08:00:00Z')).ready,false);});
test('overdue prior-day execution is unknown even before today 09:35',()=>{const s=snapshot();s.confirmed.model.state.pending={targetDate:'2026-09-22'};assert.equal(freshness(s,new Date('2026-09-23T00:00:00Z')).due,true);});
test('old close, unknown calendar, future clock and test fixtures never look current',()=>{const now=new Date('2026-09-23T08:00:00Z');assert.equal(freshness(snapshot(),now).ready,false);const s=snapshot();s.calendar={};assert.equal(freshness(s,now).ready,false);const q=snapshot();q.generatedAt='2027-01-01T00:00:00Z';assert.equal(freshness(q,now).ready,false);const t=snapshot();t.testOnly=true;assert.equal(freshness(t,new Date('2026-09-22T08:00:00Z')).ready,false);});
const {health,sourceView}=require('./view-state.js');
test('calendar skip is a completed review, but Unknown is not confirmation',()=>{const s=snapshot(),now=new Date('2026-09-22T08:00:00Z');s.confirmed.model.latestReview.decision={action:'SKIP_HOLIDAY'};assert.equal(freshness(s,now).ready,true);s.confirmed.model.latestReview.decision.action='Unknown';assert.equal(freshness(s,now).ready,false);});
test('pending beyond 45 minutes prominently reports missing cloud update',()=>{const s=snapshot();s.status='provisional';s.preview={reason:'单源行情待交叉复核'};const h=health(s,new Date('2026-09-22T08:30:00Z'));assert.equal(h.ready,false);assert.equal(h.overdue,true);assert.match(h.reason,/单源/);assert.match(h.reason,/45分钟/);});
test('ordinary publication delay does not claim a broken scheduler',()=>{const s=snapshot();s.status='provisional';assert.equal(health(s,new Date('2026-09-22T07:40:00Z')).overdue,false);});
test('holiday retains last valid close rather than inventing missing holiday bars',()=>{const s=snapshot();s.generatedAt='2026-09-30T08:00:00Z';s.calendar={'2026-09-29':true,'2026-09-30':true,'2026-10-01':false,'2026-10-02':false};s.confirmed.asof='2026-09-30';s.confirmed.model.latestReview.date='2026-09-29';const h=health(s,new Date('2026-10-02T08:00:00Z'));assert.equal(h.expected,'2026-09-30');assert.equal(h.ready,true);assert.equal(h.overdue,false);});
test('load failures and invalid snapshot times never enable an instruction',()=>{const s=snapshot(),now=new Date('2026-09-22T08:00:00Z');assert.equal(health(s,now,'offline').ready,false);assert.equal(health(s,now,'offline').tone,'error');s.generatedAt='nonsense';assert.equal(health(s,now).ready,false);});
test('HTTP success with stale daily bars is yellow, not verified green',()=>{assert.deepEqual(sourceView('sina',{status:'ok',dataDate:'2026-09-29',validation:'lagging'}),{tone:'warn',label:'数据截至 2026-09-29 · 更新落后'});assert.equal(sourceView('tencent',{status:'ok',dataDate:'2026-09-30',validation:'verified'}).tone,'ok');assert.equal(sourceView('sina',{status:'ok'}).tone,'warn');assert.equal(sourceView('manager',{status:'ok',validation:'invalid'}).tone,'upper');});

test('14:30 snapshot after close reports no closing check, not a slow price source or a known queue',()=>{
 const s=snapshot();s.generatedAt='2026-09-23T06:30:00Z';
 const early=health(s,new Date('2026-09-23T07:20:00Z'));
 assert.equal(early.awaitingCloud,true);assert.equal(early.overdue,false);assert.equal(early.label,'等待云端收盘检查');assert.match(early.reason,/尚未收到/);
 const late=health(s,new Date('2026-09-23T08:00:00Z'));
 assert.equal(late.overdue,true);assert.match(late.reason,/不能证明任务正在排队/);
});
test('a real post-close check with stale source data is distinguished from a missing cloud launch',()=>{
 const s=snapshot();s.status='error';s.generatedAt='2026-09-23T07:10:00Z';s.error='日线尚未到应有日期 2026-09-23';
 const h=health(s,new Date('2026-09-23T07:20:00Z'));assert.equal(h.awaitingCloud,false);assert.match(h.reason,/日线尚未到/);assert.equal(h.tone,'error');
});
