'use strict';
// Read-only network preflight. No account data, trading signals or raw-feed publication.
const fs=require('node:fs');
const crypto=require('node:crypto');
const URLS={
 sina:'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh510880&scale=240&ma=no&datalen=6000',
 tencent:'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh510880,day,,,2000,bfq',
 dividends:'https://fundf10.eastmoney.com/fhsp_510880.html',
 manager:'https://www.huatai-pb.com/products/zhishu/510880/index.html',
 calendar:'https://www.sse.com.cn/disclosure/dealinstruc/closed/'
};
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Invalid date');return s;}
function bars(text,key){
 const value=JSON.parse(text),rows=key==='sina'?value:value.data?.sh510880?.day;
 if(!Array.isArray(rows)||rows.length<60||rows.length>15000)throw Error('Invalid daily structure/coverage');
 const result=rows.map(x=>key==='sina'?{date:x.day,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume}:{date:x[0],open:+x[1],close:+x[2],high:+x[3],low:+x[4],volume:+x[5]*100});
 result.forEach((b,i)=>{
  date(b.date);if(i&&b.date<=result[i-1].date)throw Error('Duplicate/unordered dates');
  if(['open','high','low','close'].some(k=>!Number.isFinite(b[k])||b[k]<=0)||!Number.isFinite(b.volume)||b.volume<0)throw Error('Invalid price/volume');
  if(b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high)throw Error('Invalid OHLC');
 });return result;
}
const plain=s=>s.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
const tables=html=>[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m=>({text:plain(m[1]),rows:[...m[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1])))}));
function dividends(html){
 const table=tables(html).find(t=>t.text.includes('权益登记日')&&t.text.includes('除息日')&&t.text.includes('每10份'));
 if(!table)throw Error('Dividend table missing');
 const header=table.rows.find(r=>r.includes('权益登记日')&&r.includes('除息日'));
 if(!header)throw Error('Dividend header missing');
 const ri=header.indexOf('权益登记日'),ei=header.indexOf('除息日'),pi=header.findIndex(x=>x.includes('分红发放日'));
 if(pi<0)throw Error('Dividend payment field missing');
 const events=table.rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r[ri]||'')).map(r=>{
  const match=r.join(' ').match(/每10份派现金\s*([\d.]+)元/);if(!match)throw Error('Dividend value missing');
  const e={record_date:date(r[ri]),ex_date:date(r[ei]),pay_date:date(r[pi]),cash_per_share:+match[1]/10};
  if(e.record_date>=e.ex_date||e.pay_date<e.ex_date||!(e.cash_per_share>0))throw Error('Invalid dividend');return e;
 }).sort((a,b)=>a.ex_date.localeCompare(b.ex_date));
 if(!events.length||new Set(events.map(e=>e.ex_date)).size!==events.length)throw Error('Empty/duplicate dividend history');return events;
}
function managerCheck(html,events){
 const table=tables(html).find(t=>t.text.includes('权益登记日')&&t.text.includes('每10份基金份额分红'));
 if(!table)throw Error('Manager dividend table missing');
 const rows=table.rows.filter(r=>/^\d{4}$/.test(r[0]));
 if(rows.length!==events.length)throw Error('Dividend event count differs');
 for(const e of events){const r=rows.find(r=>r[1]===e.record_date);if(!r||r[2]!==e.pay_date||Math.abs(+r[3]/10-e.cash_per_share)>1e-9)throw Error('Manager dividend mismatch');}
 return {events:events.length,latestExDate:events.at(-1).ex_date,scope:'record date, payment date, amount; ex-date still requires official notice validation'};
}
function calendar(html){
 const m=html.match(/<strong>\s*(20\d{2})年休市安排\s*<\/strong>/),table=tables(html).find(t=>t.text.includes('春节')&&t.text.includes('国庆'));
 if(!m||!table)throw Error('Official calendar missing');
 const year=+m[1],ranges=[];
 for(const r of table.rows){const x=r.join(' ').match(/(\d{1,2})月(\d{1,2})日（[^）]+）至(?:(\d{1,2})月)?(\d{1,2})日（[^）]+）休市/);if(x){const fmt=(a,b)=>date(`${year}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}`);const from=fmt(x[1],x[2]),to=fmt(x[3]||x[1],x[4]);if(to<from)throw Error('Reversed holiday');ranges.push({from,to});}}
 if(ranges.length!==7)throw Error('Calendar incomplete');return {year,ranges};
}
function expectedClose(cal,now){
 const local=new Date(now.getTime()+8*3600000);if(local.getUTCFullYear()!==cal.year)throw Error('Calendar does not cover current year');
 const d=new Date(local);if(d.getUTCHours()<15)d.setUTCDate(d.getUTCDate()-1);
 for(let i=0;i<25;i++,d.setUTCDate(d.getUTCDate()-1)){const s=d.toISOString().slice(0,10);if(d.getUTCFullYear()!==cal.year)throw Error('Prior-year calendar unavailable');if(d.getUTCDay()>0&&d.getUTCDay()<6&&!cal.ranges.some(r=>s>=r.from&&s<=r.to))return s;}
 throw Error('No closed trading date');
}
function compare(a,b,asof){
 const first=a.filter(x=>x.date<=asof),second=b.filter(x=>x.date<=asof);
 if(first.at(-1)?.date!==asof||second.at(-1)?.date!==asof)throw Error('Closed daily data not current: expected '+asof);
 const by=new Map(second.map(x=>[x.date,x]));let count=0;
 for(const x of first.slice(-60)){const y=by.get(x.date);if(!y)throw Error('Missing overlap date '+x.date);for(const k of ['open','high','low','close'])if(Math.round(x[k]*1000)!==Math.round(y[k]*1000))throw Error('Price conflict '+x.date+' '+k);if(Math.abs(x.volume-y.volume)>50.01)throw Error('Volume conflict '+x.date);count++;}
 if(count<60)throw Error('Insufficient overlap');return {asof,matchedDays:count,priceTolerance:'0.001 CNY tick',volumeToleranceShares:50.01};
}
async function request(url){
 const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch(url,{signal:controller.signal,redirect:'error',headers:{'User-Agent':'hongli-web-data-validation/0.1','Accept':'application/json,text/html;q=0.9,*/*;q=0.8'}});
  if(!r.ok)throw Error('HTTP '+r.status);const chunks=[];let bytes=0;
  for await(const chunk of r.body){bytes+=chunk.length;if(bytes>4000000)throw Error('Response too large');chunks.push(chunk);}
  const buffer=Buffer.concat(chunks),charset=/charset\s*=\s*["']?([^;\s"']+)/i.exec(r.headers.get('content-type')||'')?.[1]||'utf-8';
  return {text:new TextDecoder(charset).decode(buffer),bytes,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),elapsedMs:Date.now()-start};
 }finally{clearTimeout(timer);}
}
async function run(){
 const now=new Date(),result={schemaVersion:1,generatedAt:now.toISOString(),runtime:process.version,environment:process.env.GITHUB_ACTIONS==='true'?'github-actions':'local',purpose:'network-and-schema-validation-only',sources:{},checks:{},ready:false},raw={};
 await Promise.all(Object.entries(URLS).map(async([key,url])=>{try{const response=await request(url);raw[key]=response.text;const {text,...metadata}=response;const parsed=['sina','tencent'].includes(key)?bars(text,key):key==='calendar'?calendar(text):key==='dividends'?dividends(text):null;result.sources[key]={status:'ok',...metadata,...(['sina','tencent'].includes(key)?{rows:parsed.length,firstDate:parsed[0].date,lastDate:parsed.at(-1).date}:{})};}catch(e){result.sources[key]={status:'error',error:e.message};}}));
 const check=(name,fn)=>{try{result.checks[name]={status:'ok',...fn()};}catch(e){result.checks[name]={status:'error',error:e.message};}};
 check('calendar',()=>{const c=calendar(raw.calendar||'');return {year:c.year,expectedClose:expectedClose(c,now)};});
 check('dailyConsensus',()=>{const asof=result.checks.calendar.expectedClose;if(!asof)throw Error('Unknown expected date');return compare(bars(raw.sina||'','sina'),bars(raw.tencent||'','tencent'),asof);});
 check('dividendCorroboration',()=>managerCheck(raw.manager||'',dividends(raw.dividends||'')));
 result.ready=Object.values(result.sources).every(s=>s.status==='ok')&&Object.values(result.checks).every(s=>s.status==='ok');
 fs.mkdirSync('probe-output',{recursive:true});fs.writeFileSync('probe-output/report.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## 510880 cloud data probe\n\nThis is a transport/schema check, not a trading decision or production readiness certificate. No raw market history or private account data is published.\n\n```json\n'+JSON.stringify(result,null,2)+'\n```\n');
 if(!result.ready)process.exitCode=1;return result;
}
module.exports={URLS,request,bars,dividends,managerCheck,calendar,expectedClose,compare};
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
