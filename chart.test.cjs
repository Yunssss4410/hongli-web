'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),core=require('./strategy.cjs'),{chart}=require('./chart-domain.cjs');
const bars=[],calendar={};
for(let d='2024-01-01';d<='2026-10-23';d=core.addDays(d,1)){
 calendar[d]=core.weekday(d)<5&&!((d>='2026-05-01'&&d<='2026-05-05')||(d>='2026-10-01'&&d<='2026-10-07'));
 if(calendar[d])bars.push({date:d,open:3,high:3.1,low:2.9,close:3,volume:1e6});
}
const fixture=(asof='2026-10-14')=>({bars:bars.filter(b=>b.date<=asof),calendar:{...calendar},events:[],asof});
const at=d=>new Date(d+'T16:00:00+08:00');
test('verified holiday short weeks have display-only bands, not a fabricated Tuesday review',()=>{
 const s=fixture(),before=JSON.stringify(s),c=chart(s,at(s.asof));
 for(const [week,first]of [['2026-05-04','2026-05-06'],['2026-10-05','2026-10-08']]){
  const r=c.rows.find(r=>r.week===week);a.equal(r.bandStatus,'holiday_reference');a.equal(r.reviewStatus,'holiday');a.equal(r.bandAnchor,first);a.ok(r.lower>0&&r.upper>=r.lower);a.ok(r.fitEnd<week);
  a.equal(core.review(core.prepare(s.bars,[]),core.addDays(week,1)),null);
 }
 a.equal(JSON.stringify(s),before);
});
test('short-week bands do not disappear when the next week arrives; first session stays the anchor',()=>{
 const short=chart(fixture('2026-10-09'),at('2026-10-09')).rows.at(-1),later=chart(fixture(),at('2026-10-14')).rows.find(r=>r.week==='2026-10-05');
 for(const k of ['lower','middle','upper','fitEnd','bandAnchor','bandStatus'])a.equal(short[k],later[k],k);
});
test('current normal chart bands equal the independent Tuesday calculation and exclude current week',()=>{
 const s=fixture(),r=chart(s,at(s.asof)).rows.at(-1),review=core.review(core.prepare(s.bars,[]),'2026-10-13');
 for(const k of ['lower','middle','upper'])a.equal(r[k],review[k]);a.equal(r.fitEnd,'2026-10-09');a.equal(r.bandStatus,'reference');
 const future=fixture('2026-10-23');a.deepEqual(chart(future,at(s.asof)),chart(s,at(s.asof)));
});
test('unknown calendar or missing open-session observation cannot masquerade as a holiday',()=>{
 const unknown=fixture();delete unknown.calendar['2026-10-05'];
 const r=chart(unknown,at(unknown.asof)).rows.find(r=>r.week==='2026-10-05');a.equal(r.lower,null);a.equal(r.bandStatus,'missing_observation');a.equal(r.reviewStatus,'unavailable');
 const current=fixture('2026-10-09');delete current.calendar['2026-10-06'];a.equal(chart(current,at(current.asof)).rows.at(-1).lower,null);
 const missing=fixture();missing.bars=missing.bars.filter(b=>b.date!=='2026-10-13');a.equal(chart(missing,at(missing.asof)).rows.at(-1).bandStatus,'missing_observation');
});
test('insufficient history remains explicitly unavailable; no synthetic band or closed-week candle',()=>{
 const s=fixture();s.bars=s.bars.filter(b=>b.date>='2026-08-01');a.equal(chart(s,at(s.asof)).rows.at(-1).bandStatus,'insufficient_history');a.equal(chart(s,at(s.asof)).rows.at(-1).lower,null);
 const whole=fixture();for(let d='2026-05-04';d<='2026-05-08';d=core.addDays(d,1))whole.calendar[d]=false;whole.bars=whole.bars.filter(b=>b.date<'2026-05-04'||b.date>'2026-05-08');a.equal(chart(whole,at(whole.asof)).rows.some(r=>r.week==='2026-05-04'),false);
});
test('holiday reference handles cash dividends without modifying a formal review or raw candles',()=>{
 const s=fixture('2026-10-09');s.events=[{ex_date:'2026-10-09',cash_per_share:.1}];
 const before=JSON.stringify(s),r=chart(s,at(s.asof)).rows.at(-1);a.equal(r.bandAnchor,'2026-10-08');a.equal(r.bandStatus,'holiday_reference');a.equal(r.raw.close,3);a.equal(r.dividend,.1);
 a.equal(core.review(core.prepare(s.bars,s.events),'2026-10-06'),null);a.equal(JSON.stringify(s),before);
 const later=fixture();later.events=s.events;const old=chart(later,at(later.asof)).rows.find(r=>r.week==='2026-10-05');a.equal(old.lower,r.lower);a.equal(old.upper,r.upper);
});
test('nonpositive dividend-adjusted history is reported, never bridged with invented values',()=>{
 const s=fixture();s.events=[{ex_date:'2026-10-12',cash_per_share:4}];const r=chart(s,at(s.asof)).rows.at(-1);a.equal(r.lower,null);a.equal(r.bandStatus,'invalid_adjusted_price');
});
