'use strict';
// The first attempt is published separately. Bounded retries never relax checks.
async function recover({attempt, previous, sleep=ms=>new Promise(r=>setTimeout(r,ms)), now=()=>new Date(), maxAttempts=12, intervalMs=120000, maxElapsedMs=24*60000, report=()=>{}}){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>12)throw Error('Recovery attempt budget must be 1–12');
 if(!Number.isFinite(intervalMs)||intervalMs<1000||!Number.isFinite(maxElapsedMs)||maxElapsedMs<0||maxElapsedMs>24*60000)throw Error('Invalid recovery time budget');
 let output,lastError=null;
 const startedAt=now().toISOString();
 const deadline=Date.parse(startedAt)+maxElapsedMs;
 for(let n=1;n<=maxAttempts;n++){
  if(n>1){if(now().getTime()+intervalMs>=deadline)break;await sleep(intervalMs);if(now().getTime()>=deadline)break;}
  try{
   output=await attempt({previous,recovery:{startedAt,deadlineAt:new Date(deadline).toISOString(),attempt:n,maxAttempts,intervalSeconds:intervalMs/1000}});
   previous=output;lastError=null;report({attempt:n,status:output.status});
   if(require('./schedule.cjs').completion(output,now()).complete)return output;
  }catch(e){lastError=e;report({attempt:n,error:e.message});}
 }
 // A later crash must not publish an earlier intermediate file as the final attempt.
 if(lastError)throw lastError;
 return output;
}
module.exports={recover};
if(require.main===module){
 const fs=require('node:fs'),seed='recovery-seed/snapshot.json';
 recover({previous:fs.existsSync(seed)?JSON.parse(fs.readFileSync(seed,'utf8')):undefined,attempt:require('./build.cjs').build,report:r=>console.log('Recovery '+JSON.stringify(r))}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
