'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {optimizeFile}=require('../src/optimizer.cjs');
const {optimizeToTarget}=require('../src/target-optimizer.cjs');
let canceled=false;parentPort.on('message',message=>{if(message==='cancel')canceled=true;});
(async()=>{
  const results=[];
  for(let i=0;i<workerData.files.length;i++){
    if(canceled)break;
    const file=workerData.files[i];
    parentPort.postMessage({type:'progress',id:file.id,fileIndex:i+1,fileTotal:workerData.files.length,phase:'reading'});
    try{
      const optimize=workerData.options.mode==='target'?optimizeToTarget:optimizeFile;
      const result=await optimize(file.path,{...workerData.options,isCanceled:()=>canceled,onProgress:p=>parentPort.postMessage({type:'progress',id:file.id,fileIndex:i+1,fileTotal:workerData.files.length,...p})});
      results.push({id:file.id,ok:true,...result});
    }catch(e){
      if(e.code==='CANCELED')break;
      results.push({id:file.id,ok:false,error:e.message});
    }
    parentPort.postMessage({type:'result',result:results.at(-1)});
  }
  parentPort.postMessage({type:'done',results,canceled});parentPort.close();
})().catch(e=>{parentPort.postMessage({type:'fatal',error:e.message});parentPort.close();});
