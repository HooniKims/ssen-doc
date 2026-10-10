'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {optimizeFile,uniqueCommit}=require('./optimizer.cjs');
function cancel(fn){if(fn?.()){const e=Error('작업을 중지했습니다.');e.code='CANCELED';throw e;}}
async function optimizeToTarget(input,{targetBytes,targetRatio,outputFolder,convertOpaquePng=true,isCanceled,onProgress=()=>{},...options}={}){
  const info=await fs.stat(input),folder=path.resolve(outputFolder||path.dirname(input));
  const target=targetBytes??Math.floor(info.size*targetRatio);
  if(!Number.isFinite(target)||target<1||target>=info.size)throw Error('목표 용량은 원본보다 작고 0보다 커야 합니다.');
  const work=await fs.mkdtemp(path.join(folder,'.ssenlite-target-'));
  let best,smallest,attempt=0;
  const attempts=[];
  async function run(quality,edge){
    cancel(isCanceled);attempt++;
    const result=await optimizeFile(input,{...options,profile:{quality,edge},convertOpaquePng,outputFolder:work,isCanceled,onProgress:p=>onProgress({...p,attempt,targetBytes:target,phase:p.phase==='verifying'?'search-verifying':'searching'})});
    const trial={...result,encoding:{quality,edge}};
    attempts.push({quality,edge,bytes:result.after});
    const oldPaths=new Set([best?.path,smallest?.path]);
    if(!smallest||trial.after<smallest.after)smallest=trial;
    if(trial.after<=target)best=trial;
    for(const p of new Set([...oldPaths,trial.path]))if(p&&p!==best?.path&&p!==smallest?.path)await fs.unlink(p);
    return trial;
  }
  async function refine(low,high,edge){
    while(low<high){const mid=Math.ceil((low+high)/2);const r=await run(mid,edge);if(r.after<=target)low=mid;else high=mid-1;}
  }
  try{
    const first=await run(98,null);
    const maxEdge=Math.max(0,...first.records.map(r=>Math.max(r.beforeWidth||0,r.beforeHeight||0)));
    const lossy=first.records.some(r=>r.format==='jpeg');
    if(!best&&maxEdge){
      if(lossy){const low=await run(60,null);if(low.after<=target)await refine(60,97,null);}
      if(!best){
        for(const edge of [3200,2400,1800,1400,1000,800,640]){
          if(edge>=maxEdge)continue;
          const trial=await run(60,edge);
          if(trial.after<=target){if(lossy)await refine(60,98,edge);break;}
        }
      }
    }
    cancel(isCanceled);
    const current=await fs.stat(input);
    if(current.size!==info.size||current.mtimeMs!==info.mtimeMs||current.ino!==info.ino)throw Error('처리 중 원본이 변경되었습니다. 다시 시도해 주세요.');
    const selected=best||smallest;
    const final=await uniqueCommit(selected.path,folder,path.basename(input,path.extname(input)));
    return {...selected,path:final,name:path.basename(input),preset:'target',targetBytes:Math.floor(target),targetMet:selected.after<=target,attempts,qualityLimited:!best};
  }finally{
    // mkdtemp creates only our private workspace in the selected output folder.
    if(path.dirname(path.resolve(work))===folder&&path.basename(work).startsWith('.ssenlite-target-'))await fs.rm(work,{recursive:true,force:true});
  }
}
module.exports={optimizeToTarget};
