'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(initialFailure=false){
 const elements={};function element(){return {textContent:'',hidden:false,children:[],value:'52',append(...children){this.children.push(...children);},replaceChildren(){this.children=[];}};}
 for(const id of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))elements[id[1]]=element();
 let fail=initialFailure;const snapshot={schemaVersion:1,status:'confirmed',generatedAt:'2026-09-30T08:00:00Z',calendar:{'2026-09-30':true},confirmed:{asof:'2026-09-30',model:{state:{shares:0},trades:[],latestReview:{date:'2026-09-29'}},chart:{asof:'2026-09-30',close:3.368,partial:false,rows:[]}}};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-09-30T08:10:00Z']));}static now(){return Date.parse('2026-09-30T08:10:00Z');}}
 const context={Date:FixedDate,document:{getElementById:id=>{assert.ok(elements[id],id);return elements[id];},createElement:element,addEventListener(){}},window:{webState:require('./view-state.js'),drawWeekChart(){},buyLimit:require('./buy-limit.js')},AbortController,setTimeout:()=>1,clearTimeout(){},setInterval(){},fetch:async()=>{if(fail)throw Error('network offline');return {ok:true,json:async()=>structuredClone(snapshot)};}};
 vm.runInNewContext(fs.readFileSync('app.js','utf8'),context);
 return {elements,snapshot,setFailure:v=>{fail=v;},settle:()=>new Promise(r=>setImmediate(r))};
}
test('actual page script: load failure stays red after changing chart range, success clears it',async()=>{
 const h=harness();await h.settle();assert.match(h.elements.health.textContent,/数据复核通过/);assert.equal(h.elements['recovery-help'].hidden,true);
 h.setFailure(true);await h.elements.refresh.onclick();assert.match(h.elements.health.textContent,/网页连接失败/);assert.equal(h.elements.quote.hidden,true);
 h.elements.range.value='26';h.elements.range.onchange();assert.match(h.elements.health.textContent,/网页连接失败/);assert.match(h.elements.headline.textContent,/暂不提供新操作/);assert.equal(h.elements['recovery-help'].hidden,false);
 h.setFailure(false);await h.elements.refresh.onclick();assert.match(h.elements.health.textContent,/数据复核通过/);assert.equal(h.elements['recovery-help'].hidden,true);
});
test('actual page script separates preview date from confirmed date and frozen Tuesday record',async()=>{
 const h=harness();await h.settle();h.snapshot.status='provisional';h.snapshot.confirmed.asof='2026-09-29';h.snapshot.preview={asof:'2026-09-30',reason:'单源行情待交叉复核',chart:{asof:'2026-09-30',close:3.368,partial:false,rows:[]}};await h.elements.refresh.onclick();
 assert.match(h.elements.health.textContent,/策略已确认至 2026-09-29/);assert.match(h.elements.health.textContent,/行情预览至 2026-09-30/);assert.match(h.elements['chart-meta'].textContent,/2026-09-30/);assert.match(h.elements['review-title'].textContent,/2026-09-29/);assert.match(h.elements['state-detail'].textContent,/此前已确认状态/);
});
test('daily card shows close, signed change, raw OHLC and keeps failure state across chart change',async()=>{
 const h=harness();await h.settle();h.snapshot.confirmed.daily={date:'2026-09-30',open:3.325,high:3.372,low:3.324,close:3.368,previousClose:3.342,previousDate:'2026-09-29',change:.026,changePercent:.777977,distribution:0};await h.elements.refresh.onclick();
 assert.equal(h.elements['daily-price'].textContent,'3.368');assert.equal(h.elements['daily-change'].textContent,'+0.026 元 / +0.78%');assert.equal(h.elements['daily-open'].textContent,'3.325');assert.equal(h.elements['daily-price'].className,'upper');assert.match(h.elements['daily-status'].textContent,/已复核/);
 h.setFailure(true);await h.elements.refresh.onclick();h.elements.range.onchange();assert.match(h.elements['daily-status'].textContent,/连接失败/);assert.match(h.elements['daily-status'].className,/error/);assert.equal(h.elements['daily-price'].textContent,'3.368');
});
test('initial load failure does not leave the daily card stuck at loading',async()=>{const h=harness(true);await h.settle();assert.equal(h.elements['daily-status'].textContent,'连接失败 · 尚无行情');assert.match(h.elements['daily-status'].className,/error/);});
