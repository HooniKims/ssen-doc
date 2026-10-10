'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const {ModelManager,sha256}=require('../src/ai/model-manager.cjs'),{LocalAI}=require('../src/ai/local-ai.cjs');
(async()=>{const directory=path.resolve(__dirname,'../_workspace/ai-verification/models');let last=-1;const manager=new ModelManager(directory,{onChange:s=>{const step=Math.floor(s.percent/10);if(step!==last||s.phase!=='downloading'){console.log(`${s.phase} ${Math.round(s.percent)}% ${s.message}`);last=step;}}});await manager.init();const ai=new LocalAI();
try{if(!manager.installed)await manager.download();const installed=manager.info().installed;console.log('Verified model SHA256:',await sha256(manager.modelPath()));
 const results=[];for(const text of ['회의가 일찍 됬어요.','할수있어요.','오늘은 왠지 기분이 좋아요.']){const started=Date.now();const r=await ai.inspect(manager.modelPath(),text,p=>console.log('sentence',p.current,p.total),raw=>console.log('Synthetic test raw response:',raw));results.push({text,milliseconds:Date.now()-started,...r});console.log(JSON.stringify(results.at(-1)));}
 await ai.unload();if(ai.llama)await ai.llama.dispose();
 const report={date:new Date().toISOString(),model:installed,results};await fs.mkdir(path.resolve(__dirname,'../docs'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../docs/AI-VERIFICATION.json'),JSON.stringify(report,null,2));
 if(results.some(r=>r.warnings.length))throw Error('Some real inference sentences failed. See docs/AI-VERIFICATION.json.');
 console.log('Real CPU inference completed. Model retained for packaged UI verification.');
}finally{if(ai.busy)ai.cancel();await ai.unload();if(ai.llama&&!ai.llama.disposed)await ai.llama.dispose();}})().catch(e=>{console.error(e);process.exitCode=1;});
