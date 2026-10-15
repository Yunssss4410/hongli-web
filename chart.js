(function(){'use strict';const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg',f=(n,d=3)=>Number.isFinite(n)?n.toFixed(d):'—';
window.drawWeekChart=function(rows,trades,count,asof){
 const svg=$('chart');svg.replaceChildren();$('inspector').hidden=true;
 const data=rows.slice(-count);if(!data.length)return;
 const add=(tag,attrs,text,parent=svg)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(text!==undefined)el.textContent=text;parent.append(el);return el;};
 const values=data.flatMap(r=>[r.low,r.high,r.lower,r.upper]).filter(Number.isFinite),lo=Math.min(...values),hi=Math.max(...values),span=(hi-lo)||.1,min=lo-span*.1,max=hi+span*.13;
 const width=Math.max(300,Math.min(720,svg.clientWidth||720)),right=width-15,plot=width-85;svg.setAttribute('viewBox',`0 0 ${width} 320`);
 const x=i=>58+(i+.5)*plot/data.length,y=v=>270-(v-min)/(max-min)*240,w=Math.max(2,plot/data.length*.55);
 for(let i=0;i<5;i++){const v=min+(max-min)*i/4;add('line',{x1:55,x2:right,y1:y(v),y2:y(v),stroke:'#d6dacb'});add('text',{x:4,y:y(v)+4,fill:'#586959','font-size':12},f(v));}
 const weekTrades=d=>trades.filter(t=>t.date>=d.week&&t.date<=d.weekEnd);
 for(const [i,d]of data.entries()){if(d.partial)add('rect',{x:x(i)-w,y:22,width:w*2,height:252,fill:'#fff0c9',stroke:'#9b701c','stroke-dasharray':'4 3'});const color=d.close>=d.open?'#ac4b3b':'#447655';add('line',{x1:x(i),x2:x(i),y1:y(d.high),y2:y(d.low),stroke:color});add('rect',{x:x(i)-w/2,y:y(Math.max(d.open,d.close)),width:w,height:Math.max(1,Math.abs(y(d.open)-y(d.close))),fill:color,'data-week':d.week});for(const t of weekTrades(d)){const buy=t.side==='BUY',py=buy?y(d.low)+15:y(d.high)-10;add('text',{x:x(i),y:py,'text-anchor':'middle','font-size':12,fill:buy?'#005f56':'#a62f20'},buy?'▲':'▼');}}
 for(const [key,color]of [['lower','#006657'],['upper','#ab3524']]){
  let points=[];const flush=()=>{
   const attrs={fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':'5 3','data-band':key};
   if(points.length===1){const i=points[0],half=Math.max(2,Math.min(6,w/2));add('line',{...attrs,x1:x(i)-half,x2:x(i)+half,y1:y(data[i][key]),y2:y(data[i][key]),'data-band-single':data[i].week});}
   else if(points.length>1)add('polyline',{...attrs,points:points.map(i=>x(i)+','+y(data[i][key])).join(' ')});
   points=[];
  };
  data.forEach((d,i)=>Number.isFinite(d[key])?points.push(i):flush());flush();
 }
 add('text',{x:55,y:308,fill:'#536250','font-size':12},data[0].firstDate);add('text',{x:right,y:308,fill:'#536250','font-size':12,'text-anchor':'end'},data.at(-1).date);
 const cross=add('g',{'pointer-events':'none',visibility:'hidden'}),vl=add('line',{y1:22,y2:280,stroke:'#344c55','stroke-dasharray':'3 3'},undefined,cross),hl=add('line',{x1:55,x2:right,stroke:'#344c55','stroke-dasharray':'3 3'},undefined,cross),rect=add('rect',{x:0,width:53,height:19,fill:'#263e43'},undefined,cross),pt=add('text',{x:26,fill:'#fff','font-size':11,'text-anchor':'middle'},'',cross),dr=add('rect',{y:283,width:94,height:20,fill:'#263e43'},undefined,cross),dt=add('text',{y:297,fill:'#fff','font-size':11,'text-anchor':'middle'},'',cross);
 let selected=data.length-1;
 function show(index,py=150){selected=Math.max(0,Math.min(data.length-1,index));const d=data[selected],cy=Math.max(25,Math.min(270,py));cross.setAttribute('visibility','visible');vl.setAttribute('x1',x(selected));vl.setAttribute('x2',x(selected));hl.setAttribute('y1',cy);hl.setAttribute('y2',cy);rect.setAttribute('y',cy-10);pt.setAttribute('y',cy+4);pt.textContent=f(min+(270-cy)/240*(max-min));const dx=Math.max(103,Math.min(right-47,x(selected)));dr.setAttribute('x',dx-47);dt.setAttribute('x',dx);dt.textContent=d.date;
  $('inspector').hidden=false;$('selected-week').textContent=`${d.firstDate} — ${d.date} · ${d.partial?'未完成周':'完整周'}`;
  $('selected-prices').textContent=`图价 开 ${f(d.open)}　高 ${f(d.high)}　低 ${f(d.low)}　收 ${f(d.close)}`;
  $('selected-change').textContent=`原价周涨跌 ${d.changePct>0?'+':''}${f(d.changePct,2)}%${d.dividend?' · 本周除息 '+f(d.dividend)+'元/份，涨跌含除息影响':''}`;
  $('selected-change').className=d.changePct>=0?'upper':'lower';
  const bandNotes={holiday_reference:'参考轨道 · 本周普通复盘休市跳过，不产生新信号',missing_observation:'观察窗口行情或日历不完整，未补画轨道',insufficient_history:'此前不足52个有效完整周，未补画轨道',invalid_adjusted_price:'复权价格不满足计算条件，未补画轨道'};
  $('selected-bands').textContent=`下轨 ${f(d.lower,4)}　上轨 ${f(d.upper,4)} · 最低日 ${d.lowDates.join('、')}；${bandNotes[d.bandStatus]||'图示参考，正式触轨判断见周二复盘'}`;
  $('selected-trades').textContent=weekTrades(d).map(t=>`${t.date} 模拟${t.side==='BUY'?'买入':'卖出'} ${f(t.price)}元`).join('；')||'该周无模拟成交';
  $('selected-raw').textContent=`当时原价：开${f(d.raw.open)} / 高${f(d.raw.high)} / 低${f(d.raw.low)} / 收${f(d.raw.close)}。图价复权至${asof}；不是当时成交价。`;
  svg.dataset.selectedWeek=d.week;
 }
 const point=e=>{const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const matrix=svg.getScreenCTM();return matrix?pt.matrixTransform(matrix.inverse()):null;};
 const select=e=>{const p=point(e);if(p)show(Math.round((p.x-58)/(plot/data.length)-.5),p.y);};
 svg.onpointermove=e=>{if(e.pointerType==='mouse'||e.buttons)select(e);};svg.onpointerdown=select;
 svg.onpointerleave=()=>cross.setAttribute('visibility','hidden');svg.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape'){$('inspector').hidden=true;cross.setAttribute('visibility','hidden');return;}show(e.key==='Home'?0:e.key==='End'?data.length-1:selected+(e.key==='ArrowLeft'?-1:1));}};
};})();
