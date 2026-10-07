(function(){'use strict';const $=id=>document.getElementById(id),f=(n,d=3)=>Number.isFinite(n)?n.toFixed(d):'—',text=(id,s)=>{$(id).textContent=s;};let snapshot=null,loading=false,loadError=null;
const names={sina:'新浪日线',tencent:'腾讯日线',dividends:'东方财富分红',manager:'基金管理人',calendar:'上交所日历'},why={lower:'触下轨且R确认通过',lower_delayed:'R等待完成',upper:'触及上轨',safety:'均价8.5%保护',recovery:'冻结恢复条件满足',no_lower:'观察窗口未触下轨',no_upper:'观察窗口未触上轨'};
const dateTime=s=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未知';
function expected(calendar,now=new Date()){const d=new Date(now.getTime()+8*3600000);if(d.getUTCHours()<15)d.setUTCDate(d.getUTCDate()-1);for(let i=0;i<25;i++,d.setUTCDate(d.getUTCDate()-1)){const s=d.toISOString().slice(0,10);if(calendar[s]===undefined)return null;if(calendar[s])return s;}return null;}
function renderDaily(s){
 const state=window.webState.dailyState(s,new Date(),loadError),d=state.data,sign=(n,digits)=>Number.isFinite(n)?(n>0?'+':'')+n.toFixed(digits):'—';
 text('daily-status',state.label);$('daily-status').className='daily-badge '+state.tone;
 text('daily-price',f(d?.close));text('daily-change',d&&Number.isFinite(d.change)&&Number.isFinite(d.changePercent)?`${sign(d.change,3)} 元 / ${sign(d.changePercent,2)}%`:'涨跌待补齐');
 const direction=d?.change>0?'upper':d?.change<0?'lower':'';$('daily-price').className=direction;$('daily-change').className=direction;
 text('daily-date',`收盘日期 ${d?.date||'—'} · ${state.rest?'今日休市 · ':''}非实时行情`);
 for(const k of ['open','high','low'])text('daily-'+k,f(d?.[k]));text('daily-previous',f(d?.previousClose));
 text('daily-note',`${state.preview?'初步行情仅供参考，不推进策略。':loadError||s.status==='error'?'以上为旧行情，仅供回顾。':'每日收盘后更新；不作为独立买卖信号。'} 涨跌按未复权价格较${d?.previousDate||'上一交易日'}收盘计算。${d?.distribution?' 当日每份除息 '+f(d.distribution)+' 元，价格跌幅含除息影响，不等于投资总回报。':''}`);
}
function render(){
 if(!snapshot)return;const s=snapshot,c=s.confirmed,st=c?.model?.state,plan=st?.pending,expectedDate=expected(s.calendar||{});
 renderDaily(s);
 const fresh=window.webState.health(s,new Date(),loadError);
 const local=new Date(Date.now()+8*3600000).toISOString(),date=local.slice(0,10),time=local.slice(11,19);
 const dueUnverified=fresh.due;
 const ready=fresh.ready;
 $('quote').hidden=true;
 text('health',`● ${fresh.label} · 策略已确认至 ${c?.asof||'未知'}${expectedDate?' · 应有日期 '+expectedDate:''}\n${fresh.reason}\n最后云端检查 ${dateTime(s.generatedAt)}${s.preview?' · 行情预览至 '+s.preview.asof:''}`);
 if(s.audit?.warnings?.length)$('health').textContent+='\n'+s.audit.warnings.join('；');
 $('health').className='health '+fresh.tone;
 $('recovery-help').hidden=ready;
 if(!st){text('headline','策略状态尚未就绪');text('action','数据核验及历史回放完成后展示，当前不提供交易指令。');text('state-detail','');}
 else{
  const stateName=st.shares?'模拟持仓':st.frozen?'空仓冻结':st.waiting?'空仓 · R等待':'空仓等待';
  text('headline',ready?(plan?(plan.side==='BUY'?'待买入':'待卖出'):st.shares?'持仓等待':st.frozen?'空仓冻结':st.waiting?'等待R观察完成':'空仓等待'):'数据待核验 · 暂不提供新操作');
  text('action',plan?`${ready?'已锁定计划':'保留此前计划'}：${plan.targetDate} 开盘${plan.side==='BUY'?'买入':'卖出'}；${why[plan.reason]||plan.reason}。${dueUnverified?'执行尚未核验，不能视为已成交。':''}`:ready?(st.shares?'未触发退出条件，按规则继续观察。':st.frozen?'等待周二恢复条件；不是自动到期解除。':st.waiting?'等待下一次有效周二复盘，不要求再次触下轨。':'尚无买入信号，继续等待。'):'保留最后一次确认状态，等待数据恢复。');
  text('state-detail',`${ready?'参考状态':'此前已确认状态'}：${stateName} · 确认截至 ${c.asof} · 从2020年起空仓模拟${st.average?' · 模拟均价 '+f(st.average)+' · 保护价 '+f(st.average*.915):''}${st.protection==='WARNING'?' · 已达到8%预警':''}${st.executionAsOf?' · 开盘核验至 '+st.executionAsOf:''}`);
  const q=c.quote;if(ready&&q&&plan?.side==='BUY'&&plan.targetDate>=date){$('quote').hidden=false;if(q.status==='ready'&&!(date===q.targetDate&&time>='09:25:00')){$('premium').disabled=false;updateQuote();}else{$('premium').disabled=true;text('limit','等待可用报价');text('quote-note',q.referenceDate?`等待 ${q.referenceDate} 已核验收盘；不是用轨道价下单。`:'当前不显示可执行限价。');}}
 }
 const display=s.preview?.chart||c?.chart;window.drawWeekChart(display?.rows||[],c?.model?.trades||[],Number($('range').value),display?.asof);
 text('chart-meta',display?`每日收盘更新至 ${display.asof} · 收盘 ${f(display.close)} · 最近一根${display.partial?'未完成':'完整'}周K（${display.sessions??display.rows?.at(-1)?.sessions??'—'}个交易日）${display.noCurrentWeek?' · 本周尚无已收盘K线':''}${s.preview?' · '+(s.preview.reason||'待复核预览'):''} · 非实时行情`:'暂无可展示的已获取行情');
 const report=c?.model?.latestReview,r=report?.signal;
 text('review-title',report?report.date+' · 周二复盘':'周二复盘');text('review-origin',c?`${c.reviewOrigin} · 发布于 ${dateTime(c.reviewPublishedAt)} · 不随每日K线改写`:'');
 text('review-action',r?`当次决定：${({BUY:'安排买入',SELL:'安排卖出',HOLD:'保持当时状态',WAIT_R:'进入R等待',Blocked:'已有待执行计划',SAFETY_SELL:'保护清仓'})[report.decision?.action]||'待核验'} · ${why[report.decision?.reason]||report.decision?.reason||''}`:'该周没有有效观察，或尚无已确认复盘；不消耗R等待。');
 text('review-lower',r?`${r.lower_touch?'已触及':'未触及'} · ${f(r.lower,4)}`:'—');text('review-upper',r?`${r.upper_touch?'已触及':'未触及'} · ${f(r.upper,4)}`:'—');text('review-r',r?`${r.confirm?'通过':'未通过'} · RSI ${f(r.rsi,1)} / 量比 ${f(r.volume_ratio,2)}`:'—');
 text('review-detail',r?`观察 ${r.window_start}～${r.asof}；最低${f(r.windowLow)}，最高${f(r.windowHigh)}；拟合${r.fit_start}～${r.fit_end}，${r.fit_bars}完整周；中轨${f(r.middle,4)}。空仓时触上轨不产生卖出。`:'无有效计算依据');
 if(report?.decision?.action==='SKIP_HOLIDAY'){
  text('review-action','本次普通复盘已跳过 · '+report.decision.reason);
  for(const k of ['lower','upper','r'])text('review-'+k,'本次不判断');
  text('review-detail','周二休市但周一开市时使用周一数据；周一、周二均休市则跳过，不借用周三至周五行情。短交易周照常生成周K，整周休市不造K线。已有计划按已核验交易日历执行，持仓每日保护不取消。');
  if(ready&&!plan)text('action','周一、周二均休市，本次普通复盘已跳过；仓位、R等待与冻结状态保留。等待下一有效周二，开市后仍每日检查保护。');
 }
 $('preview-note').hidden=!s.preview;text('preview-note',s.preview?`已有 ${s.preview.asof} 初步行情；${s.preview.review?.date||''} 初步观察仅参考，不改写本卡正式记录、不推进R等待。`:'');
 const list=$('trades');list.replaceChildren();for(const t of (c?.model?.trades||[]).slice(-12).reverse()){const row=document.createElement('div');row.className='trade';for(const value of [t.date,t.side==='BUY'?'模拟买入':'模拟卖出',f(t.price)+'元']){const el=document.createElement('span');el.textContent=value;row.append(el);}const note=document.createElement('small');note.textContent=`信号 ${t.nominal} · ${why[t.reason]||t.reason} · 历史回放，非真实成交`;row.append(note);list.append(row);}if(!list.children.length)list.textContent='暂无已核验模拟记录。';
 text('timestamps',`云端生成 ${dateTime(s.generatedAt)}；已确认数据 ${c?.asof||'无'}；刷新页面不会启动云端抓取。`);
 if(Date.now()-Date.parse(s.generatedAt)>45*60000&&expectedDate&&(!c||c.asof<expectedDate))$('timestamps').textContent+=' 云端超过45分钟未更新且收盘数据落后，请检查任务排队/失败；定时任务不保证准点。';
 if(s.dividendCache?.managerVerifiedAt)$('timestamps').textContent+=' 分红管理人最近核验 '+dateTime(s.dividendCache.managerVerifiedAt)+'。';
 const sources=$('sources');sources.replaceChildren();for(const [k,label]of Object.entries(names)){const row=document.createElement('div');row.className='source';const a=document.createElement('span'),b=document.createElement('span');a.textContent=label;const item=s.sources?.[k],view=window.webState.sourceView(k,item);b.textContent='● '+view.label;b.className=view.tone;if(k==='calendar'&&item?.lastVerifiedAt){const good=['ok','cached'].includes(item.status),fallback=item.status==='fallback';b.textContent=good?'● 已核验日历可用':fallback?'● 在线核验失败，备用日历可用':'● 日历核验受阻，暂停新指令';b.className=good?'ok':fallback?'warn':'upper';const detail=document.createElement('small');detail.textContent=`覆盖至 ${item.coverageThrough||'未知'}；最近核验 ${dateTime(item.lastVerifiedAt)}。${item.error?'在线详情：'+item.error+'。':''}${item.nextCheckAt?'下次尝试不早于 '+dateTime(item.nextCheckAt)+'（以云端任务实际运行时间为准）。':''}`;b.append(detail);}row.append(a,b);sources.append(row);}
 text('audit',s.audit?`历史指纹 ${s.audit.bars}根；关键复盘对照 ${s.audit.golden}次；双源重叠 ${s.audit.matchedDays}日。获取成功不代表所有检查通过。`:'暂无本轮审计通过记录。');text('rules',`规则 ${s.contract?.id||'未知'} · SHA-256 ${s.contractHash||'未知'}`);
}
function updateQuote(){const q=snapshot?.confirmed?.quote;if(q?.status!=='ready')return;try{const price=window.buyLimit.calculate(q.reference,$('premium').value);text('limit',f(price)+' 元');text('quote-note',`${q.referenceDate} 收盘 ${f(q.close)}${q.distribution?' − 除息 '+f(q.distribution):''} ×（1 + ${$('premium').value}%），向上取至0.001元。仅本次页面试算。`);}catch(e){text('limit','比例无效');text('quote-note',e.message);}}
async function load(){if(loading)return;loading=true;$('refresh').disabled=true;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);try{const r=await fetch('snapshot.json?t='+Date.now(),{cache:'no-store',signal:abort.signal});if(!r.ok)throw Error('HTTP '+r.status);const s=await r.json();if(s.schemaVersion!==1||!Number.isFinite(Date.parse(s.generatedAt)))throw Error('数据格式异常');snapshot=s;loadError=null;render();}catch(e){loadError=e.message;if(snapshot)render();else{text('daily-status','连接失败 · 尚无行情');$('daily-status').className='daily-badge error';text('daily-note','未获取到收盘数据，请稍后刷新。');text('health','● 无法读取最新云端快照：'+e.message+'。请稍后刷新。');$('health').className='health error';text('headline','连接失败 · 当前状态未知');text('action','不以缓存内容作新的交易依据。');$('quote').hidden=true;$('recovery-help').hidden=false;}}finally{clearTimeout(timer);loading=false;$('refresh').disabled=false;}}
$('refresh').onclick=load;$('range').onchange=render;$('premium').oninput=updateQuote;document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});setInterval(()=>{if(!document.hidden)load();},60000);load();
})();
