'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 class El{constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.dataset={};this.clientWidth=720;}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}append(el){this.children.push(el);}replaceChildren(){this.children=[];}}
 const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,new El(id));return nodes.get(id);},createElementNS(ns,tag){return new El(tag);}};
 const window={};vm.runInNewContext(fs.readFileSync(__dirname+'/chart.js','utf8'),{window,document});return {nodes,window};
}
function row(week,lower=2.9){return {week,weekEnd:week,date:week,firstDate:week,open:3,close:3,high:3.1,low:2.9,lower,upper:lower===null?null:3.1,lowDates:[week],raw:{open:3,high:3.1,low:2.9,close:3},changePct:0};}
test('isolated latest bands are visible horizontal strokes, never invisible one-point polylines',()=>{
 const {nodes,window}=harness(),rows=[row('2026-09-21'),row('2026-09-28'),row('2026-10-05',null),row('2026-10-12')];window.drawWeekChart(rows,[],52,'2026-10-12');
 const bands=nodes.get('chart').children.filter(e=>e.attrs['data-band']);a.equal(bands.length,4);
 for(const k of ['lower','upper']){const parts=bands.filter(e=>e.attrs['data-band']===k);a.equal(parts[0].tag,'polyline');a.equal(parts[0].attrs.points.split(' ').length,2);a.equal(parts[1].tag,'line');a.equal(parts[1].attrs['data-band-single'],'2026-10-12');a.ok(Number(parts[1].attrs.x2)>Number(parts[1].attrs.x1));}
});
test('hover distinguishes holiday reference from genuine insufficient-history gaps',()=>{
 const {nodes,window}=harness(),r=row('2026-10-05');r.bandStatus='holiday_reference';window.drawWeekChart([r],[],52,r.date);nodes.get('chart').onkeydown({key:'End',preventDefault(){}});a.match(nodes.get('selected-bands').textContent,/普通复盘休市跳过/);
 r.lower=r.upper=null;r.bandStatus='insufficient_history';window.drawWeekChart([r],[],52,r.date);nodes.get('chart').onkeydown({key:'End',preventDefault(){}});a.match(nodes.get('selected-bands').textContent,/不足52/);a.equal(nodes.get('chart').children.filter(e=>e.attrs['data-band']).length,0);
});
