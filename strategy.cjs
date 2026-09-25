'use strict';
// Fixed V2.2-R compatibility core. No clock, network, UI or database access.
const DAY=86400000;
function dateMs(s) {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('Invalid ISO date');
  const t=Date.parse(s+'T00:00:00Z');
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==s) throw Error('Invalid calendar date');
  return t;
}
const iso=t=>new Date(t).toISOString().slice(0,10);
const addDays=(s,n)=>iso(dateMs(s)+n*DAY);
const weekday=s=>(new Date(dateMs(s)).getUTCDay()+6)%7;
const monday=s=>addDays(s,-weekday(s));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function quantile(a,p) {
  if(!a.length||p<0||p>1) throw Error('Invalid quantile');
  const v=[...a].sort((x,y)=>x-y), h=(v.length-1)*p, i=Math.floor(h);
  return v[i]+(v[Math.min(i+1,v.length-1)]-v[i])*(h-i);
}
function validateBar(b) {
  dateMs(b.date);
  if(weekday(b.date)>4) throw Error('Weekend bar '+b.date);
  for(const k of ['open','high','low','close']) if(!Number.isFinite(b[k])||b[k]<=0||b[k]>100000) throw Error('Invalid '+k+' '+b.date);
  if(b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high) throw Error('Invalid OHLC '+b.date);
  if(!Number.isFinite(b.volume)||b.volume<0) throw Error('Invalid volume');
}
function prepare(input, events) {
  const rows=input.filter(b=>b.date>='2009-01-01').map(b=>({...b}));
  if(!rows.length) throw Error('Missing RSI seed history');
  const ev=new Map();
  for(const e of events) {
    dateMs(e.ex_date);
    if(ev.has(e.ex_date)||!Number.isFinite(e.cash_per_share)||e.cash_per_share<0) throw Error('Invalid dividend');
    ev.set(e.ex_date,e.cash_per_share);
  }
  let cumulative=0,tri=1,gain=0,loss=0;
  const changes=[];
  rows.forEach((b,i)=>{
    validateBar(b);
    if(i&&b.date<=rows[i-1].date) throw Error('Unordered or duplicate bars');
    const dividend=ev.get(b.date)||0;
    cumulative+=dividend;b.cumdiv=cumulative;
    const next=i?tri*(b.close+dividend)/rows[i-1].close:1;
    changes.push(next-tri);tri=next;
    b.rsi=null;b.volume_ratio=null;
    if(i===14) {
      gain=mean(changes.slice(1,15).map(x=>Math.max(x,0)));
      loss=mean(changes.slice(1,15).map(x=>Math.max(-x,0)));
    } else if(i>14) {
      gain=(gain*13+Math.max(changes[i],0))/14;
      loss=(loss*13+Math.max(-changes[i],0))/14;
    }
    if(i>=14) b.rsi=loss>0?100-100/(1+gain/loss):gain>0?100:50;
    if(i>=19) {
      const long=mean(rows.slice(i-19,i+1).map(x=>x.volume));
      b.volume_ratio=long>0?mean(rows.slice(i-4,i+1).map(x=>x.volume))/long:null;
    }
  });
  return rows;
}
function review(prepared, nominal) {
  if(weekday(nominal)!==1) throw Error('Formal review must be Tuesday');
  const start=monday(nominal), known=prepared.filter(b=>b.date<=nominal);
  const window=known.filter(b=>b.date>=start);
  if(!window.length) return null;
  const at=window.at(-1), groups=new Map();
  for(const b of known) if(b.date<start) groups.set(monday(b.date),b);
  const completed=[...groups.values()];
  if(completed.length<52||at.rsi===null||at.volume_ratio===null) return null;
  const adjusted=b=>b.close-(at.cumdiv-b.cumdiv);
  const fit=completed.slice(-52), prices=fit.map(adjusted);
  if(prices.some(x=>x<=0)) throw Error('Nonpositive adjusted price');
  const y=prices.map(Math.log), ym=mean(y), xm=25.5;
  let cov=0,variance=0;
  for(let i=0;i<52;i++) {cov+=(i-xm)*(y[i]-ym);variance+=(i-xm)**2;}
  const slope=cov/variance,intercept=ym-slope*xm,resid=y.map((v,i)=>v-intercept-slope*i);
  const middle=Math.exp(intercept+slope*52);
  const lower=Math.exp(intercept+slope*52+quantile(resid,.1));
  const upper=Math.exp(intercept+slope*52+quantile(resid,.9));
  const ma=mean([...completed.slice(-19).map(adjusted),at.close]);
  const oldma=mean(completed.slice(-23,-3).map(adjusted));
  const windowLow=Math.min(...window.map(b=>b.low-(at.cumdiv-b.cumdiv)));
  const windowHigh=Math.max(...window.map(b=>b.high-(at.cumdiv-b.cumdiv)));
  return {nominal,asof:at.date,window_start:window[0].date,close:at.close,
    lower,middle,upper,ma,oldma,rising:ma>oldma,windowLow,windowHigh,
    lower_touch:windowLow<=lower,upper_touch:windowHigh>=upper,
    rsi:at.rsi,volume_ratio:at.volume_ratio,confirm:at.rsi<=35||at.volume_ratio>=1.2,
    fit_end:fit.at(-1).date,fit_start:fit[0].date,fit_bars:52};
}
function ordinaryDecision(state, signal) {
  if(!signal) return {action:'Unknown',reason:'无有效周一二观察或历史不足'};
  if(state.pending) return {action:'Blocked',reason:'已有未完成计划'};
  if(state.shares>0) return {action:signal.upper_touch?'SELL':'HOLD',reason:signal.upper_touch?'upper':'no_upper'};
  if(state.frozen) return {action:signal.close>signal.ma&&signal.rising&&signal.close<=signal.middle*1.02?'BUY':'HOLD',reason:'recovery'};
  if(state.waiting) return {action:'BUY',reason:'lower_delayed'};
  if(signal.lower_touch) return {action:signal.confirm?'BUY':'WAIT_R',reason:'lower'};
  return {action:'HOLD',reason:'no_lower'};
}
function safetyDecision({shares,cash,receivable,anchor},close) {
  if(shares===0) return {action:'NONE'};
  if(![shares,cash,receivable,anchor,close].every(Number.isFinite)||!Number.isSafeInteger(shares)||shares<0||cash<0||receivable<0||anchor<=0||close<=0) return {action:'Unknown'};
  // Compare integer micro-CNY ratios, so exactly -8.5% cannot miss due to IEEE division.
  const numbers=[cash,receivable,anchor,close].map(v=>Math.round(v*1e6));
  if(!numbers.every(Number.isSafeInteger)) return {action:'Unknown'};
  const [cm,rm,am,pm]=numbers.map(BigInt);
  if(am===0n) return {action:'Unknown'};
  const equity=cm+BigInt(shares)*pm+rm;
  if(equity>BigInt(Number.MAX_SAFE_INTEGER)) return {action:'Unknown'};
  const value=Number(equity)/1e6,change=Number(equity)/Number(am)-1;
  return {action:equity*1000n<=am*915n?'SAFETY_SELL':equity*100n<=am*92n?'WARNING':'NONE',value,change};
}
function nextExecution(nominal, calendar, safety=false) {
  const first=safety?addDays(nominal,1):addDays(monday(nominal),7);
  for(let i=0;i<21;i++) {
    const date=addDays(first,i),status=calendar[date];
    if(status===undefined) throw Error('Unknown trading calendar '+date);
    if(status===true) return date;
    if(status!==false) throw Error('Invalid calendar state');
  }
  throw Error('No verified execution date');
}
module.exports={dateMs,iso,addDays,weekday,monday,mean,quantile,validateBar,prepare,review,ordinaryDecision,safetyDecision,nextExecution};
