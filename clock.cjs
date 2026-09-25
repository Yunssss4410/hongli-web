'use strict';
const {addDays,weekday,dateMs}=require('./strategy.cjs');
const CLOSE_TIME='15:00:00';
function shanghai(now=new Date()){
  const d=new Date(now.getTime()+8*3600000);
  return {date:d.toISOString().slice(0,10),time:d.toISOString().slice(11,19)};
}
const instant=(date,time)=>{dateMs(date);return new Date(`${date}T${time}+08:00`).toISOString();};
function nextReview(now){
  const {date,time}=shanghai(now);
  for(let n=0;n<8;n++){const day=addDays(date,n);if(weekday(day)===1&&(n>0||time<CLOSE_TIME))return day;}
}
function lastClosed(calendar,now){
  const local=shanghai(now);
  let d=local.time>=CLOSE_TIME?local.date:addDays(local.date,-1);
  for(let i=0;i<25;i++,d=addDays(d,-1)){
    if(calendar[d]===undefined)throw Error('交易日历未覆盖 '+d);
    if(calendar[d])return d;
  }
  throw Error('缺少可确认的最近交易日');
}
module.exports={shanghai,instant,nextReview,lastClosed,CLOSE_TIME};
