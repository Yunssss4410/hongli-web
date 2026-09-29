'use strict';
// Cached reference data never proves that no new distribution was announced.
const p=require('./cloud-probe.cjs'),baseline=require('./baseline.json');
const HOUR=3600000;
function same(events){
 if(!Array.isArray(events)||events.length!==baseline.events.length||events.some((e,i)=>['record_date','ex_date','pay_date','cash_per_share'].some(k=>e[k]!==baseline.events[i][k])))throw Error('发现新分红或分红修订，须核验官方公告后更新基准');
}
function evaluate(raw,sources,previous,now){
 let cache=previous?.dividendCache||null;
 const warnings=[],checks={},prior=previous?.dividendHealth;
 let manager=false,east=false,conflict=null;
 for(const key of ['dividends','manager']){
  if(!raw[key]){checks[key]={status:'unavailable',error:sources[key]?.error||'未获取到响应'};continue;}
  try{if(key==='dividends'){same(p.dividends(raw[key]));east=true;}else{p.managerCheck(raw[key],baseline.events);manager=true;}checks[key]={status:'verified'};}
  catch(e){conflict=e.message;checks[key]={status:'invalid',error:e.message};}
 }
 // A malformed page or new event is not a transient network outage. Latch until both sources reconcile.
 if(conflict||(prior?.blocked&&!(manager&&east)))return {cache,status:'blocked',blocked:true,error:conflict||prior.error||'分红冲突尚未完成双源复核',checks,warnings};
 if(manager)cache={events:baseline.events,managerVerifiedAt:now.toISOString(),managerHash:sources.manager?.sha256||null};
 if(cache){try{same(cache.events);}catch(e){return {cache:null,status:'blocked',blocked:true,error:'分红缓存与审计基准不一致',checks,warnings};}}
 const age=cache?+now-Date.parse(cache.managerVerifiedAt):Infinity;
 if(!Number.isFinite(age)||age<0||age>7*24*HOUR)return {cache,status:'blocked',blocked:false,error:'分红来源未完成核验，且无7天内有效管理人缓存；暂停新操作。管理人：'+(checks.manager.error||checks.manager.status)+'；东方财富：'+(checks.dividends.error||checks.dividends.status),checks,warnings};
 if(manager){if(!east)warnings.push('东方财富分红暂不可用；管理人实时表已核对，除息日沿用公告审计基准');return {cache,status:'verified',blocked:false,error:null,checks,warnings};}
 if(east&&age<=24*HOUR){warnings.push('管理人分红暂不可用；东方财富实时表与审计基准一致，沿用24小时内管理人核验（'+cache.managerVerifiedAt+'）');return {cache,status:'fallback',blocked:false,error:null,checks,warnings};}
 return {cache,status:'preview',blocked:false,error:'分红实时复核未完成：仅更新行情预览，保留此前策略；管理人最近核验 '+cache.managerVerifiedAt,checks,warnings};
}
module.exports={evaluate,same};
