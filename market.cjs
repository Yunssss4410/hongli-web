'use strict';
const crypto=require('node:crypto'),core=require('./strategy.cjs'),p=require('./cloud-probe.cjs'),baseline=require('./baseline.json'),calendar2026=require('./calendar-2026.json');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function canonicalize(input){
 // Explicit migration of the frozen three-provider audit, not a new price opinion.
 const volumes={'2009-04-24':[133535048,133535100],'2009-08-03':[183743552,183743500],'2021-02-22':[359092551,359092500]};
 return input.filter(b=>b.date>='2009-01-01').map(b=>{const x={...b};if(x.date<=baseline.asof){if(x.date==='2018-04-24'){if(![2.858,2.859].includes(x.close))throw Error('历史审计例外值发生变化');x.close=2.858;}if(volumes[x.date]){const [source,accepted]=volumes[x.date];if(![source,accepted].includes(x.volume))throw Error('历史成交量例外值发生变化');x.volume=accepted;}else x.volume=Math.round(x.volume/100)*100;}return x;});
}
function historicalCheck(rows){
 const b=rows.filter(b=>b.date<=baseline.asof);
 if(b.length!==baseline.count||b[0].date!==baseline.firstDate)throw Error('历史预热数据不完整');
 if(hash(b.map(b=>[b.date,...['open','high','low','close'].map(k=>Math.round(b[k]*1000))]))!==baseline.priceHash)throw Error('历史价格与桌面审计基准不一致，禁止静默改写');
 if(hash(b.map(b=>[b.date,Math.round(b.volume)]))!==baseline.volumeHash)throw Error('历史成交量与桌面审计基准不一致');
 const prepared=core.prepare(rows,baseline.events);
 for(const e of baseline.golden){const r=core.review(prepared,e.nominal.slice(0,10));for(const k of ['lower','middle','upper','rsi','volume_ratio'])if(Math.abs(r[k]-e[k])>1e-8)throw Error('历史策略对照不一致 '+k);for(const k of ['lower_touch','upper_touch','confirm'])if(r[k]!==e[k])throw Error('历史策略信号不一致');}
 return {bars:b.length,golden:baseline.golden.length,cutoff:baseline.asof};
}
function makeCalendar(cal,prior={}){
 const known=new Set(baseline.tradingDates),days={};for(let d='2020-01-01';d<=baseline.asof;d=core.addDays(d,1))days[d]=known.has(d);
 Object.assign(days,calendar2026,prior);
 if(cal)for(let d=cal.year+'-01-01';d<=cal.year+'-12-31';d=core.addDays(d,1))days[d]=core.weekday(d)<5&&!cal.ranges.some(r=>d>=r.from&&d<=r.to);
 return days;
}
function assertEvents(events){if(events.length!==baseline.events.length||events.some((e,i)=>['record_date','ex_date','pay_date'].some(k=>e[k]!==baseline.events[i][k])||Math.abs(e.cash_per_share-baseline.events[i].cash_per_share)>1e-9))throw Error('发现新分红或分红修订，须核验官方公告后更新基准');}
function referenceData(raw,now,previous){
 const warnings=[];let calendar,expected;
 if(raw.calendar){const cal=p.calendar(raw.calendar);expected=p.expectedClose(cal,now);calendar=makeCalendar(cal,previous?.calendar);}
 else{calendar=makeCalendar(null,previous?.calendar);const local=new Date(now.getTime()+8*3600000);let d=local.toISOString().slice(0,10);if(local.getUTCHours()<15)d=core.addDays(d,-1);for(let i=0;i<25;i++,d=core.addDays(d,-1)){if(calendar[d]===undefined)throw Error('已核验日历未覆盖 '+d);if(calendar[d]){expected=d;break;}}if(!expected)throw Error('已核验日历无可用收盘日');warnings.push('上交所网页暂不可达；使用已核验年度日历，不推测未知交易日');}
 const events=raw.dividends?p.dividends(raw.dividends):baseline.events;
 // The live manager must still corroborate every accepted event, including count.
 p.managerCheck(raw.manager||'',events);assertEvents(events);
 if(!raw.dividends)warnings.push('东方财富分红页暂不可达；管理人实时表已核对历史分红，除息日沿用已审计公告基准');
 return {calendar,expected,events,warnings};
}
function assemble(raw,now,previous){
 const {calendar,expected,events,warnings}=referenceData(raw,now,previous);
 const feeds={};for(const k of ['sina','tencent'])if(raw[k])feeds[k]=p.bars(raw[k],k);
 const fresh=Object.keys(feeds).filter(k=>feeds[k].some(b=>b.date===expected));if(!fresh.length)throw Error('日线尚未到应有日期 '+expected);
 if(!feeds.sina)throw Error('新浪完整历史暂不可用；保留上次结果，禁止以短历史重新初始化RSI');
 const rawHistory=feeds.sina.filter(b=>b.date<=expected);
 // For a lagging full-history feed, append Tencent's new dates only for preview.
 if(!fresh.includes('sina')){const last=rawHistory.at(-1)?.date;rawHistory.push(...feeds.tencent.filter(b=>b.date>last&&b.date<=expected));}
 const rows=canonicalize(rawHistory);const audit=historicalCheck(rows);
 let matched=0;
 if(feeds.tencent){const t=new Map(feeds.tencent.filter(b=>b.date<=expected).map(b=>[b.date,b]));for(const b of feeds.sina.filter(b=>b.date<=expected)){const q=t.get(b.date);if(!q)continue;for(const k of ['open','high','low','close'])if(Math.round(q[k]*1000)!==Math.round(b[k]*1000))throw Error('双源价格冲突 '+b.date+' '+k);if(Math.abs(q.volume-b.volume)>55.01)throw Error('双源成交量冲突 '+b.date);matched++;}if(matched<60)throw Error('双源重叠覆盖不足');}
 const snapshot={asof:expected,bars:rows,events,calendar};
 for(let d=baseline.asof;d<=expected;d=core.addDays(d,1)){if(calendar[d]===undefined)throw Error('日历未覆盖 '+d);if(calendar[d]&&!rows.some(b=>b.date===d))throw Error('缺少交易日 '+d);}
 for(const b of rows){core.validateBar(b);if(previous?.acceptedHashes?.[b.date]&&previous.acceptedHashes[b.date]!==hash(b))throw Error('已发布日线被修订 '+b.date);}
 if(fresh.length===2){const alternate=core.prepare(rows.map(b=>{const q=feeds.tencent.find(x=>x.date===b.date);return q&&b.date>baseline.asof?{...b,volume:q.volume}:b;}),events),canonical=core.prepare(rows,events);for(const b of rows.slice(-80))if(core.weekday(b.date)===1){const a=core.review(canonical,b.date),b2=core.review(alternate,b.date);if(a&&b2&&a.confirm!==b2.confirm)throw Error('来源成交量精度改变R信号');}}
 return {snapshot,feeds,status:fresh.length===2?'confirmed':'provisional',audit:{...audit,matchedDays:matched,warnings},acceptedHashes:Object.fromEntries(rows.filter(b=>b.date>baseline.asof).map(b=>[b.date,hash(b)]))};
}
module.exports={hash,canonicalize,historicalCheck,makeCalendar,assertEvents,referenceData,assemble};
