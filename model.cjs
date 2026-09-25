'use strict';
const core=require('./strategy.cjs'),contract=require('./contract.json');
const reasonText={lower:'触下轨，R确认通过',lower_delayed:'R等待后的下一次有效复盘',upper:'观察窗口触及上轨',recovery:'冻结恢复条件通过',safety:'收盘较持仓均价回撤达到8.5%',no_lower:'未触下轨',no_upper:'未触上轨'};
function protective(average,close){if(!(average>0))return 'NONE';const ratio=close/average;return ratio<=contract.exitRatio+1e-12?'SAFETY_SELL':ratio<=contract.warningRatio+1e-12?'WARNING':'NONE';}
function replay(snapshot,options={}){
 const prepared=core.prepare(snapshot.bars,snapshot.events),by=new Map(prepared.map(b=>[b.date,b])),reviews=[],trades=[];
 const state={shares:0,average:null,waiting:false,frozen:false,pending:null,protection:'NONE',asof:snapshot.asof};
 const review=options.review||((d)=>core.review(prepared,d));
 function fill(day,bar){const p=state.pending;if(!p||p.targetDate!==day)return;if(!(bar?.open>0))throw Error('缺少执行日开盘价 '+day);trades.push({...p,date:day,price:bar.open,kind:'hypothetical',id:p.nominal+'-'+p.side+'-'+p.reason});if(p.side==='BUY'){state.shares=1;state.average=bar.open;state.frozen=false;}else{state.shares=0;state.average=null;state.frozen=p.reason==='safety';}state.waiting=false;state.pending=null;state.protection='NONE';}
 function plan(side,reason,day){if(reason==='safety'&&state.pending?.reason==='safety')return;state.pending={side,reason,nominal:day,targetDate:core.nextExecution(day,snapshot.calendar,reason==='safety')};state.waiting=false;}
 for(let day=options.start||contract.simulationStart;day<=(options.evaluationThrough||snapshot.asof);day=core.addDays(day,1)){
  if(snapshot.calendar[day]===undefined)throw Error('未知交易日历 '+day);
  const bar=by.get(day);if(snapshot.calendar[day]&&!bar)throw Error('缺少交易日日线 '+day);if(!snapshot.calendar[day]&&bar)throw Error('休市日出现行情 '+day);
  if(bar)fill(day,bar);
  if(state.pending&&state.pending.targetDate<day)throw Error('模拟执行未完成 '+state.pending.targetDate);
  state.protection=state.shares&&bar?protective(state.average,bar.close):state.protection;
  const signal=core.weekday(day)===1?review(day):null;
  let decision=null;
  if(state.protection==='SAFETY_SELL'&&bar){plan('SELL','safety',day);decision={action:'SAFETY_SELL',reason:'safety'};}
  else if(core.weekday(day)===1){decision=core.ordinaryDecision(state,signal);if(decision.action==='WAIT_R')state.waiting=true;if(['BUY','SELL'].includes(decision.action))plan(decision.action,decision.reason,day);}
  if(core.weekday(day)===1)reviews.push({date:day,signal,decision,state:{shares:state.shares,waiting:state.waiting,frozen:state.frozen},effective:Boolean(signal)});
 }
 return {state,trades,reviews,latestReview:reviews.at(-1)||null};
}
function applyVerifiedOpen(model,bar){const m=structuredClone(model),p=m.state.pending;if(!p||p.targetDate!==bar.date)return m;if(!(bar.open>0))throw Error('Invalid execution open');m.trades.push({...p,date:bar.date,price:bar.open,kind:'hypothetical',id:p.nominal+'-'+p.side+'-'+p.reason});Object.assign(m.state,{shares:p.side==='BUY'?1:0,average:p.side==='BUY'?bar.open:null,waiting:false,frozen:p.side==='SELL'&&p.reason==='safety',pending:null,protection:'NONE',executionAsOf:bar.date});return m;}
module.exports={replay,protective,applyVerifiedOpen,reasonText};
