'use strict';
// Read-only chart projection. Never calls the strategy service or writes a plan.
const core=require('./strategy.cjs'),clock=require('./clock.cjs');
function bounds(completed,at){
 const fit=completed.slice(-52);if(fit.length<52)return null;
 const prices=fit.map(b=>b.close-(at.cumdiv-b.cumdiv));if(prices.some(p=>p<=0))return null;
 const y=prices.map(Math.log),ym=core.mean(y);let cov=0,variance=0;
 for(let i=0;i<52;i++){cov+=(i-25.5)*(y[i]-ym);variance+=(i-25.5)**2;}
 const slope=cov/variance,intercept=ym-slope*25.5,resid=y.map((v,i)=>v-intercept-slope*i);
 return {lower:Math.exp(intercept+slope*52+core.quantile(resid,.1)),middle:Math.exp(intercept+slope*52),upper:Math.exp(intercept+slope*52+core.quantile(resid,.9)),fitEnd:fit.at(-1).date};
}
function chart(snapshot,now){
 let expected=null;try{expected=clock.lastClosed(snapshot.calendar||{},now);}catch{}
 const local=clock.shanghai(now),cutoff=expected||(local.time>=clock.CLOSE_TIME?local.date:core.addDays(local.date,-1));
 const rows=snapshot.bars.filter(b=>b.date<=cutoff&&b.date<=snapshot.asof);
 if(!rows.length)return {rows:[],asof:null,expected};
 const prepared=core.prepare(rows,snapshot.events),last=prepared.at(-1),weeks=new Map();
 for(const b of prepared){const wk=core.monday(b.date);const list=weeks.get(wk)||[];list.push(b);weeks.set(wk,list);}
 const all=[...weeks.entries()],shown=all.slice(-52),lastWeek=all.at(-1)[0];
 const projected=shown.map(([wk,days])=>{
  const at=days.at(-1),prior=all.filter(([key])=>key<wk).map(([,items])=>items.at(-1));
  // Historical bands retain their Tuesday observation price basis. For the
  // latest candle, only PRIOR complete weeks fit the band, even on Wed/Fri.
  const anchor=wk===lastWeek?at:days.filter(b=>b.date<=core.addDays(wk,1)).at(-1);
  const band=anchor?bounds(prior,anchor):null,shift=anchor?last.cumdiv-anchor.cumdiv:0;
  const adj=b=>last.cumdiv-b.cumdiv;
  const high=Math.max(...days.map(b=>b.high-adj(b))),low=Math.min(...days.map(b=>b.low-adj(b)));
  const highDates=days.filter(b=>Math.abs(b.high-adj(b)-high)<1e-8).map(b=>b.date),lowDates=days.filter(b=>Math.abs(b.low-adj(b)-low)<1e-8).map(b=>b.date);
  const prev=prior.at(-1),previousClose=prev?.close??null,change=previousClose>0?at.close-previousClose:null;
  const rawHigh=Math.max(...days.map(b=>b.high)),rawLow=Math.min(...days.map(b=>b.low));
  const dividend=days.reduce((sum,b)=>sum+snapshot.events.filter(e=>e.ex_date===b.date).reduce((s,e)=>s+e.cash_per_share,0),0);
  let partial=false;
  if(wk===lastWeek)for(let d=core.addDays(at.date,1);d<=core.addDays(wk,4);d=core.addDays(d,1))if(snapshot.calendar?.[d]!==false)partial=true;
  return {date:at.date,week:wk,firstDate:days[0].date,weekEnd:core.addDays(wk,4),sessions:days.length,open:days[0].open-adj(days[0]),close:at.close-adj(at),high,low,highDates,lowDates,
    raw:{open:days[0].open,high:rawHigh,low:rawLow,close:at.close,highDates:days.filter(b=>Math.abs(b.high-rawHigh)<1e-8).map(b=>b.date),lowDates:days.filter(b=>Math.abs(b.low-rawLow)<1e-8).map(b=>b.date)},previousClose,previousDate:prev?.date??null,change,changePct:previousClose>0?change/previousClose*100:null,dividend,
    lower:band?band.lower-shift:null,middle:band?band.middle-shift:null,upper:band?band.upper-shift:null,fitEnd:band?.fitEnd||null,partial};
 });
 return {rows:projected,asof:last.date,expected,close:last.close,partial:projected.at(-1).partial,week:lastWeek};
}
module.exports={chart,bounds};
