'use strict';
// A calendar-closed observation is not missing market data. Never infer holidays from absent bars.
const core=require('./strategy.cjs');
const HOLIDAY_REASON='周一、周二均休市：本次普通复盘跳过，不消耗R等待、不解除冻结、不变更已有计划；不借用周三至周五行情。';
function observation(snapshot,nominal){
 if(core.weekday(nominal)!==1)throw Error('普通复盘归属日必须是周二');
 const dates=[core.monday(nominal),nominal],calendar=snapshot?.calendar||{},bars=new Set((snapshot?.bars||[]).map(b=>b.date));
 for(const d of dates){
  if(typeof calendar[d]!=='boolean')return {status:'unavailable',reason:'观察窗口日历未核验：'+d,dates};
  if(calendar[d]&&!bars.has(d))return {status:'unavailable',reason:'观察窗口缺少交易日日线：'+d,dates};
  if(!calendar[d]&&bars.has(d))return {status:'unavailable',reason:'休市日存在行情，日历与数据冲突：'+d,dates};
 }
 return {status:dates.every(d=>!calendar[d])?'holiday':'ready',dates};
}
function normalizeRecord(record,snapshot){
 if(!record||record.signal||core.weekday(record.date)!==1)return record;
 // Only migrate the old, explicitly recorded holiday HOLD in the read-only projection.
 // Never convert an unknown, protection, reconciliation, or pre-activation record into success.
 const legacy=record.decision==='HOLD'&&record.reason==='本周一二无有效观察，跳过且不消耗R等待';
 if(!legacy&&record.decision!=='SKIP_HOLIDAY')return record;
 const o=observation(snapshot,record.date);
 if(o.status!=='holiday')return {...record,decision:'Unknown',reason:o.reason||'原休市记录与当前日历不符，待核验'};
 return {...record,decision:'SKIP_HOLIDAY',reason:HOLIDAY_REASON,observation:o};
}
module.exports={observation,normalizeRecord,HOLIDAY_REASON};
