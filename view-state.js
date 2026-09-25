(function(root){'use strict';function freshness(s,now=new Date()){
 const d=new Date(now.getTime()+8*3600000),date=d.toISOString().slice(0,10),time=d.toISOString().slice(11,19),at=new Date(d);
 if(time<'15:00:00')at.setUTCDate(at.getUTCDate()-1);
 const review=new Date(at);while(review.getUTCDay()!==2)review.setUTCDate(review.getUTCDate()-1);
 const expectedReview=review.toISOString().slice(0,10);let expected=null;
 for(let i=0;i<25;i++,at.setUTCDate(at.getUTCDate()-1)){const day=at.toISOString().slice(0,10);if(s.calendar?.[day]===undefined)break;if(s.calendar[day]){expected=day;break;}}
 const c=s.confirmed,p=c?.model?.state?.pending,reviewStale=!c?.model?.latestReview||c.model.latestReview.date<expectedReview;
 const due=Boolean(p&&(p.targetDate<date||(p.targetDate===date&&time>='09:35:00')));
 const stale=!expected||!c||c.asof<expected||Date.parse(s.generatedAt)>now.getTime()+300000||reviewStale;
 return {date,time,expected,expectedReview,reviewStale,due,stale,ready:s.status==='confirmed'&&!stale&&!due&&!s.testOnly};
}const api={freshness};if(typeof module==='object'&&module.exports)module.exports=api;else root.webState=api;})(typeof window==='object'?window:globalThis);
