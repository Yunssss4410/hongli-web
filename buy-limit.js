(function(root){
  'use strict';
  function percent(value){
    if((typeof value!=='number'&&typeof value!=='string')||String(value).trim()==='')throw Error('请输入加价比例');
    const n=Number(value);
    if(!Number.isFinite(n)||n<0||n>5||Math.abs(n*100-Math.round(n*100))>1e-7)throw Error('加价比例须为0～5%，最多两位小数');
    return n;
  }
  function calculate(reference,value){
    const p=percent(value);
    if(!Number.isFinite(reference)||reference<=0)throw Error('参考价无效');
    return Math.ceil(reference*(1+p/100)*1000-1e-8)/1000;
  }
  const api={percent,calculate};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.buyLimit=Object.freeze(api);
})(typeof window==='object'?window:globalThis);
