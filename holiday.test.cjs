'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const core=require('./strategy.cjs'),{observation,normalizeRecord}=require('./observation.cjs'),{chart}=require('./chart-domain.cjs');
const calendar={},bars=[];
for(let d='2024-01-01';d<='2027-01-15';d=core.addDays(d,1)){
 calendar[d]=core.weekday(d)<5;
 if((d>='2026-10-01'&&d<='2026-10-07')||(d>='2026-02-16'&&d<='2026-02-20'))calendar[d]=false;
 if(calendar[d])bars.push({date:d,open:3,high:3.1,low:2.9,close:3,volume:1e6});
}
const fixture=(asof='2026-10-09')=>({id:'holiday-test',bars:bars.filter(b=>b.date<=asof),events:[],calendar:{...calendar},asof});
const at=d=>new Date(d+'T16:00:00+08:00');
test('holiday classification requires affirmative calendar evidence, not absent quotes',()=>{
 const s=fixture();a.equal(observation(s,'2026-10-06').status,'holiday');
 const unknown=fixture();delete unknown.calendar['2026-10-06'];a.equal(observation(unknown,'2026-10-06').status,'unavailable');
 const missing=fixture('2026-10-12');a.equal(observation(missing,'2026-10-13').status,'unavailable');
 const conflict=fixture();conflict.bars.push({date:'2026-10-06'});a.equal(observation(conflict,'2026-10-06').status,'unavailable');
});
test('Tuesday closure retains Monday only, future days never fill its observation',()=>{
 const s=fixture('2026-10-14');s.calendar['2026-10-13']=false;s.bars=s.bars.filter(b=>b.date!=='2026-10-13');
 a.equal(observation(s,'2026-10-13').status,'ready');
 const r=core.review(core.prepare(s.bars,[]),'2026-10-13');a.equal(r.asof,'2026-10-12');
 const long=fixture('2026-10-09');a.equal(core.review(core.prepare(long.bars,[]),'2026-10-06'),null);
});
test('Thursday/Friday short week forms one candle and completes only on Friday close',()=>{
 const thu=chart(fixture(),at('2026-10-08')),fri=chart(fixture(),at('2026-10-09'));
 a.equal(thu.asof,'2026-10-08');a.equal(thu.sessions,1);a.equal(thu.partial,true);
 a.equal(fri.sessions,2);a.equal(fri.partial,false);a.equal(fri.rows.at(-1).firstDate,'2026-10-08');a.equal(fri.rows.at(-1).week,'2026-10-05');
 a.equal(fri.rows.at(-1).fitEnd,'2026-09-30');a.equal(thu.rows.at(-1).fitEnd,fri.rows.at(-1).fitEnd);
 const before=chart(fixture(),new Date('2026-10-09T14:59:00+08:00'));a.equal(before.asof,'2026-10-08');a.equal(before.partial,true);
});
test('one-session week is complete; whole closed week creates no candle, skips no real historical week',()=>{
 const s=fixture();s.calendar['2026-10-09']=false;s.bars=s.bars.filter(b=>b.date!=='2026-10-09');
 const one=chart(s,at('2026-10-08'));a.equal(one.sessions,1);a.equal(one.partial,false);
 const empty=chart(fixture('2026-02-20'),at('2026-02-20'));a.equal(empty.asof,'2026-02-13');a.equal(empty.noCurrentWeek,true);a.equal(empty.partial,false);
 a.equal(empty.rows.some(r=>r.week==='2026-02-16'),false);
 const next=core.review(core.prepare(fixture('2026-10-13').bars,[]),'2026-10-13');a.equal(next.fit_bars,52);a.equal(next.fit_end,'2026-10-09');
});
test('unknown remaining week calendar never declares a completed candle',()=>{
 const s=fixture('2026-10-08');delete s.calendar['2026-10-09'];a.equal(chart(s,at('2026-10-08')).partial,true);
});
test('holiday execution and safety use verified sessions; unknown next year fails closed',()=>{
 const s=fixture();a.equal(core.nextExecution('2026-09-29',s.calendar),'2026-10-08');
 a.equal(core.nextExecution('2026-09-30',s.calendar,true),'2026-10-08');
 a.equal(core.nextExecution('2026-10-06',s.calendar),'2026-10-12'); // only date helper; holiday review never generates this plan
 const missing={...s.calendar};for(const d of Object.keys(missing))if(d>='2027-01-01')delete missing[d];
 a.throws(()=>core.nextExecution('2026-12-29',missing),/日历|calendar/);
 a.equal(core.nextExecution('2026-12-29',s.calendar),'2027-01-04');
 a.equal(s.calendar['2026-10-10'],false);
});
test('old holiday record projects to skip without rewriting it or converting unknown errors to success',()=>{
 const s=fixture(),old={date:'2026-10-06',decision:'HOLD',signal:null,reason:'本周一二无有效观察，跳过且不消耗R等待'};
 a.equal(normalizeRecord(old,s).decision,'SKIP_HOLIDAY');a.equal(old.decision,'HOLD');
 a.equal(normalizeRecord({...old,decision:'Unknown'},s).decision,'Unknown');
 a.equal(normalizeRecord({...old,reason:'首次策略复盘尚未开始'},s).decision,'HOLD');
 a.equal(normalizeRecord({...old,date:'2026-10-13'},fixture('2026-10-13')).decision,'Unknown');
});
const {replay}=require('./model.cjs');
test('R waiting survives a truly empty week; no Thursday catch-up and no early purchase',()=>{
 const s=fixture('2026-10-20'),normal={close:3,ma:2.9,middle:3,rising:true,confirm:false,lower_touch:false,upper_touch:false},calls=[];
 const m=replay(s,{start:'2026-09-28',review:d=>{calls.push(d);return {...normal,lower_touch:d==='2026-09-29'};}});
 a.equal(calls.includes('2026-10-06'),false);a.equal(m.reviews.find(r=>r.date==='2026-10-06').decision.action,'SKIP_HOLIDAY');a.equal(m.reviews.find(r=>r.date==='2026-10-06').state.waiting,true);a.equal(m.trades[0].nominal,'2026-10-13');a.equal(m.trades[0].date,'2026-10-19');
});
test('previous locked order still fills on holiday-adjusted Thursday, not cancelled by empty Tuesday',()=>{
 const m=replay(fixture('2026-10-09'),{start:'2026-09-28',review:()=>({lower_touch:true,confirm:true,upper_touch:false})});a.equal(m.trades[0].date,'2026-10-08');a.equal(m.state.shares,1);a.equal(m.latestReview.decision.action,'SKIP_HOLIDAY');
});
