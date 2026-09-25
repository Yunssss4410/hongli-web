'use strict';
// Calendar is reference data, not a quote feed. Persist policy through published snapshots.
const p=require('./cloud-probe.cjs'),core=require('./strategy.cjs'),builtIn=require('./calendar-2026.json');
const DAY=86400000,MAX_AGE=7*DAY;
const BUILTIN_CHECK='2026-09-25T06:52:39.000Z'; // successful official-source cloud validation recorded in DEVELOPMENT.md
function validateDays(days){
 if(!days||typeof days!=='object'||Array.isArray(days))throw Error('日历缓存格式异常');
 const keys=Object.keys(days).sort();if(!keys.length)throw Error('日历缓存为空');
 for(const d of keys){core.dateMs(d);if(typeof days[d]!=='boolean'||(core.weekday(d)>4&&days[d]))throw Error('日历缓存日期非法 '+d);}
 for(let d=keys[0];d<=keys.at(-1);d=core.addDays(d,1))if(days[d]===undefined)throw Error('日历缓存缺日 '+d);
 return {from:keys[0],through:keys.at(-1)};
}
function parsedDays(html){const cal=p.calendar(html),days={};for(let d=cal.year+'-01-01';d<=cal.year+'-12-31';d=core.addDays(d,1))days[d]=core.weekday(d)<5&&!cal.ranges.some(r=>d>=r.from&&d<=r.to);return days;}
function compatible(old,next){for(const [d,open]of Object.entries(next))if(old[d]!==undefined&&old[d]!==open)throw Error('官方日历与已核验日历冲突 '+d+'；需人工核对公告');}
function usable(cache,now){const coverage=validateDays(cache.days),today=new Date(+now+8*3600000).toISOString().slice(0,10),age=+now-Date.parse(cache.verifiedAt);if(!Number.isFinite(age)||age<0||age>MAX_AGE)throw Error('日历超过7天未完成官方核验，暂停新指令');if(today<coverage.from||today>coverage.through)throw Error('已核验日历未覆盖 '+today);return coverage;}
async function acquireCalendar(previous,now,request=p.request){
 let cache=previous?.calendarCache||{days:builtIn,verifiedAt:BUILTIN_CHECK,url:p.URLS.calendar};
 const before=previous?.sources?.calendar||{},attempt=now.toISOString();
 let source={...before,status:'blocked',url:p.URLS.calendar},error=null;
 try{validateDays(cache.days);compatible(builtIn,cache.days);}catch(e){return {cache,source:{...source,error:e.message,blocked:true},error:e.message};}
 const due=!before.nextCheckAt||!Number.isFinite(Date.parse(before.nextCheckAt))||Date.parse(before.nextCheckAt)<=+now;
 if(due){
  source={url:p.URLS.calendar,lastAttemptAt:attempt,lastVerifiedAt:cache.verifiedAt,failures:before.failures||0};
  let response;
  try{response=await request(p.URLS.calendar);}catch(e){
   source.failures++;source.error=e.message;source.status='fallback';source.blocked=Boolean(before.blocked);
   source.nextCheckAt=new Date(+now+Math.min(6,2**Math.min(3,source.failures-1))*3600000).toISOString();
  }
  if(response){
   try{const days=parsedDays(response.text);compatible(cache.days,days);
    const merged={...cache.days,...days};validateDays(merged);
    // An obsolete official page does not refresh the current year's verification clock.
    const today=new Date(+now+8*3600000).toISOString().slice(0,10);if(days[today]===undefined)throw Error('官方日历未覆盖当前日期 '+today);
    cache={days:merged,verifiedAt:attempt,url:p.URLS.calendar};
    source={...source,status:'ok',failures:0,lastVerifiedAt:attempt,blocked:false,nextCheckAt:new Date(+now+DAY).toISOString()};
   }catch(e){source={...source,status:'blocked',blocked:true,error:e.message,nextCheckAt:new Date(+now+3600000).toISOString()};}
  }
 }else source.status=before.blocked?'blocked':before.error?'fallback':'cached';
 try{const coverage=usable(cache,now);Object.assign(source,{coverageFrom:coverage.from,coverageThrough:coverage.through,lastVerifiedAt:cache.verifiedAt});if(source.blocked)throw Error(source.error||'日历冲突尚未解决');}
 catch(e){error=e.message;source.status='blocked';source.error=error;}
 return {cache,source,error};
}
module.exports={acquireCalendar,validateDays,parsedDays,compatible,usable};
