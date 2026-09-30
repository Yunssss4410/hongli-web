(function(root){'use strict';function freshness(s,now=new Date()){
 const d=new Date(now.getTime()+8*3600000),date=d.toISOString().slice(0,10),time=d.toISOString().slice(11,19),at=new Date(d);
 if(time<'15:00:00')at.setUTCDate(at.getUTCDate()-1);
 const review=new Date(at);while(review.getUTCDay()!==2)review.setUTCDate(review.getUTCDate()-1);
 const expectedReview=review.toISOString().slice(0,10);let expected=null;
 for(let i=0;i<25;i++,at.setUTCDate(at.getUTCDate()-1)){const day=at.toISOString().slice(0,10);if(s.calendar?.[day]===undefined)break;if(s.calendar[day]){expected=day;break;}}
 const c=s.confirmed,p=c?.model?.state?.pending,reviewStale=!c?.model?.latestReview||c.model.latestReview.date<expectedReview;
 const due=Boolean(p&&(p.targetDate<date||(p.targetDate===date&&time>='09:35:00')));
 const generated=Date.parse(s.generatedAt);
 const stale=!expected||!c||c.asof<expected||!Number.isFinite(generated)||generated>now.getTime()+300000||reviewStale;
 return {date,time,expected,expectedReview,reviewStale,due,stale,ready:s.status==='confirmed'&&!stale&&!due&&!s.testOnly};
}
function health(s,now=new Date(),loadError=null){
 const f=freshness(s,now),ready=f.ready&&!loadError;
 const overdue=!ready&&now.getTime()-Date.parse(s.generatedAt)>45*60000;
 let reason=loadError?'网页刷新失败：'+loadError+'；旧内容仅供回顾':s.testOnly?'开发测试快照，不能用于交易':!Number.isFinite(Date.parse(s.generatedAt))||Date.parse(s.generatedAt)>now.getTime()+300000?'设备时间或快照时间异常':s.error||(!f.expected?'交易日历不足，无法确定应有数据日期':f.due?'已到执行时点，开盘执行数据待核验':f.reviewStale?'本周二复盘尚未完成':s.status==='provisional'?(s.preview?.reason||'先到数据待交叉复核')+'；不推进正式策略':!ready?'已确认数据落后，等待新收盘核验':'行情与策略检查通过');
 if(overdue)reason+='。云端超过45分钟未更新且尚未完成核验；请检查任务排队或失败，刷新网页不会启动抓取';
 return {...f,ready,overdue,reason,tone:loadError||s.status==='error'?'error':ready&&!s.audit?.warnings?.length?'ok':'warn',label:loadError?'网页连接失败':ready?'数据复核通过':s.status==='error'?'核验受阻':'等待核验'};
}
function sourceView(key,item={}){
 if(['sina','tencent'].includes(key)){
  if(item.status!=='ok')return {tone:'upper',label:item.error||'未获取'};
  if(item.validation==='invalid')return {tone:'upper',label:'响应解析失败 · '+(item.validationError||'数据格式异常')};
  return {tone:item.validation==='verified'?'ok':'warn',label:`数据截至 ${item.dataDate||'未知'} · ${item.validation==='verified'?'已复核':item.validation==='lagging'?'更新落后':'待核验'}`};
 }
 return {tone:item.validation==='verified'?'ok':item.status==='error'||item.validation==='invalid'?'upper':'warn',label:item.validation==='verified'?'已核验':item.validation==='invalid'?'核验未通过':item.status==='ok'?'已获取 · 待核验':item.error||'未检查'};
}
function dailyState(s,now=new Date(),loadError=null){
 const f=freshness(s,now),preview=Boolean(s.preview?.daily),c=s.confirmed;
 let data=s.preview?.daily||c?.daily||(c?{date:c.asof,close:c.close}:null);
 const complete=data&&['open','high','low','close','previousClose','change','changePercent'].every(k=>Number.isFinite(data[k]));
 let label,tone='warn';
 if(loadError){label='连接失败 · 保留旧行情';tone='error';}
 else if(s.testOnly)label='测试数据 · 不用于交易';
 else if(!Number.isFinite(Date.parse(s.generatedAt))||Date.parse(s.generatedAt)>now.getTime()+300000){label='时间异常 · 暂停展示';data=null;tone='error';}
 else if(s.calendar?.[f.date]===undefined||!f.expected)label='日历待核验';
 else if(data?.date>f.expected){label='收盘日期异常 · 暂停展示';data=null;tone='error';}
 else if(s.status==='error'){label='核验受阻 · 保留旧行情';tone='error';}
 else if(!data)label='等待收盘数据';
 else if(data.date<f.expected)label=s.calendar[f.date]&&f.time>='15:00:00'?'今日待更新':'最近收盘待更新';
 else if(preview||s.status!=='confirmed')label='初步行情 · 待复核';
 else if(!complete)label='日行情明细待补齐';
 else if(!s.calendar[f.date]){label='休市 · 最近收盘已复核';tone='ok';}
 else if(f.time<'15:00:00'){label='今日收盘后更新';tone='neutral';}
 else{label='今日已更新 · 已复核';tone='ok';}
 return {data,label,tone,preview,rest:s.calendar?.[f.date]===false};
}
const api={freshness,health,sourceView,dailyState};if(typeof module==='object'&&module.exports)module.exports=api;else root.webState=api;})(typeof window==='object'?window:globalThis);
