'use strict';
// Raw daily prices only. Never derive a daily quote from an aggregated weekly candle.
function dailyQuote(snapshot){
 const rows=snapshot.bars.filter(b=>b.date<=snapshot.asof),bar=rows.at(-1),prior=rows.at(-2);
 if(!bar||bar.date!==snapshot.asof)throw Error('Daily quote missing expected close');
 const distribution=(snapshot.events||[]).filter(e=>e.ex_date===bar.date).reduce((sum,e)=>sum+e.cash_per_share,0);
 return {date:bar.date,open:bar.open,high:bar.high,low:bar.low,close:bar.close,
  previousDate:prior?.date||null,previousClose:prior?.close??null,
  change:prior?bar.close-prior.close:null,changePercent:prior?(bar.close/prior.close-1)*100:null,
  distribution,basis:'raw_previous_close'};
}
module.exports={dailyQuote};
